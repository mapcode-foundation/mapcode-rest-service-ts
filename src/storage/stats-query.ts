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

// ---------------------------------------------------------------------------
// The stats SELECT: one pass over mapcode_request, one FILTERed count per
// trailing window plus the unfiltered total. All rows count — non-geo rows
// exist precisely for usage stats, so no lat IS NOT NULL here.
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

// KIND.replay (src/routes/recording.ts): historical rows from before replay
// traffic stopped being recorded — meta-traffic, excluded from every window.
const REPLAY_KIND = 50;

export function buildStatsQuery(nowEpochSeconds: number): { text: string; values: unknown[] } {
  const filters = STATS_WINDOWS.map(
    (w, i) => `count(*) FILTER (WHERE ts >= $${i + 1}) AS c_${w.key}`
  );
  const text =
    `SELECT kind, ${filters.join(", ")}, count(*) AS c_all` +
    ` FROM mapcode_request WHERE kind <> ${REPLAY_KIND} GROUP BY kind`;
  const values = STATS_WINDOWS.map((w) => nowEpochSeconds - w.seconds);
  return { text, values };
}

/** Current storage footprint, for the stats endpoint's burn-rate block. */
export interface StorageInfo {
  databaseBytes: number;
  tableBytes: number;
  rowCount: number;
}

export type StorageQueryFn = () => Promise<StorageInfo>;

// pg_total_relation_size includes the BRIN index and toast. The exact count(*)
// costs one table scan, same as the per-kind aggregate — acceptable behind the
// endpoint's 60s cache.
export const STORAGE_SQL =
  "SELECT pg_database_size(current_database()) AS db_bytes," +
  " pg_total_relation_size('mapcode_request') AS table_bytes," +
  " (SELECT count(*) FROM mapcode_request) AS row_count";

export async function queryStorage(pool: RecorderPool): Promise<StorageInfo> {
  // int8 sizes/counts come back from pg as strings.
  const result = (await pool.query(STORAGE_SQL)) as { rows: Record<string, string>[] };
  const row = result.rows[0];
  return {
    databaseBytes: Number(row.db_bytes),
    tableBytes: Number(row.table_bytes),
    rowCount: Number(row.row_count),
  };
}

export async function queryStats(pool: RecorderPool, nowEpochSeconds: number): Promise<StatsKindCounts[]> {
  const { text, values } = buildStatsQuery(nowEpochSeconds);
  // count(*) is int8, which pg returns as a string; kind (int2) stays a number.
  const result = (await pool.query(text, values)) as { rows: Record<string, string | number>[] };
  return result.rows.map((row) => ({
    kind: Number(row.kind),
    "1m": Number(row.c_1m),
    "1h": Number(row.c_1h),
    "1d": Number(row.c_1d),
    "7d": Number(row.c_7d),
    "31d": Number(row.c_31d),
    "1y": Number(row.c_1y),
    all: Number(row.c_all),
  }));
}
