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
import { STATS_WINDOWS, type StatsCounts, type StatsKindCounts } from "./stats-query.ts";

// ---------------------------------------------------------------------------
// StatsCache — per kind, two sets of {all-time counter + three CounterRings}:
// one for fully recorded calls, one for anonymised (allowLog=false) ones.
// Answers every /mapcode/replay/stats window without touching the database.
// Rebuilt from one scan (fromScan) every hour; fed per persisted event in
// between. Correct only because the event log is append-only (see schema.ts).
// ---------------------------------------------------------------------------

export interface StatsEvent {
  ts: number;
  kind: number;
  /** True for an anonymised (allowLog=false) row. */
  anon: boolean;
}

export type StatsTier = "all" | "hour" | "min" | "sec";

/** One row of the rebuild scan (stats-query.ts), per (kind, anon). bucket is null for the all tier. */
export interface StatsScanRow {
  tier: StatsTier;
  kind: number;
  anon: boolean;
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

/** All-time counter plus the three ring tiers. */
interface Rings {
  all: number;
  sec: CounterRing;
  min: CounterRing;
  hour: CounterRing;
}

/** Per kind: fully recorded calls and anonymised ones, counted apart. */
interface KindCounters {
  full: Rings;
  anon: Rings;
}

function newRings(): Rings {
  return {
    all: 0,
    sec: new CounterRing(TIERS.sec.widthSeconds, TIERS.sec.slots),
    min: new CounterRing(TIERS.min.widthSeconds, TIERS.min.slots),
    hour: new CounterRing(TIERS.hour.widthSeconds, TIERS.hour.slots),
  };
}

function windowCounts(rings: Rings, now: number): StatsCounts {
  const counts = { all: rings.all } as StatsCounts;
  for (const { key, seconds } of STATS_WINDOWS) {
    counts[key] = rings[WINDOW_TIER[key]].count(now - seconds, now);
  }
  return counts;
}

export class StatsCache {
  private readonly kinds = new Map<number, KindCounters>();

  private rings(kind: number, anon: boolean): Rings {
    let c = this.kinds.get(kind);
    if (c === undefined) {
      c = { full: newRings(), anon: newRings() };
      this.kinds.set(kind, c);
    }
    return anon ? c.anon : c.full;
  }

  /** Build a cache from the rebuild scan. Row order is irrelevant. */
  static fromScan(rows: readonly StatsScanRow[]): StatsCache {
    const cache = new StatsCache();
    for (const row of rows) {
      const r = cache.rings(row.kind, row.anon);
      if (row.tier === "all") {
        r.all += row.n;
      } else if (row.bucket !== null) {
        const ring = r[row.tier];
        ring.add(row.bucket * ring.widthSeconds, row.n);
      }
    }
    return cache;
  }

  /** Count one persisted event. */
  add(e: StatsEvent): void {
    const r = this.rings(e.kind, e.anon);
    r.all += 1;
    r.sec.add(e.ts);
    r.min.add(e.ts);
    r.hour.add(e.ts);
  }

  /**
   * Per-kind window counts (kind 50 excluded, ascending kind) and the physical
   * row count. A kind's counts are full + anon; its `anon` block is the subset.
   */
  snapshot(now: number): { rows: StatsKindCounts[]; rowCount: number } {
    const rows: StatsKindCounts[] = [];
    let rowCount = 0;
    for (const kind of [...this.kinds.keys()].sort((a, b) => a - b)) {
      const c = this.kinds.get(kind)!;
      rowCount += c.full.all + c.anon.all;
      if (kind === REPLAY_KIND) continue;
      const full = windowCounts(c.full, now);
      const anon = windowCounts(c.anon, now);
      const row = { kind, anon } as StatsKindCounts;
      for (const key of Object.keys(full) as (keyof StatsCounts)[]) {
        row[key] = full[key] + anon[key];
      }
      rows.push(row);
    }
    return { rows, rowCount };
  }
}
