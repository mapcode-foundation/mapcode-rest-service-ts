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

import { CounterRing } from "./counter-ring.ts";
import { STATS_WINDOWS, type StatsKindCounts } from "./stats-query.ts";

// ---------------------------------------------------------------------------
// StatsCache — per-kind all-time counter plus three CounterRings. Answers
// every /mapcode/replay/stats window without touching the database. Rebuilt
// from one scan (fromScan) every hour; fed per persisted event in between.
// Correct only because the event log is append-only (see schema.ts).
// ---------------------------------------------------------------------------

export interface StatsEvent {
  ts: number;
  kind: number;
}

export type StatsTier = "all" | "hour" | "min" | "sec";

/** One row of the rebuild scan (stats-query.ts). bucket is null for the all tier. */
export interface StatsScanRow {
  tier: StatsTier;
  kind: number;
  bucket: number | null;
  n: number;
}

/** Bucket width × slot count per ring tier; horizon = width × slots. */
// Slots = W / width + 1: `ts >= now - W` spans W/width + 1 distinct buckets, and
// with one slot fewer the oldest and newest bucket would evict each other.
export const TIERS = {
  sec: { widthSeconds: 1, slots: 3601 }, // 1 h horizon: 1m, 1h exact
  min: { widthSeconds: 60, slots: 1441 }, // 1 d horizon: 1d, minute-aligned
  hour: { widthSeconds: 3600, slots: 8761 }, // 365 d horizon: 7d, 31d, 1y, hour-aligned
} as const satisfies Record<Exclude<StatsTier, "all">, { widthSeconds: number; slots: number }>;

/** Which ring answers which window. */
const WINDOW_TIER: Record<(typeof STATS_WINDOWS)[number]["key"], Exclude<StatsTier, "all">> = {
  "1m": "sec",
  "1h": "sec",
  "1d": "min",
  "7d": "hour",
  "31d": "hour",
  "1y": "hour",
};

// KIND.replay (src/routes/recording.ts): historical meta-traffic rows. They
// occupy disk (rowCount) but are not API usage (totals).
const REPLAY_KIND = 50;

interface KindCounters {
  all: number;
  sec: CounterRing;
  min: CounterRing;
  hour: CounterRing;
}

function newKindCounters(): KindCounters {
  return {
    all: 0,
    sec: new CounterRing(TIERS.sec.widthSeconds, TIERS.sec.slots),
    min: new CounterRing(TIERS.min.widthSeconds, TIERS.min.slots),
    hour: new CounterRing(TIERS.hour.widthSeconds, TIERS.hour.slots),
  };
}

export class StatsCache {
  private readonly kinds = new Map<number, KindCounters>();

  private counters(kind: number): KindCounters {
    let c = this.kinds.get(kind);
    if (c === undefined) {
      c = newKindCounters();
      this.kinds.set(kind, c);
    }
    return c;
  }

  /** Build a cache from the rebuild scan. Row order is irrelevant. */
  static fromScan(rows: readonly StatsScanRow[]): StatsCache {
    const cache = new StatsCache();
    for (const row of rows) {
      const c = cache.counters(row.kind);
      if (row.tier === "all") {
        c.all += row.n;
      } else if (row.bucket !== null) {
        const ring = c[row.tier];
        ring.add(row.bucket * ring.widthSeconds, row.n);
      }
    }
    return cache;
  }

  /** Count one persisted event. */
  add(e: StatsEvent): void {
    const c = this.counters(e.kind);
    c.all += 1;
    c.sec.add(e.ts);
    c.min.add(e.ts);
    c.hour.add(e.ts);
  }

  /** Per-kind window counts (kind 50 excluded, ascending kind) and the physical row count. */
  snapshot(now: number): { rows: StatsKindCounts[]; rowCount: number } {
    const rows: StatsKindCounts[] = [];
    let rowCount = 0;
    for (const kind of [...this.kinds.keys()].sort((a, b) => a - b)) {
      const c = this.kinds.get(kind)!;
      rowCount += c.all;
      if (kind === REPLAY_KIND) continue;
      const row = { kind, all: c.all } as StatsKindCounts;
      for (const { key, seconds } of STATS_WINDOWS) {
        row[key] = c[WINDOW_TIER[key]].count(now - seconds, now);
      }
      rows.push(row);
    }
    return { rows, rowCount };
  }
}
