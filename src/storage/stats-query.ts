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

import type { RecorderPool } from "./schema.ts";
import { TIERS, type StatsScanRow, type StatsTier } from "./stats-cache.ts";

// ---------------------------------------------------------------------------
// Stats SQL. The per-request path never touches the database: the stats
// endpoint is served from StatsCache. This file holds the hourly rebuild
// scan (one statement, one snapshot) and the cheap size lookup.
// ---------------------------------------------------------------------------

/** Trailing windows, newest first; keys are the JSON field names. */
export const STATS_WINDOWS = [
  { key: "1m", seconds: 60 },
  { key: "1h", seconds: 3600 },
  { key: "1d", seconds: 86400 },
  { key: "7d", seconds: 7 * 86400 },
  { key: "31d", seconds: 31 * 86400 },
  { key: "1y", seconds: 365 * 86400 },
] as const;

export interface StatsCounts {
  "1m": number;
  "1h": number;
  "1d": number;
  "7d": number;
  "31d": number;
  "1y": number;
  all: number;
}

/** One result row: the window counts for a single endpoint kind. */
export interface StatsKindCounts extends StatsCounts {
  kind: number;
}

export type StatsQueryFn = (nowEpochSeconds: number) => Promise<StatsKindCounts[]>;

/** Current storage footprint, for the stats endpoint's burn-rate block. */
export interface StorageInfo {
  databaseBytes: number;
  tableBytes: number;
  rowCount: number;
}

export type StorageQueryFn = () => Promise<StorageInfo>;

/**
 * One statement → one MVCC snapshot across all four tiers. The `all` branch
 * is the single full table scan; it runs every hour, never per request.
 * No kind filter: the cache needs kind-50 rows for the physical rowCount and
 * drops them from totals itself.
 */
export function buildStatsScanQuery(nowEpochSeconds: number): { text: string; values: unknown[] } {
  const text =
    "SELECT 'all' AS tier, kind, NULL::int AS bucket, count(*) AS n FROM mapcode_request GROUP BY kind" +
    " UNION ALL " +
    "SELECT 'hour' AS tier, kind, (ts / 3600)::int AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $1 GROUP BY kind, ts / 3600" +
    " UNION ALL " +
    "SELECT 'min' AS tier, kind, (ts / 60)::int AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $2 GROUP BY kind, ts / 60" +
    " UNION ALL " +
    "SELECT 'sec' AS tier, kind, ts AS bucket, count(*) AS n FROM mapcode_request WHERE ts >= $3 GROUP BY kind, ts";
  const values = [
    nowEpochSeconds - TIERS.hour.widthSeconds * TIERS.hour.slots,
    nowEpochSeconds - TIERS.min.widthSeconds * TIERS.min.slots,
    nowEpochSeconds - TIERS.sec.widthSeconds * TIERS.sec.slots,
  ];
  return { text, values };
}

export async function scanStats(pool: RecorderPool, nowEpochSeconds: number): Promise<StatsScanRow[]> {
  const { text, values } = buildStatsScanQuery(nowEpochSeconds);
  // count(*) is int8 → string from pg; kind (int2) and bucket (int4) stay numbers.
  const result = (await pool.query(text, values)) as {
    rows: { tier: StatsTier; kind: number; bucket: number | null; n: string }[];
  };
  return result.rows.map((row) => ({ tier: row.tier, kind: row.kind, bucket: row.bucket, n: Number(row.n) }));
}

// Catalog/stat lookups, milliseconds each. rowCount comes from StatsCache;
// the former exact count(*) was a second full table scan per call.
export const SIZES_SQL =
  "SELECT pg_database_size(current_database()) AS db_bytes," +
  " pg_total_relation_size('mapcode_request') AS table_bytes";

export async function querySizes(pool: RecorderPool): Promise<Pick<StorageInfo, "databaseBytes" | "tableBytes">> {
  // int8 sizes come back from pg as strings.
  const result = (await pool.query(SIZES_SQL)) as { rows: Record<string, string>[] };
  const row = result.rows[0];
  return { databaseBytes: Number(row.db_bytes), tableBytes: Number(row.table_bytes) };
}
