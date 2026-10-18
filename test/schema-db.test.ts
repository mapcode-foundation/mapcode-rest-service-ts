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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureSchema } from "../src/storage/schema.ts";
import { queryReplay } from "../src/storage/replay-query.ts";
import { scanStats } from "../src/storage/stats-query.ts";

const dbUrl = process.env.TEST_DB_URL;

const TABLE_BEFORE_COUNTRY = `CREATE TABLE mapcode_request (
  ts integer NOT NULL, lat integer, lon integer, kind smallint NOT NULL,
  status "char" NOT NULL, client "char" NOT NULL, mapcode text)`;

const TABLE_WITH_ANON = `CREATE TABLE mapcode_request (
  ts integer NOT NULL, lat integer, lon integer, kind smallint NOT NULL,
  status "char" NOT NULL, client "char" NOT NULL, mapcode text,
  country text, anon boolean NOT NULL DEFAULT false)`;

describe.skipIf(!dbUrl)("schema bootstrap on Postgres (TEST_DB_URL)", () => {
  let admin: Pool;
  let pool: Pool;
  let schema: string;

  beforeEach(async () => {
    schema = `mapcode_test_${randomUUID().replaceAll("-", "")}`;
    admin = new Pool({ connectionString: dbUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: dbUrl, options: `-c search_path=${schema}` });
    const res = await pool.query("SELECT current_schema() AS s");
    expect(res.rows[0].s).toBe(schema);
  });

  afterEach(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const anonRows = async () =>
    (await scanStats(pool, 2_000_000_000))
      .filter((r) => r.tier === "all" && r.anon)
      .map((r) => ({ kind: r.kind, n: r.n }))
      .sort((a, b) => a.kind - b.kind);

  it("backfills the anon marker on successful calls only, not on the 4xx rows of Aug-Sep 2026", async () => {
    await pool.query(TABLE_BEFORE_COUNTRY);
    await pool.query(`INSERT INTO mapcode_request (ts, lat, lon, kind, status, client) VALUES
      (1000, NULL, NULL, 10, 40::int::"char", 0::int::"char"),
      (1001, NULL, NULL, 20, 44::int::"char", 0::int::"char"),
      (1002, 52000000, 5000000, 10, 20::int::"char", 0::int::"char")`);
    await pool.query("ALTER TABLE mapcode_request ADD COLUMN country text");
    await pool.query(`INSERT INTO mapcode_request (ts, lat, lon, kind, status, client, country)
      VALUES (1003, NULL, NULL, 10, 20::int::"char", 0::int::"char", 'NLD')`);

    await ensureSchema(pool);

    const cols = await queryReplay(pool, { from: 0, to: 2000, limit: 10, kinds: null });
    expect(cols.ts).toEqual([1002, 1003]);
    expect(cols.anon).toEqual([0, 1]);
    expect(await anonRows()).toEqual([{ kind: 10, n: 1 }]);
  });

  it("clears the anon marker on 4xx rows that an earlier bootstrap flagged, removing no row", async () => {
    await pool.query(TABLE_WITH_ANON);
    await pool.query(`INSERT INTO mapcode_request (ts, lat, lon, kind, status, client, country, anon) VALUES
      (1000, NULL, NULL, 10, 40::int::"char", 0::int::"char", NULL, true),
      (1001, NULL, NULL, 20, 44::int::"char", 0::int::"char", NULL, true),
      (1002, NULL, NULL, 12, 20::int::"char", 0::int::"char", 'FRA', true),
      (1003, NULL, NULL, 30, 20::int::"char", 5::int::"char", NULL, true)`);

    await ensureSchema(pool);
    await ensureSchema(pool);

    const cols = await queryReplay(pool, { from: 0, to: 2000, limit: 10, kinds: null });
    expect(cols.ts).toEqual([1002, 1003]);
    expect(cols.anon).toEqual([1, 1]);
    expect(await anonRows()).toEqual([
      { kind: 12, n: 1 },
      { kind: 30, n: 1 },
    ]);
    const count = await pool.query("SELECT count(*)::int AS n FROM mapcode_request");
    expect(count.rows[0].n).toBe(4);
  });

  it("keeps the anon flag the recorder wrote on rows from 2026-10-18 on", async () => {
    await pool.query(TABLE_WITH_ANON);
    await pool.query(`INSERT INTO mapcode_request (ts, lat, lon, kind, status, client, country, anon) VALUES
      (1792281600, NULL, NULL, 10, 50::int::"char", 0::int::"char", 'NLD', true),
      (1792281600, NULL, NULL, 11, 20::int::"char", 0::int::"char", NULL, false)`);

    await ensureSchema(pool);

    const cols = await queryReplay(pool, { from: 0, to: 2_000_000_000, limit: 10, kinds: null });
    expect(cols.kind).toEqual([10]);
    expect(cols.anon).toEqual([1]);
    expect(await anonRows()).toEqual([{ kind: 10, n: 1 }]);
  });
});
