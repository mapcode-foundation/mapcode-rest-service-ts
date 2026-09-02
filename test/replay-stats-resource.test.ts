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
import { handleReplayStats, STATS_CACHE_SECONDS } from "../src/resources/replay-stats.ts";
import { ApiError } from "../src/errors.ts";
import type { StatsCounts } from "../src/storage/stats-query.ts";

const NOW = 1_737_100_000;
const COUNTS: StatsCounts = { "1m": 12, "1h": 341, "1d": 5121, "7d": 40100, "31d": 160002, "1y": 1900003, all: 2400000 };

describe("handleReplayStats", () => {
  it("returns totals verbatim and avg events/hr for 1d..1y, rounded to 1 decimal", async () => {
    const seen: number[] = [];
    const { dto, cacheControl } = await handleReplayStats(NOW, async (now) => {
      seen.push(now);
      return COUNTS;
    });
    expect(seen).toEqual([NOW]);
    expect(dto).toEqual({
      now: NOW,
      totals: COUNTS,
      avgPerHour: {
        "1d": 213.4, // 5121 / 24
        "7d": 238.7, // 40100 / 168
        "31d": 215.1, // 160002 / 744
        "1y": 216.9, // 1900003 / 8760
      },
    });
    expect(cacheControl).toBe(`private, max-age=${STATS_CACHE_SECONDS}`);
  });

  it("masks query failures as a plain 500 (no pg error text)", async () => {
    await expect(
      handleReplayStats(NOW, async () => {
        throw new Error("connection to host db-internal.example failed");
      })
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.httpStatus === 500 && !err.message.includes("db-internal")
    );
  });
});
