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

import { ApiError, ApiInvalidFormatError, ApiIntegerOutOfRangeError } from "../errors.ts";
import { parseIntStrict } from "./params.ts";
import type { ReplayQueryFn } from "../storage/replay-query.ts";

// ---------------------------------------------------------------------------
// handleReplay — framework-agnostic handler for GET /mapcode/replay.
// With the btree on ts, ORDER BY ts LIMIT n is an index range scan that stops
// after n rows, so the window cap bounds the client payload rather than the
// server-side scan. 1M rows is ~50 MB of JSON before compression.
// ---------------------------------------------------------------------------

export const REPLAY_LIMIT_DEFAULT = 50_000;
export const REPLAY_LIMIT_MAX = 1_000_000;
export const REPLAY_WINDOW_MAX_SECONDS = 365 * 24 * 3600; // 365 days
export const REPLAY_CACHE_HORIZON_SECONDS = 60;

export interface ReplayParams {
  from?: string;
  to?: string;
  limit?: string;
  kind?: string;
}

export interface ReplayResult {
  dto: Record<string, unknown>;
  /** Cache-Control value: fully-past windows are immutable, hence cacheable. */
  cacheControl: string;
}

function parseEpoch(name: string, raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = parseIntStrict(raw);
  if (value === null || value < 0) {
    throw new ApiInvalidFormatError(name, raw, "epoch seconds");
  }
  return value;
}

export async function handleReplay(
  params: ReplayParams,
  nowEpochSeconds: number,
  query: ReplayQueryFn
): Promise<ReplayResult> {
  const from = parseEpoch("from", params.from);
  if (from === null) {
    throw new ApiInvalidFormatError("from", params.from, "epoch seconds");
  }
  const to = parseEpoch("to", params.to) ?? nowEpochSeconds;
  if (to <= from) {
    throw new ApiInvalidFormatError("to", params.to ?? String(to), "epoch seconds > from");
  }
  if (to - from > REPLAY_WINDOW_MAX_SECONDS) {
    throw new ApiInvalidFormatError("to", params.to ?? String(to), "window of at most 365 days after from");
  }

  let limit = REPLAY_LIMIT_DEFAULT;
  if (params.limit !== undefined) {
    const parsed = parseIntStrict(params.limit);
    if (parsed === null) {
      throw new ApiInvalidFormatError("limit", params.limit, "integer");
    }
    if (parsed < 1 || parsed > REPLAY_LIMIT_MAX) {
      throw new ApiIntegerOutOfRangeError("limit", parsed, 1, REPLAY_LIMIT_MAX);
    }
    limit = parsed;
  }

  let kinds: number[] | null = null;
  if (params.kind !== undefined) {
    kinds = params.kind.split(",").map((raw) => {
      const kind = parseIntStrict(raw.trim());
      if (kind === null) {
        throw new ApiInvalidFormatError("kind", params.kind, "comma-separated kind numbers");
      }
      // kind is stored as int2 in Postgres; the kind table itself is gapped
      // for growth, so accept the full int2 range rather than a narrower one.
      if (kind < 0 || kind > 32767) {
        throw new ApiIntegerOutOfRangeError("kind", kind, 0, 32767);
      }
      return kind;
    });
  }

  let columns;
  try {
    columns = await query({ from, to, limit, kinds });
  } catch {
    // Never let raw pg error text (hostnames, usernames, ...) reach the response body.
    throw new ApiError(500, "Internal Server Error");
  }
  const count = columns.ts.length;
  const dto: Record<string, unknown> = { from, to, count, truncated: count >= limit, ...columns };
  // Events take up to ~flushIntervalMs to leave the recorder queue and become
  // queryable, so a window ending within that horizon is not yet immutable.
  return {
    dto,
    cacheControl: to < nowEpochSeconds - REPLAY_CACHE_HORIZON_SECONDS ? "private, max-age=3600" : "no-store",
  };
}
