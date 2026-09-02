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
import { STATS_WINDOWS, type StatsQueryFn } from "../storage/stats-query.ts";

// ---------------------------------------------------------------------------
// handleReplayStats — framework-agnostic handler for GET /mapcode/replay/stats.
// No parameters: the windows are fixed, anchored at "now". Averages are only
// meaningful from 1d up (shorter windows are too bursty), so avgPerHour covers
// 1d..1y and skips "all" (whose span is unknown).
// ---------------------------------------------------------------------------

export const STATS_CACHE_SECONDS = 60;

const AVG_WINDOWS = STATS_WINDOWS.filter((w) => w.seconds >= 86400);

export interface ReplayStatsResult {
  dto: Record<string, unknown>;
  cacheControl: string;
}

export async function handleReplayStats(nowEpochSeconds: number, query: StatsQueryFn): Promise<ReplayStatsResult> {
  let totals;
  try {
    totals = await query(nowEpochSeconds);
  } catch {
    // Never let raw pg error text (hostnames, usernames, ...) reach the response body.
    throw new ApiError(500, "Internal Server Error");
  }
  const avgPerHour: Record<string, number> = {};
  for (const { key, seconds } of AVG_WINDOWS) {
    avgPerHour[key] = Math.round((totals[key] / (seconds / 3600)) * 10) / 10;
  }
  return {
    dto: { now: nowEpochSeconds, totals, avgPerHour },
    cacheControl: `private, max-age=${STATS_CACHE_SECONDS}`,
  };
}
