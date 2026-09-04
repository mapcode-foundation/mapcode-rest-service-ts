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
import { StatsCache, TIERS, type StatsScanRow } from "../src/storage/stats-cache.ts";

const NOW = 1_737_100_000;

function rowsFor(now: number, kind: number, cache: StatsCache) {
  return cache.snapshot(now).rows.find((r) => r.kind === kind);
}

describe("TIERS", () => {
  it("matches the design table", () => {
    // W / width + 1 slots: `ts >= now - W` spans W/width + 1 distinct buckets.
    expect(TIERS).toEqual({
      sec: { widthSeconds: 1, slots: 3601 },
      min: { widthSeconds: 60, slots: 1441 },
      hour: { widthSeconds: 3600, slots: 8761 },
    });
  });
});

describe("StatsCache.add + snapshot", () => {
  it("counts a fresh event in every window and in all", () => {
    const cache = StatsCache.fromScan([]);
    cache.add({ ts: NOW, kind: 10 });
    expect(rowsFor(NOW, 10, cache)).toEqual({ kind: 10, "1m": 1, "1h": 1, "1d": 1, "7d": 1, "31d": 1, "1y": 1, all: 1 });
  });

  it("ages events out of the exact second-tier windows", () => {
    const cache = StatsCache.fromScan([]);
    cache.add({ ts: NOW, kind: 10 }); // newest second — must not evict the oldest one below
    cache.add({ ts: NOW - 60, kind: 10 }); // exactly 60 s old: SQL `ts >= now - 60` includes it
    cache.add({ ts: NOW - 61, kind: 10 }); // 61 s old: out of 1m, in 1h
    cache.add({ ts: NOW - 3600, kind: 10 }); // exactly 1 h old: in 1h (3601 slots keep it apart from NOW)
    cache.add({ ts: NOW - 3601, kind: 10 }); // out of 1h, in 1d
    const row = rowsFor(NOW, 10, cache)!;
    expect(row["1m"]).toBe(2);
    expect(row["1h"]).toBe(4);
    expect(row["1d"]).toBe(5);
  });

  it("aligns the day window down to the minute and the long windows down to the hour", () => {
    const now = 1_737_100_000; // not on a minute/hour boundary: 1737100000 % 3600 = 2800
    const cache = StatsCache.fromScan([]);
    // 1d edge: now - 86400 = 1737013600, whose minute bucket starts at 1737013560.
    cache.add({ ts: 1_737_013_560, kind: 10 }); // in the aligned-down 1d window
    cache.add({ ts: 1_737_013_559, kind: 10 }); // previous minute → out of 1d, in 7d
    // 7d edge: now - 604800 = 1736495200, whose hour bucket starts at 1736492400.
    cache.add({ ts: 1_736_492_400, kind: 10 }); // in the aligned-down 7d window
    cache.add({ ts: 1_736_492_399, kind: 10 }); // previous hour → out of 7d, in 31d
    const row = rowsFor(now, 10, cache)!;
    expect(row["1d"]).toBe(1);
    expect(row["7d"]).toBe(3);
    expect(row["31d"]).toBe(4);
    expect(row["1y"]).toBe(4);
    expect(row.all).toBe(4);
  });

  it("excludes historical replay rows (kind 50) from totals but counts them in rowCount", () => {
    const cache = StatsCache.fromScan([]);
    cache.add({ ts: NOW, kind: 50 });
    cache.add({ ts: NOW, kind: 10 });
    const snap = cache.snapshot(NOW);
    expect(snap.rows.map((r) => r.kind)).toEqual([10]);
    expect(snap.rowCount).toBe(2);
  });

  it("keeps all-time counts for events older than every ring horizon", () => {
    const cache = StatsCache.fromScan([]);
    cache.add({ ts: NOW - 2 * 365 * 86400, kind: 10 });
    expect(rowsFor(NOW, 10, cache)).toEqual({ kind: 10, "1m": 0, "1h": 0, "1d": 0, "7d": 0, "31d": 0, "1y": 0, all: 1 });
  });

  it("returns kinds in ascending kind order", () => {
    const cache = StatsCache.fromScan([]);
    cache.add({ ts: NOW, kind: 20 });
    cache.add({ ts: NOW, kind: 2 });
    expect(cache.snapshot(NOW).rows.map((r) => r.kind)).toEqual([2, 20]);
  });
});

describe("StatsCache.fromScan", () => {
  it("rebuilds every tier from scan rows; bucket ids are per-tier", () => {
    // Fixture tiers are deliberately disjoint (a real scan lists a recent event
    // in all three) so each ring is shown answering only its own windows.
    const hourBucket = Math.floor((NOW - 7200) / 3600); // two hours ago
    const minBucket = Math.floor((NOW - 120) / 60); // two minutes ago
    const rows: StatsScanRow[] = [
      { tier: "all", kind: 10, bucket: null, n: 1000 },
      { tier: "all", kind: 50, bucket: null, n: 7 },
      { tier: "hour", kind: 10, bucket: hourBucket, n: 30 },
      { tier: "min", kind: 10, bucket: minBucket, n: 5 },
      { tier: "sec", kind: 10, bucket: NOW - 10, n: 2 },
    ];
    const snap = StatsCache.fromScan(rows).snapshot(NOW);
    expect(snap.rowCount).toBe(1007);
    expect(snap.rows).toEqual([
      { kind: 10, "1m": 2, "1h": 2, "1d": 5, "7d": 30, "31d": 30, "1y": 30, all: 1000 },
    ]);
  });

  it("applies incremental adds on top of a scan", () => {
    const cache = StatsCache.fromScan([{ tier: "all", kind: 10, bucket: null, n: 5 }]);
    cache.add({ ts: NOW, kind: 10 });
    expect(rowsFor(NOW, 10, cache)!.all).toBe(6);
  });
});
