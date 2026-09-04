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

import { ensureSchema, type RecorderPool } from "./schema.ts";

// ---------------------------------------------------------------------------
// Fire-and-forget request recorder: bounded in-memory queue, batched
// multi-row INSERTs. Recording must never touch API latency or availability —
// record() never throws and never awaits; failures degrade to dropped events
// plus a rate-limited warning.
// ---------------------------------------------------------------------------

export interface RecordedRequest {
  ts: number; // epoch seconds
  kind: number;
  lat: number | null; // microdegrees
  lon: number | null;
  status: number; // 1st+3rd digit condensed
  client: number;
  mapcode: string | null;
}

export interface RequestRecorder {
  /** Fire-and-forget: never throws, never awaits. */
  record(e: RecordedRequest): void;
  /** Drain the queue; used at shutdown and in tests. */
  flush(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Sync bound: a recorded event reaches the database (or is dropped) within
 * this interval — the timer flush guarantees it even when the batch-size
 * threshold is never hit.
 */
export const FLUSH_INTERVAL_MS_DEFAULT = 5000;

export interface RecorderOptions {
  /** Rows per INSERT and auto-flush threshold (default 500). */
  batchSize?: number;
  /** Timer flush period in ms (default FLUSH_INTERVAL_MS_DEFAULT). */
  flushIntervalMs?: number;
  /** Queue cap; events beyond it are dropped (default 10000). */
  maxQueue?: number;
  /** Minimum ms between warnings (default 60000). */
  warnIntervalMs?: number;
  warn?: (message: string) => void;
  /**
   * Called once per successful INSERT with exactly the stored rows — the hook
   * the stats cache counts on. Never called for a dropped batch. A throwing
   * callback is warned about and otherwise ignored.
   */
  onPersisted?: (batch: readonly RecordedRequest[]) => void;
}

const NOOP_RECORDER: RequestRecorder = {
  record() {},
  async flush() {},
  async close() {},
};

/** Parameterized multi-row INSERT; status/client are "char" (1 byte), reached via int cast. */
export function insertSql(rowCount: number): string {
  const groups: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const b = i * 7;
    groups.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::int::"char",$${b + 6}::int::"char",$${b + 7})`);
  }
  return `INSERT INTO mapcode_request (ts,lat,lon,kind,status,client,mapcode) VALUES ${groups.join(",")}`;
}

export function createRequestRecorder(pool: RecorderPool | null, options: RecorderOptions = {}): RequestRecorder {
  if (pool === null) return NOOP_RECORDER;

  const batchSize = options.batchSize ?? 500;
  const maxQueue = options.maxQueue ?? 10_000;
  const warnIntervalMs = options.warnIntervalMs ?? 60_000;
  const warn = options.warn ?? ((message: string) => console.warn(message));

  const queue: RecordedRequest[] = [];
  let schemaReady = false;
  let closed = false;
  let lastWarnAt = Number.NEGATIVE_INFINITY;
  let pending: Promise<void> = Promise.resolve();

  const warnRateLimited = (message: string): void => {
    const now = Date.now();
    if (now - lastWarnAt >= warnIntervalMs) {
      lastWarnAt = now;
      warn(message);
    }
  };

  const drain = async (): Promise<void> => {
    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize);
      try {
        if (!schemaReady) {
          await ensureSchema(pool);
          schemaReady = true;
        }
        const values = batch.flatMap((e) => [e.ts, e.lat, e.lon, e.kind, e.status, e.client, e.mapcode]);
        await pool.query(insertSql(batch.length), values);
        if (options.onPersisted !== undefined) {
          try {
            options.onPersisted(batch);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            warnRateLimited(`request recorder: onPersisted failed: ${message}`);
          }
        }
      } catch (err) {
        // Drop the batch: decorative data — a retry storm during an outage is
        // worse than a gap. (A failed ensureSchema retries on the next flush.)
        const message = err instanceof Error ? err.message : String(err);
        warnRateLimited(`request recorder: dropping ${batch.length} events: ${message}`);
      }
    }
  };

  // Serialize flushes: concurrent callers join the same chain.
  const flush = (): Promise<void> => {
    pending = pending.then(drain).catch(() => {
      // drain() already contains its own error handling; this guard only
      // keeps a throwing warn callback from poisoning the chain forever.
    });
    return pending;
  };

  const timer = setInterval(() => {
    void flush();
  }, options.flushIntervalMs ?? FLUSH_INTERVAL_MS_DEFAULT);
  timer.unref();

  return {
    record(e: RecordedRequest): void {
      if (closed) return;
      if (queue.length >= maxQueue) {
        warnRateLimited(`request recorder: queue full (${maxQueue}), dropping events`);
        return;
      }
      queue.push(e);
      if (queue.length >= batchSize) void flush();
    },
    flush,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      await flush();
    },
  };
}
