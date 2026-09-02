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

import { ApiError } from "../errors.ts";
import { STATS_WINDOWS, type StatsCounts, type StatsQueryFn } from "../storage/stats-query.ts";
import { KIND } from "../routes/recording.ts";

// ---------------------------------------------------------------------------
// handleReplayStats — framework-agnostic handler for GET /mapcode/replay/stats.
// No parameters: the windows are fixed, anchored at "now". Averages are only
// meaningful from 1d up (shorter windows are too bursty), so avgPerHour covers
// 1d..1y and skips "all" (whose span is unknown). The query returns one row
// per kind; totals are their sums.
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

export async function handleReplayStats(nowEpochSeconds: number, query: StatsQueryFn): Promise<ReplayStatsResult> {
  let rows;
  try {
    rows = await query(nowEpochSeconds);
  } catch {
    // Never let raw pg error text (hostnames, usernames, ...) reach the response body.
    throw new ApiError(500, "Internal Server Error");
  }
  const sum = (key: keyof StatsCounts) => rows.reduce((acc, row) => acc + row[key], 0);
  const totals: StatsCounts = {
    "1m": sum("1m"),
    "1h": sum("1h"),
    "1d": sum("1d"),
    "7d": sum("7d"),
    "31d": sum("31d"),
    "1y": sum("1y"),
    all: sum("all"),
  };
  const avgPerHour: Record<string, number> = {};
  for (const { key, seconds } of AVG_WINDOWS) {
    avgPerHour[key] = Math.round((totals[key] / (seconds / 3600)) * 10) / 10;
  }
  const byKind = [...rows]
    .sort((a, b) => b.all - a.all)
    .map(({ kind, ...counts }) => ({ kind, name: KIND_NAMES[kind] ?? "unknown", totals: counts }));
  return {
    dto: { now: nowEpochSeconds, totals, avgPerHour, byKind },
    cacheControl: `private, max-age=${STATS_CACHE_SECONDS}`,
  };
}
