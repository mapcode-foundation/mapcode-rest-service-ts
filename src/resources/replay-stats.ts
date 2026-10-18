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

import { ApiError, loggableCause } from "../errors.ts";
import { StatsNotReadyError } from "../storage/stats-service.ts";
import {
  STATS_WINDOWS,
  type StatsCounts,
  type StatsKindCounts,
  type StatsQueryFn,
  type StorageQueryFn,
} from "../storage/stats-query.ts";
import { KIND } from "../routes/recording.ts";

// ---------------------------------------------------------------------------
// handleReplayStats — framework-agnostic handler for GET /mapcode/replay/stats.
// No parameters: the windows are fixed, anchored at "now". Averages are only
// meaningful from 1d up (shorter windows are too bursty), so avgPerHour covers
// 1d..1y and skips "all" (whose span is unknown). The query returns one row
// per kind; totals are their sums, anonymised calls included, and `anon` is
// the sum of their anonymised subsets (so anon[w] <= totals[w] always).
// ---------------------------------------------------------------------------

export const STATS_CACHE_SECONDS = 60;

const AVG_WINDOWS = STATS_WINDOWS.filter((w) => w.seconds >= 86400);

/** kind code → its stable KIND name, for self-describing byKind entries. */
const KIND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(KIND).map(([name, code]) => [code, name])
);

export interface ReplayStatsResult {
  dto: Record<string, unknown>;
  cacheControl: string;
}

export async function handleReplayStats(
  nowEpochSeconds: number,
  query: StatsQueryFn,
  storageQuery: StorageQueryFn
): Promise<ReplayStatsResult> {
  let rows;
  let storageInfo;
  try {
    [rows, storageInfo] = await Promise.all([query(nowEpochSeconds), storageQuery()]);
  } catch (err) {
    // Until the first rebuild scan completes there are no truthful numbers.
    if (err instanceof StatsNotReadyError) throw new ApiError(503, "Service Unavailable");
    // Raw pg error text (hostnames, usernames, ...) never reaches the response
    // body; as the cause, it reaches only the log.
    throw new ApiError(500, "Internal Server Error", { cause: loggableCause(err) });
  }
  const sum = (pick: (row: StatsKindCounts) => StatsCounts): StatsCounts => {
    const acc: StatsCounts = { "1m": 0, "1h": 0, "1d": 0, "7d": 0, "31d": 0, "1y": 0, all: 0 };
    for (const row of rows) {
      const counts = pick(row);
      for (const key of Object.keys(acc) as (keyof StatsCounts)[]) acc[key] += counts[key];
    }
    return acc;
  };
  const totals = sum((row) => row);
  const anon = sum((row) => row.anon);
  const avgPerHour: Record<string, number> = {};
  for (const { key, seconds } of AVG_WINDOWS) {
    avgPerHour[key] = Math.round((totals[key] / (seconds / 3600)) * 10) / 10;
  }
  const byKind = [...rows]
    .sort((a, b) => b.all - a.all)
    .map(({ kind, anon: anonCounts, ...counts }) => ({ kind, name: KIND_NAMES[kind] ?? "unknown", totals: counts, anon: anonCounts }));
  // Burn rate: last-day event count times the average on-disk footprint per
  // row (indexes included). rowCount is the physical row count — it can exceed
  // totals.all because historical replay rows still occupy space.
  const bytesPerRowExact = storageInfo.rowCount > 0 ? storageInfo.tableBytes / storageInfo.rowCount : 0;
  const storage = {
    ...storageInfo,
    bytesPerRow: Math.round(bytesPerRowExact),
    bytesPerDay: Math.round(bytesPerRowExact * totals["1d"]),
  };
  return {
    dto: { now: nowEpochSeconds, totals, anon, avgPerHour, byKind, storage },
    cacheControl: `private, max-age=${STATS_CACHE_SECONDS}`,
  };
}
