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
  createRequestRecorder,
  insertSql,
  type RecordedRequest,
} from "../src/storage/request-recorder.ts";
import { SCHEMA_DDL } from "../src/storage/schema.ts";

function event(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
  return { ts: 1000, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 0, mapcode: null, ...overrides };
}

interface Call {
  text: string;
  values?: unknown[];
}

/** Fake pool implementing the recorder's own RecorderPool interface. */
function fakePool(failures: { ddl?: number; insert?: number } = {}) {
  const calls: Call[] = [];
  let ddlFailuresLeft = failures.ddl ?? 0;
  let insertFailuresLeft = failures.insert ?? 0;
  return {
    calls,
    inserts: () => calls.filter((c) => c.text.startsWith("INSERT")),
    ddls: () => calls.filter((c) => c.text.includes("CREATE TABLE")),
    async query(text: string, values?: unknown[]): Promise<unknown> {
      calls.push({ text, values });
      if (text.includes("CREATE TABLE") && ddlFailuresLeft > 0) {
        ddlFailuresLeft--;
        throw new Error("ddl down");
      }
      if (text.startsWith("INSERT") && insertFailuresLeft > 0) {
        insertFailuresLeft--;
        throw new Error("insert down");
      }
      return { rows: [] };
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("insertSql", () => {
  it('builds a parameterized multi-row insert with "char" casts', () => {
    expect(insertSql(1)).toBe(
      'INSERT INTO mapcode_request (ts,lat,lon,kind,status,client,mapcode)' +
        ' VALUES ($1,$2,$3,$4,$5::int::"char",$6::int::"char",$7)'
    );
    expect(insertSql(2)).toContain('($8,$9,$10,$11,$12::int::"char",$13::int::"char",$14)');
  });
});

describe("createRequestRecorder", () => {
  it("returns a no-op recorder for a null pool", async () => {
    const recorder = createRequestRecorder(null);
    recorder.record(event());
    await recorder.flush();
    await recorder.close();
  });

  it("runs the schema DDL lazily before the first insert, once", async () => {
    const pool = fakePool();
    const recorder = createRequestRecorder(pool);
    recorder.record(event());
    recorder.record(event({ ts: 1001 }));
    await recorder.flush();
    await recorder.flush();
    expect(pool.ddls()).toHaveLength(1);
    expect(pool.calls[0].text).toBe(SCHEMA_DDL);
    expect(pool.inserts()).toHaveLength(1);
    expect(pool.inserts()[0].values).toEqual([
      1000, 52376514, 4908543, 10, 20, 0, null,
      1001, 52376514, 4908543, 10, 20, 0, null,
    ]);
  });

  it("retries ensureSchema on the next flush after it fails (batch dropped)", async () => {
    const pool = fakePool({ ddl: 1 });
    const warn = vi.fn();
    const recorder = createRequestRecorder(pool, { warn });
    recorder.record(event());
    await recorder.flush();
    expect(pool.inserts()).toHaveLength(0); // batch dropped with the DDL failure
    recorder.record(event({ ts: 2000 }));
    await recorder.flush();
    expect(pool.ddls()).toHaveLength(2); // retried
    expect(pool.inserts()).toHaveLength(1);
    expect(pool.inserts()[0].values?.[0]).toBe(2000);
  });

  it("flushes automatically at batchSize and splits large queues into batches", async () => {
    const pool = fakePool();
    const recorder = createRequestRecorder(pool, { batchSize: 500 });
    for (let i = 0; i < 500; i++) recorder.record(event({ ts: i }));
    await recorder.flush(); // joins the in-flight auto-flush
    expect(pool.inserts()).toHaveLength(1);
    expect(pool.inserts()[0].values).toHaveLength(500 * 7);

    for (let i = 0; i < 700; i++) recorder.record(event({ ts: i }));
    await recorder.flush();
    const inserts = pool.inserts();
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    const totalRows = inserts.slice(1).reduce((n, c) => n + (c.values?.length ?? 0) / 7, 0);
    expect(totalRows).toBe(700);
  });

  it("flushes on the timer", async () => {
    vi.useFakeTimers();
    const pool = fakePool();
    const recorder = createRequestRecorder(pool, { flushIntervalMs: 5000 });
    recorder.record(event());
    expect(pool.inserts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pool.inserts()).toHaveLength(1);
    await recorder.close();
  });

  it("drops the newest event beyond maxQueue and rate-limits the warning", async () => {
    vi.useFakeTimers();
    const pool = fakePool();
    const warn = vi.fn();
    const recorder = createRequestRecorder(pool, {
      maxQueue: 5,
      batchSize: 100,
      warnIntervalMs: 60_000,
      warn,
    });
    for (let i = 0; i < 8; i++) recorder.record(event({ ts: i }));
    expect(warn).toHaveBeenCalledTimes(1); // 3 drops, 1 warning
    await vi.advanceTimersByTimeAsync(60_000); // interval elapsed (also timer-flushes)
    recorder.record(event({ ts: 100 }));
    for (let i = 0; i < 10; i++) recorder.record(event({ ts: i }));
    expect(warn).toHaveBeenCalledTimes(2);
    await recorder.flush();
    expect(pool.inserts()[0].values).toHaveLength(5 * 7); // only the first 5 survived
  });

  it("drops a batch on insert failure without retrying it", async () => {
    const pool = fakePool({ insert: 1 });
    const warn = vi.fn();
    const recorder = createRequestRecorder(pool, { warn });
    recorder.record(event({ ts: 1 }));
    await recorder.flush();
    expect(warn).toHaveBeenCalledTimes(1);
    recorder.record(event({ ts: 2 }));
    await recorder.flush();
    const inserts = pool.inserts();
    expect(inserts).toHaveLength(2);
    expect(inserts[1].values?.[0]).toBe(2); // ts=1 was dropped, not retried
  });

  it("close() drains the queue and makes record() a no-op", async () => {
    const pool = fakePool();
    const recorder = createRequestRecorder(pool);
    recorder.record(event({ ts: 1 }));
    await recorder.close();
    expect(pool.inserts()).toHaveLength(1);
    recorder.record(event({ ts: 2 }));
    await recorder.flush();
    expect(pool.inserts()).toHaveLength(1); // nothing new
  });
});
