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
import type { StatsKindCounts } from "../src/storage/stats-query.ts";

const NOW = 1_737_100_000;
// Two kinds whose window sums equal the totals asserted below.
const ROWS: StatsKindCounts[] = [
  { kind: 10, "1m": 2, "1h": 41, "1d": 121, "7d": 100, "31d": 2, "1y": 3, all: 1000 },
  { kind: 2, "1m": 10, "1h": 300, "1d": 5000, "7d": 40000, "31d": 160000, "1y": 1900000, all: 2399000 },
];

describe("handleReplayStats", () => {
  it("sums totals across kinds, derives avg events/hr for 1d..1y, and names each kind", async () => {
    const seen: number[] = [];
    const { dto, cacheControl } = await handleReplayStats(NOW, async (now) => {
      seen.push(now);
      return ROWS;
    });
    expect(seen).toEqual([NOW]);
    expect(dto).toEqual({
      now: NOW,
      totals: { "1m": 12, "1h": 341, "1d": 5121, "7d": 40100, "31d": 160002, "1y": 1900003, all: 2400000 },
      avgPerHour: {
        "1d": 213.4, // 5121 / 24
        "7d": 238.7, // 40100 / 168
        "31d": 215.1, // 160002 / 744
        "1y": 216.9, // 1900003 / 8760
      },
      // Sorted by all-time count, descending; kind names from KIND in recording.ts.
      byKind: [
        {
          kind: 2,
          name: "status",
          totals: { "1m": 10, "1h": 300, "1d": 5000, "7d": 40000, "31d": 160000, "1y": 1900000, all: 2399000 },
        },
        {
          kind: 10,
          name: "codes",
          totals: { "1m": 2, "1h": 41, "1d": 121, "7d": 100, "31d": 2, "1y": 3, all: 1000 },
        },
      ],
    });
    expect(cacheControl).toBe(`private, max-age=${STATS_CACHE_SECONDS}`);
  });

  it("returns zero totals and an empty byKind for an empty database", async () => {
    const { dto } = await handleReplayStats(NOW, async () => []);
    expect(dto).toEqual({
      now: NOW,
      totals: { "1m": 0, "1h": 0, "1d": 0, "7d": 0, "31d": 0, "1y": 0, all: 0 },
      avgPerHour: { "1d": 0, "7d": 0, "31d": 0, "1y": 0 },
      byKind: [],
    });
  });

  it("labels a kind missing from the vocabulary as unknown", async () => {
    const { dto } = await handleReplayStats(NOW, async () => [
      { kind: 77, "1m": 0, "1h": 0, "1d": 0, "7d": 0, "31d": 0, "1y": 0, all: 1 },
    ]);
    expect((dto.byKind as { kind: number; name: string }[])[0]).toMatchObject({ kind: 77, name: "unknown" });
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
