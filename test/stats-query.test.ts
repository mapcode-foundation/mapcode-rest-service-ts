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

import { describe, it, expect } from "vitest";
import {
  buildStatsQuery,
  queryStats,
  STORAGE_SQL,
  queryStorage,
  buildStatsScanQuery,
  scanStats,
  SIZES_SQL,
  querySizes,
} from "../src/storage/stats-query.ts";

const NOW = 1_737_100_000;

describe("buildStatsQuery", () => {
  it("builds one FILTERed aggregate per window, grouped by kind", () => {
    const { text, values } = buildStatsQuery(NOW);
    expect(text).toContain("count(*) FILTER (WHERE ts >= $1)");
    expect(text).toContain("count(*) FILTER (WHERE ts >= $6)");
    expect(text).toContain("FROM mapcode_request");
    // Historical replay-endpoint rows (KIND.replay) are meta-traffic, not API usage.
    expect(text).toContain("WHERE kind <> 50");
    expect(text).toContain("GROUP BY kind");
    expect(values).toEqual([
      NOW - 60,
      NOW - 3600,
      NOW - 86400,
      NOW - 7 * 86400,
      NOW - 31 * 86400,
      NOW - 365 * 86400,
    ]);
  });
});

describe("queryStats", () => {
  it("converts pg's int8 string counts to numbers, one row per kind", async () => {
    // pg returns count(*) (int8) as a string; kind (int2) comes back as a number.
    const rows = [
      { kind: 2, c_1m: "1", c_1h: "2", c_1d: "3", c_7d: "4", c_31d: "5", c_1y: "6", c_all: "7" },
      { kind: 10, c_1m: "0", c_1h: "0", c_1d: "1", c_7d: "1", c_31d: "1", c_1y: "1", c_all: "2" },
    ];
    let seen: { text: string; values?: unknown[] } | null = null;
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        seen = { text, values };
        return { rows };
      },
    };
    const counts = await queryStats(pool, NOW);
    expect(counts).toEqual([
      { kind: 2, "1m": 1, "1h": 2, "1d": 3, "7d": 4, "31d": 5, "1y": 6, all: 7 },
      { kind: 10, "1m": 0, "1h": 0, "1d": 1, "7d": 1, "31d": 1, "1y": 1, all: 2 },
    ]);
    expect(seen).not.toBeNull();
    expect(seen!.values).toHaveLength(6);
  });

  it("returns an empty list for an empty table", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    expect(await queryStats(pool, NOW)).toEqual([]);
  });
});

describe("queryStorage", () => {
  it("measures the database, the table, and the exact row count", async () => {
    expect(STORAGE_SQL).toContain("pg_database_size(current_database())");
    expect(STORAGE_SQL).toContain("pg_total_relation_size('mapcode_request')");
    expect(STORAGE_SQL).toContain("count(*)");
    // pg returns int8 sizes/counts as strings.
    const pool = { query: async () => ({ rows: [{ db_bytes: "8000000", table_bytes: "105600000", row_count: "2400000" }] }) };
    expect(await queryStorage(pool)).toEqual({ databaseBytes: 8_000_000, tableBytes: 105_600_000, rowCount: 2_400_000 });
  });
});

describe("buildStatsScanQuery", () => {
  it("unions the all-time, hour, minute and second tiers in one statement (one snapshot)", () => {
    const { text, values } = buildStatsScanQuery(NOW);
    expect(text.match(/UNION ALL/g)).toHaveLength(3);
    expect(text).toContain("SELECT 'all' AS tier, kind, NULL::int AS bucket, count(*) AS n FROM mapcode_request GROUP BY kind");
    expect(text).toContain("SELECT 'hour' AS tier, kind, (ts / 3600)::int AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $1 GROUP BY kind, ts / 3600");
    expect(text).toContain("SELECT 'min' AS tier, kind, (ts / 60)::int AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $2 GROUP BY kind, ts / 60");
    expect(text).toContain("SELECT 'sec' AS tier, kind, ts AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $3 GROUP BY kind, ts");
    // Historical replay rows are NOT filtered here: the cache needs them for rowCount.
    expect(text).not.toContain("kind <>");
    // Horizons = ring width × slots.
    expect(values).toEqual([NOW - 8761 * 3600, NOW - 1441 * 60, NOW - 3601]);
  });
});

describe("scanStats", () => {
  it("converts pg's int8 counts to numbers and keeps null buckets for the all tier", async () => {
    const rows = [
      { tier: "all", kind: 10, bucket: null, n: "1000" },
      { tier: "hour", kind: 10, bucket: 482527, n: "30" },
      { tier: "sec", kind: 2, bucket: NOW - 10, n: "2" },
    ];
    let seen: { text: string; values?: unknown[] } | null = null;
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        seen = { text, values };
        return { rows };
      },
    };
    expect(await scanStats(pool, NOW)).toEqual([
      { tier: "all", kind: 10, bucket: null, n: 1000 },
      { tier: "hour", kind: 10, bucket: 482527, n: 30 },
      { tier: "sec", kind: 2, bucket: NOW - 10, n: 2 },
    ]);
    expect(seen!.values).toHaveLength(3);
  });

  it("returns an empty list for an empty table", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    expect(await scanStats(pool, NOW)).toEqual([]);
  });
});

describe("querySizes", () => {
  it("measures the database and the table without counting rows", async () => {
    expect(SIZES_SQL).toContain("pg_database_size(current_database())");
    expect(SIZES_SQL).toContain("pg_total_relation_size('mapcode_request')");
    expect(SIZES_SQL).not.toContain("count(*)");
    const pool = { query: async () => ({ rows: [{ db_bytes: "8000000", table_bytes: "105600000" }] }) };
    expect(await querySizes(pool)).toEqual({ databaseBytes: 8_000_000, tableBytes: 105_600_000 });
  });
});
