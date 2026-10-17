// Copyright (C) 2026, Stichting Mapcode Foundation (http://www.mapcode.com)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Opt-in integration tests against a real Postgres. Skipped unless
// TEST_DB_URL is set. Local run:
//   docker run --rm -d --name mapcode-test-pg -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:16
//   TEST_DB_URL=postgres://postgres:test@localhost:5433/postgres npx vitest run test/db-integration.test.ts
//   docker stop mapcode-test-pg
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Pool } from "pg";
import { ensureSchema, ensureBtreeIndex } from "../src/storage/schema.ts";
import { createRequestRecorder, type RecordedRequest } from "../src/storage/request-recorder.ts";
import { queryReplay } from "../src/storage/replay-query.ts";
import { scanStats, querySizes } from "../src/storage/stats-query.ts";
import { StatsCache } from "../src/storage/stats-cache.ts";

const dbUrl = process.env.TEST_DB_URL;
const schema = `mapcode_test_${randomBytes(6).toString("hex")}`;

const GEO_ENCODE: RecordedRequest = { ts: 1000, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 1, mapcode: null, country: null, anon: false };
const DECODE: RecordedRequest = { ts: 1001, kind: 20, lat: 48858370, lon: 2294481, status: 20, client: 0, mapcode: "NLD 49.4V", country: null, anon: false };
const NON_GEO: RecordedRequest = { ts: 1002, kind: 1, lat: null, lon: null, status: 20, client: 0, mapcode: null, country: null, anon: false };
const ANON_ENCODE: RecordedRequest = { ts: 1003, kind: 10, lat: null, lon: null, status: 20, client: 5, mapcode: null, country: "NLD", anon: true };
const ANON_NON_GEO: RecordedRequest = { ts: 1004, kind: 30, lat: null, lon: null, status: 20, client: 5, mapcode: null, country: null, anon: true };
const ANON_DECODE: RecordedRequest = { ts: 1005, kind: 20, lat: null, lon: null, status: 20, client: 0, mapcode: null, country: "FRA", anon: true };

describe.skipIf(!dbUrl)("Postgres integration (TEST_DB_URL)", () => {
  let pool: Pool;

  async function record(...rows: RecordedRequest[]): Promise<void> {
    const recorder = createRequestRecorder(pool);
    for (const row of rows) recorder.record(row);
    await recorder.close();
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    const res = await pool.query("SELECT current_schema() AS name");
    if (res.rows[0].name !== schema) {
      throw new Error(`search_path not applied: current_schema() is ${res.rows[0].name}, expected ${schema}`);
    }
  });

  beforeEach(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
  });

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool?.end();
  });

  it("bootstraps the schema idempotently", async () => {
    await ensureSchema(pool);
    await ensureSchema(pool); // second run must not throw
    const res = await pool.query("SELECT count(*)::int AS n FROM mapcode_request");
    expect(res.rows[0].n).toBe(0);
  });

  it("round-trips recorder inserts into the replay query", async () => {
    await record(GEO_ENCODE, DECODE, NON_GEO);

    const cols = await queryReplay(pool, { from: 1000, to: 2000, limit: 10, kinds: null });
    expect(cols.ts).toEqual([1000, 1001]); // the full non-geo row is filtered out (lat NULL, not anon)
    expect(cols.kind).toEqual([10, 20]);
    expect(cols.lat).toEqual([52376514, 48858370]);
    expect(cols.status).toEqual([20, 20]); // "char" round-trips back to int
    expect(cols.client).toEqual([1, 0]);
    expect(cols.mapcode).toEqual([null, "NLD 49.4V"]);
    expect(cols.country).toEqual([null, null]);
    expect(cols.anon).toEqual([0, 0]); // boolean round-trips to 0/1
  });

  it("stores anonymised rows with a country and anon, and returns them from replay without coords", async () => {
    await record(GEO_ENCODE, DECODE, NON_GEO, ANON_ENCODE, ANON_NON_GEO);

    const res = await pool.query("SELECT kind, client::int AS client, country, anon FROM mapcode_request WHERE ts = 1003");
    expect(res.rows).toEqual([{ kind: 10, client: 5, country: "NLD", anon: true }]);
    const geo = await pool.query("SELECT count(*)::int AS n FROM mapcode_request WHERE country IS NULL");
    expect(geo.rows[0].n).toBe(4);
    const cols = await queryReplay(pool, { from: 1000, to: 2000, limit: 10, kinds: null });
    // Anonymised rows (geo and non-geo) appear; the full non-geo row at ts=1002 still does not.
    expect(cols.ts).toEqual([1000, 1001, 1003, 1004]);
    expect(cols.lat).toEqual([52376514, 48858370, null, null]);
    expect(cols.country).toEqual([null, null, "NLD", null]);
    expect(cols.anon).toEqual([0, 0, 1, 1]);
  });

  it("backfills pre-marker anonymised rows on bootstrap, leaving geo rows with a point and full non-geo rows alone", async () => {
    // Simulate a row written between the country column and the anon marker:
    // a geo kind without a point, anon still at its default.
    await record(GEO_ENCODE, DECODE, NON_GEO);
    await pool.query("INSERT INTO mapcode_request (ts,lat,lon,kind,status,client,mapcode,country) VALUES (1005,NULL,NULL,20,20::int::\"char\",0::int::\"char\",NULL,'FRA')");
    await ensureSchema(pool);
    const res = await pool.query("SELECT ts, anon FROM mapcode_request ORDER BY ts");
    expect(res.rows).toEqual([
      { ts: GEO_ENCODE.ts, anon: false },
      { ts: DECODE.ts, anon: false },
      { ts: NON_GEO.ts, anon: false },
      { ts: 1005, anon: true },
    ]);
  });

  it("filters by kind, anonymised rows included", async () => {
    await record(GEO_ENCODE, DECODE, NON_GEO, ANON_ENCODE, ANON_NON_GEO, ANON_DECODE);
    const cols = await queryReplay(pool, { from: 1000, to: 2000, limit: 10, kinds: [20] });
    expect(cols.ts).toEqual([DECODE.ts, ANON_DECODE.ts]);
    expect(cols.kind).toEqual([20, 20]);
    expect(cols.anon).toEqual([0, 1]);
  });

  it("rebuilds the stats cache from the tiered scan, non-geo rows included, replay rows in rowCount only", async () => {
    const now = Math.floor(Date.now() / 1000);
    await record(
      GEO_ENCODE,
      DECODE,
      NON_GEO,
      ANON_ENCODE,
      ANON_NON_GEO,
      ANON_DECODE,
      { ts: now, kind: 10, lat: null, lon: null, status: 20, client: 0, mapcode: null, country: null, anon: false },
      { ts: now - 7200, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 1, mapcode: null, country: null, anon: false },
      { ts: now, kind: 50, lat: null, lon: null, status: 20, client: 0, mapcode: null, country: null, anon: false } // historical replay row
    );

    const snap = StatsCache.fromScan(await scanStats(pool, now)).snapshot(now);
    const total = (key: "1m" | "1h" | "1d" | "all") => snap.rows.reduce((sum, r) => sum + r[key], 0);
    expect(total("1m")).toBe(1);
    expect(total("1h")).toBe(1);
    expect(total("1d")).toBe(2);
    expect(total("all")).toBe(8); // 3 replay round-trip rows + 3 anonymised rows + these 2; the kind-50 row is excluded
    expect(snap.rows.find((r) => r.kind === 10)?.all).toBe(4); // ts=1000 round-trip row + ts=1003 anonymised row + these 2
    expect(snap.rows.find((r) => r.kind === 10)?.anon.all).toBe(1); // only the ts=1003 row
    expect(snap.rows.find((r) => r.kind === 20)?.anon.all).toBe(1);
    expect(snap.rows.find((r) => r.kind === 30)?.anon.all).toBe(1); // the non-geo anonymised ts=1004 row
    expect(snap.rows.some((r) => r.kind === 50)).toBe(false);
    expect(snap.rowCount).toBe(9); // all rows, the kind-50 one included
  });

  it("measures storage sizes without a row count", async () => {
    await record(GEO_ENCODE);
    const info = await querySizes(pool);
    expect(info.tableBytes).toBeGreaterThan(0);
    expect(info.databaseBytes).toBeGreaterThan(info.tableBytes);
    expect(info).not.toHaveProperty("rowCount");
  });

  it("uses the ts btree for the ordered range scan", async () => {
    await ensureSchema(pool);
    await ensureBtreeIndex(pool);
    const client = await pool.connect();
    try {
      await client.query("SET enable_seqscan = off");
      const res = await client.query(
        "EXPLAIN (FORMAT JSON) SELECT ts FROM mapcode_request WHERE ts >= 1000 AND ts < 2000 AND (lat IS NOT NULL OR anon) ORDER BY ts LIMIT 10"
      );
      expect(JSON.stringify(res.rows[0])).toContain("mapcode_request_ts_btree");
    } finally {
      await client.query("RESET enable_seqscan");
      client.release();
    }
  });
});
