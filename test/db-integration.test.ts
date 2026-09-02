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
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { ensureSchema } from "../src/storage/schema.ts";
import { createRequestRecorder } from "../src/storage/request-recorder.ts";
import { queryReplay } from "../src/storage/replay-query.ts";
import { queryStats } from "../src/storage/stats-query.ts";

const dbUrl = process.env.TEST_DB_URL;

describe.skipIf(!dbUrl)("Postgres integration (TEST_DB_URL)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await pool.query("DROP TABLE IF EXISTS mapcode_request");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("bootstraps the schema idempotently", async () => {
    await ensureSchema(pool);
    await ensureSchema(pool); // second run must not throw
    const res = await pool.query("SELECT count(*)::int AS n FROM mapcode_request");
    expect(res.rows[0].n).toBe(0);
  });

  it("round-trips recorder inserts into the replay query", async () => {
    const recorder = createRequestRecorder(pool);
    recorder.record({ ts: 1000, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 1, mapcode: null });
    recorder.record({ ts: 1001, kind: 20, lat: 48858370, lon: 2294481, status: 20, client: 0, mapcode: "NLD 49.4V" });
    recorder.record({ ts: 1002, kind: 1, lat: null, lon: null, status: 20, client: 0, mapcode: null }); // non-geo
    await recorder.close();

    const cols = await queryReplay(pool, { from: 1000, to: 2000, limit: 10, kinds: null });
    expect(cols.ts).toEqual([1000, 1001]); // the non-geo row is filtered by lat IS NOT NULL
    expect(cols.kind).toEqual([10, 20]);
    expect(cols.lat).toEqual([52376514, 48858370]);
    expect(cols.status).toEqual([20, 20]); // "char" round-trips back to int
    expect(cols.client).toEqual([1, 0]);
    expect(cols.mapcode).toEqual([null, "NLD 49.4V"]);
  });

  it("filters by kind", async () => {
    const cols = await queryReplay(pool, { from: 1000, to: 2000, limit: 10, kinds: [20] });
    expect(cols.kind).toEqual([20]);
  });

  it("counts events per stats window, non-geo rows included, replay rows excluded", async () => {
    const now = Math.floor(Date.now() / 1000);
    const recorder = createRequestRecorder(pool);
    recorder.record({ ts: now, kind: 10, lat: null, lon: null, status: 20, client: 0, mapcode: null });
    recorder.record({ ts: now - 7200, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 1, mapcode: null });
    recorder.record({ ts: now, kind: 50, lat: null, lon: null, status: 20, client: 0, mapcode: null }); // historical replay row
    await recorder.close();

    const counts = await queryStats(pool, now);
    expect(counts["1m"]).toBe(1);
    expect(counts["1h"]).toBe(1);
    expect(counts["1d"]).toBe(2);
    expect(counts.all).toBe(5); // 3 rows from the replay round-trip test + these 2; the kind-50 row is excluded
  });

  it("uses the BRIN index for the range scan", async () => {
    const client = await pool.connect();
    try {
      await client.query("SET enable_seqscan = off");
      const res = await client.query(
        "EXPLAIN (FORMAT JSON) SELECT ts FROM mapcode_request WHERE ts >= 1000 AND ts < 2000 AND lat IS NOT NULL ORDER BY ts LIMIT 10"
      );
      expect(JSON.stringify(res.rows[0])).toContain("mapcode_request_ts_brin");
    } finally {
      await client.query("RESET enable_seqscan");
      client.release();
    }
  });
});
