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

import { StatsCache, type StatsEvent, type StatsScanRow } from "./stats-cache.ts";
import type { StatsKindCounts } from "./stats-query.ts";

// ---------------------------------------------------------------------------
// StatsService — owns the StatsCache. Feeds it per persisted batch; rebuilds
// it from a scan at startup and every 6 hours (5 min after a failure). A
// journal bridges the gap between a scan's snapshot and its result arriving.
// ---------------------------------------------------------------------------

export const RECALC_INTERVAL_MS = 6 * 3600 * 1000;
export const RECALC_RETRY_MS = 5 * 60 * 1000;

/** Thrown by rows()/rowCount() until the first scan has completed. */
export class StatsNotReadyError extends Error {
  constructor() {
    super("stats cache not ready");
    this.name = new.target.name;
  }
}

export interface StatsServiceOptions {
  recalcIntervalMs?: number;
  retryMs?: number;
  warn?: (message: string) => void;
  /** Epoch seconds; injectable for tests. */
  now?: () => number;
}

export interface StatsService {
  /** Recorder callback: count rows that reached the database. */
  onPersisted(batch: readonly StatsEvent[]): void;
  /** Per-kind window counts at `now`. Throws StatsNotReadyError before the first scan. */
  rows(now: number): StatsKindCounts[];
  /** Physical row count (kind 50 included). Throws StatsNotReadyError before the first scan. */
  rowCount(): number;
  /** Rebuild from a scan now; joins an in-flight rebuild; never rejects. Schedules the next one. */
  recalc(): Promise<void>;
  /** Stop the recalc timer. */
  close(): void;
}

export function createStatsService(
  scan: (nowEpochSeconds: number) => Promise<StatsScanRow[]>,
  options: StatsServiceOptions = {}
): StatsService {
  const recalcIntervalMs = options.recalcIntervalMs ?? RECALC_INTERVAL_MS;
  const retryMs = options.retryMs ?? RECALC_RETRY_MS;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  let cache: StatsCache | null = null;
  let journal: StatsEvent[] | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const schedule = (delayMs: number): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      void recalc();
    }, delayMs);
    timer.unref();
  };

  const run = async (): Promise<void> => {
    // Open the journal before the query is sent: events persisted while the
    // scan runs are replayed onto the fresh cache. The race window spans
    // opening the journal to the scan's snapshot — typically tens to a few
    // hundred milliseconds when the idle maintenance pool must first open a
    // fresh connection. Any batch persisted inside it is counted twice until
    // the next rebuild corrects it.
    const pending: StatsEvent[] = [];
    journal = pending;
    try {
      const rows = await scan(now());
      const fresh = StatsCache.fromScan(rows);
      for (const e of pending) fresh.add(e);
      cache = fresh;
      schedule(recalcIntervalMs);
    } catch (err) {
      // Keep the previous cache (or stay not-ready). Message only: never the DB URL.
      warn(`stats recalc failed: ${err instanceof Error ? err.message : String(err)}`);
      schedule(retryMs);
    } finally {
      journal = null;
    }
  };

  const recalc = (): Promise<void> => {
    if (inFlight === null) {
      inFlight = run().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  return {
    onPersisted(batch) {
      for (const e of batch) cache?.add(e);
      if (journal !== null) journal.push(...batch);
    },
    rows(at) {
      if (cache === null) throw new StatsNotReadyError();
      return cache.snapshot(at).rows;
    },
    rowCount() {
      if (cache === null) throw new StatsNotReadyError();
      return cache.snapshot(now()).rowCount;
    },
    recalc,
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
