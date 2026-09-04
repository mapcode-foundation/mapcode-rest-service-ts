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

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createStatsService,
  StatsNotReadyError,
  RECALC_INTERVAL_MS,
  RECALC_RETRY_MS,
} from "../src/storage/stats-service.ts";
import type { StatsScanRow } from "../src/storage/stats-cache.ts";

const NOW = 1_737_100_000;
// Two events 5 s ago: a real scan lists a recent event in every tier.
const SCAN: StatsScanRow[] = [
  { tier: "all", kind: 10, bucket: null, n: 100 },
  { tier: "all", kind: 50, bucket: null, n: 3 },
  { tier: "hour", kind: 10, bucket: Math.floor((NOW - 5) / 3600), n: 2 },
  { tier: "min", kind: 10, bucket: Math.floor((NOW - 5) / 60), n: 2 },
  { tier: "sec", kind: 10, bucket: NOW - 5, n: 2 },
];

/** A scan the test resolves by hand, to interleave events with an in-flight scan. */
function controlledScan() {
  let resolve!: (rows: StatsScanRow[]) => void;
  let reject!: (err: Error) => void;
  const calls: number[] = [];
  const scan = (now: number) => {
    calls.push(now);
    return new Promise<StatsScanRow[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return { scan, calls, resolve: (rows: StatsScanRow[]) => resolve(rows), reject: (err: Error) => reject(err) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createStatsService", () => {
  it("is not ready before the first successful scan", () => {
    const service = createStatsService(async () => SCAN);
    expect(() => service.rows(NOW)).toThrow(StatsNotReadyError);
    expect(() => service.rowCount()).toThrow(StatsNotReadyError);
    service.close();
  });

  it("serves the scan result after recalc, kind 50 in rowCount only", async () => {
    const service = createStatsService(async () => SCAN, { now: () => NOW });
    await service.recalc();
    expect(service.rows(NOW)).toEqual([
      { kind: 10, "1m": 2, "1h": 2, "1d": 2, "7d": 2, "31d": 2, "1y": 2, all: 100 },
    ]);
    expect(service.rowCount()).toBe(103);
    service.close();
  });

  it("counts persisted events incrementally", async () => {
    const service = createStatsService(async () => SCAN, { now: () => NOW });
    await service.recalc();
    service.onPersisted([{ ts: NOW, kind: 10 }, { ts: NOW, kind: 20 }]);
    const rows = service.rows(NOW);
    expect(rows.find((r) => r.kind === 10)?.all).toBe(101);
    expect(rows.find((r) => r.kind === 20)).toEqual({ kind: 20, "1m": 1, "1h": 1, "1d": 1, "7d": 1, "31d": 1, "1y": 1, all: 1 });
    expect(service.rowCount()).toBe(105);
    service.close();
  });

  it("replays events persisted during an in-flight scan into the fresh cache", async () => {
    const { scan, resolve } = controlledScan();
    const service = createStatsService(scan, { now: () => NOW });
    const first = service.recalc(); // warm up: resolve the controlled scan, then await
    resolve(SCAN);
    await first;
    const second = service.recalc();
    service.onPersisted([{ ts: NOW, kind: 10 }]); // arrives while the scan runs
    resolve([{ tier: "all", kind: 10, bucket: null, n: 500 }]); // snapshot taken before that event
    await second;
    expect(service.rows(NOW)[0].all).toBe(501);
    service.close();
  });

  it("joins a recalc already in flight instead of starting another scan", async () => {
    const { scan, calls, resolve } = controlledScan();
    const service = createStatsService(scan, { now: () => NOW });
    const a = service.recalc();
    const b = service.recalc();
    expect(calls).toHaveLength(1);
    resolve(SCAN);
    await Promise.all([a, b]);
    service.close();
  });

  it("keeps the previous cache and warns (message only) when a scan fails", async () => {
    const warn = vi.fn();
    let fail = false;
    const service = createStatsService(
      async () => {
        if (fail) throw new Error("connection to db-internal.example refused");
        return SCAN;
      },
      { now: () => NOW, warn }
    );
    await service.recalc();
    fail = true;
    await service.recalc(); // must not reject
    expect(service.rowCount()).toBe(103);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("stats recalc failed: connection to db-internal.example refused");
    service.close();
  });

  it("recovers when the scan function throws synchronously", async () => {
    const calls: number[] = [];
    const service = createStatsService(
      (now) => {
        calls.push(now);
        if (calls.length === 1) throw new Error("sync boom");
        return Promise.resolve(SCAN);
      },
      { now: () => NOW, warn: () => {} }
    );
    await service.recalc(); // must not reject
    expect(() => service.rowCount()).toThrow(StatsNotReadyError);
    await service.recalc();
    expect(calls).toHaveLength(2);
    expect(service.rowCount()).toBe(103);
    service.close();
  });

  it("schedules the next scan 6 h after success and 5 min after failure", async () => {
    vi.useFakeTimers();
    let fail = false;
    const calls: number[] = [];
    const service = createStatsService(
      async (now) => {
        calls.push(now);
        if (fail) throw new Error("down");
        return SCAN;
      },
      { now: () => NOW, warn: () => {} }
    );
    await service.recalc();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RECALC_INTERVAL_MS - 1);
    expect(calls).toHaveLength(1);
    fail = true;
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2); // 6 h tick, fails
    await vi.advanceTimersByTimeAsync(RECALC_RETRY_MS);
    expect(calls).toHaveLength(3); // retried after 5 min
    service.close();
    await vi.advanceTimersByTimeAsync(RECALC_INTERVAL_MS * 2);
    expect(calls).toHaveLength(3); // closed: no more ticks
  });

  it("exposes the interval constants", () => {
    expect(RECALC_INTERVAL_MS).toBe(6 * 3600 * 1000);
    expect(RECALC_RETRY_MS).toBe(5 * 60 * 1000);
  });
});
