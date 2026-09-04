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
import { handleReplay, REPLAY_WINDOW_MAX_SECONDS, REPLAY_LIMIT_MAX } from "../src/resources/replay.ts";
import { ApiError } from "../src/errors.ts";
import type { ReplayColumns, ReplayQueryArgs } from "../src/storage/replay-query.ts";

const EMPTY: ReplayColumns = { ts: [], kind: [], lat: [], lon: [], status: [], client: [], mapcode: [] };
const NOW = 1_737_100_000;

function fakeQuery(result: ReplayColumns = EMPTY) {
  const calls: ReplayQueryArgs[] = [];
  const fn = async (args: ReplayQueryArgs): Promise<ReplayColumns> => {
    calls.push(args);
    return result;
  };
  return { calls, fn };
}

async function expect400(params: Record<string, string>): Promise<void> {
  const { fn } = fakeQuery();
  await expect(handleReplay(params, NOW, fn)).rejects.toSatisfy(
    (err: unknown) => err instanceof ApiError && err.httpStatus === 400
  );
}

describe("handleReplay validation", () => {
  it("requires from", async () => {
    await expect400({});
  });
  it("rejects non-integer or negative from/to", async () => {
    await expect400({ from: "abc" });
    await expect400({ from: "-5" });
    await expect400({ from: "1000", to: "xyz" });
  });
  it("requires to > from", async () => {
    await expect400({ from: "1000", to: "1000" });
    await expect400({ from: "1000", to: "999" });
  });
  it("caps the window at 365 days", async () => {
    expect(REPLAY_WINDOW_MAX_SECONDS).toBe(365 * 24 * 3600);
    await expect400({ from: "1000", to: String(1000 + REPLAY_WINDOW_MAX_SECONDS + 1) });
    const { fn } = fakeQuery();
    await handleReplay({ from: "1000", to: String(1000 + REPLAY_WINDOW_MAX_SECONDS) }, NOW, fn); // exactly 365d OK
  });
  it("bounds limit to [1, 200000] and defaults to 50000", async () => {
    expect(REPLAY_LIMIT_MAX).toBe(200_000);
    await expect400({ from: "1000", to: "2000", limit: "0" });
    await expect400({ from: "1000", to: "2000", limit: "200001" });
    await expect400({ from: "1000", to: "2000", limit: "ten" });
    const { calls, fn } = fakeQuery();
    await handleReplay({ from: "1000", to: "2000", limit: "200000" }, NOW, fn);
    await handleReplay({ from: "1000", to: "2000" }, NOW, fn);
    expect(calls.map((c) => c.limit)).toEqual([200_000, 50_000]);
  });
  it("rejects malformed kind lists", async () => {
    await expect400({ from: "1000", to: "2000", kind: "10,x" });
  });
  it("rejects kind values outside int2 range", async () => {
    await expect400({ from: "1000", to: "2000", kind: "32768" });
    await expect400({ from: "1000", to: "2000", kind: "-1" });
    const { fn } = fakeQuery();
    await handleReplay({ from: "1000", to: "2000", kind: "32767" }, NOW, fn); // int2 max OK
  });
  it("wraps a rejected query as a 500 with no leaked error text", async () => {
    const fn = async (): Promise<ReplayColumns> => {
      throw new Error("password authentication failed for user \"admin\" at host db.internal");
    };
    await expect(handleReplay({ from: "1000", to: "2000" }, NOW, fn)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.httpStatus === 500 && err.message === "Internal Server Error"
    );
  });
});

describe("handleReplay behavior", () => {
  it("defaults to=now and limit=50000, kinds=null", async () => {
    const { calls, fn } = fakeQuery();
    await handleReplay({ from: String(NOW - 3600) }, NOW, fn);
    expect(calls[0]).toEqual({ from: NOW - 3600, to: NOW, limit: 50_000, kinds: null });
  });

  it("parses the kind comma list", async () => {
    const { calls, fn } = fakeQuery();
    await handleReplay({ from: String(NOW - 7200), to: String(NOW - 3600), kind: "10, 20" }, NOW, fn);
    expect(calls[0].kinds).toEqual([10, 20]);
  });

  it("builds the columnar dto with count and truncated", async () => {
    const result: ReplayColumns = {
      ts: [NOW - 7200 + 1, NOW - 7200 + 2],
      kind: [10, 20],
      lat: [1, 2],
      lon: [3, 4],
      status: [20, 20],
      client: [0, 1],
      mapcode: [null, "NLD 49.4V"],
    };
    const { fn } = fakeQuery(result);
    const { dto } = await handleReplay({ from: String(NOW - 7200), to: String(NOW - 3600), limit: "2" }, NOW, fn);
    expect(dto).toEqual({ from: NOW - 7200, to: NOW - 3600, count: 2, truncated: true, ...result });
    expect(Object.keys(dto)).toEqual(["from", "to", "count", "truncated", "ts", "kind", "lat", "lon", "status", "client", "mapcode"]);
  });

  it("is not truncated below the limit", async () => {
    const { fn } = fakeQuery(EMPTY);
    const { dto } = await handleReplay({ from: String(NOW - 7200), to: String(NOW - 3600) }, NOW, fn);
    expect(dto).toMatchObject({ count: 0, truncated: false });
  });

  it("marks fully-past windows privately cacheable and live windows no-store", async () => {
    const { fn } = fakeQuery();
    const past = await handleReplay({ from: String(NOW - 7200), to: String(NOW - 3600) }, NOW, fn);
    expect(past.cacheControl).toBe("private, max-age=3600");
    const live = await handleReplay({ from: String(NOW - 100) }, NOW, fn);
    expect(live.cacheControl).toBe("no-store");
    const future = await handleReplay({ from: String(NOW - 100), to: String(NOW + 100) }, NOW, fn);
    expect(future.cacheControl).toBe("no-store");
  });

  it("treats a window ending within the recorder-flush horizon as not-yet-immutable", async () => {
    const { fn } = fakeQuery();
    // to is only 30s in the past: the tail of that window may still be sitting
    // in the recorder's in-memory queue, not yet queryable.
    const recent = await handleReplay({ from: String(NOW - 3600), to: String(NOW - 30) }, NOW, fn);
    expect(recent.cacheControl).toBe("no-store");
    // to is 61s in the past: safely beyond the flush horizon, cacheable.
    const past = await handleReplay({ from: String(NOW - 3600), to: String(NOW - 61) }, NOW, fn);
    expect(past.cacheControl).toBe("private, max-age=3600");
  });
});
