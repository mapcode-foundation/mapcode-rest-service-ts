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
import { CounterRing } from "../src/storage/counter-ring.ts";

describe("CounterRing", () => {
  it("counts events whose bucket lies in [floor(from/w), floor(to/w)]", () => {
    const ring = new CounterRing(1, 3600);
    ring.add(1000);
    ring.add(1000);
    ring.add(1059);
    ring.add(1060);
    expect(ring.count(1000, 1059)).toBe(3); // 1000, 1000, 1059
    expect(ring.count(1001, 1060)).toBe(2); // 1059, 1060
    expect(ring.count(2000, 3000)).toBe(0);
  });

  it("aligns the lower bound down to the bucket boundary for wide buckets", () => {
    const ring = new CounterRing(60, 1440);
    ring.add(1_000_000); // bucket 16666 = [999960, 1000020)
    ring.add(1_000_019);
    ring.add(1_000_020); // bucket 16667
    // from=1000010 falls inside bucket 16666 → the whole bucket counts (align-down).
    expect(ring.count(1_000_010, 1_000_020)).toBe(3);
    // from=1000020 is exactly the start of bucket 16667.
    expect(ring.count(1_000_020, 1_000_100)).toBe(1);
  });

  it("supports weighted adds (scan rows carry a count per bucket)", () => {
    const ring = new CounterRing(3600, 8760);
    ring.add(7200, 42);
    ring.add(7201, 8);
    expect(ring.count(7200, 7200)).toBe(50);
  });

  it("evicts a slot when a newer bucket wraps onto it, and ignores older events", () => {
    const ring = new CounterRing(1, 4);
    ring.add(10); // slot 2
    ring.add(14); // slot 2 again: bucket 14 > 10 → evicts
    expect(ring.count(10, 10)).toBe(0);
    expect(ring.count(14, 14)).toBe(1);
    ring.add(10); // older than the slot's bucket → ignored
    expect(ring.count(10, 14)).toBe(1);
  });

  it("is order-independent when filled from unsorted scan rows", () => {
    const a = new CounterRing(1, 4);
    const b = new CounterRing(1, 4);
    for (const ts of [14, 10, 13, 11]) a.add(ts);
    for (const ts of [10, 11, 13, 14]) b.add(ts);
    expect(a.count(11, 14)).toBe(3);
    expect(b.count(11, 14)).toBe(3);
    expect(a.count(10, 10)).toBe(0); // 10 and 14 share a slot; 14 wins in both orders
    expect(b.count(10, 10)).toBe(0);
  });

  it("ignores negative timestamps", () => {
    const ring = new CounterRing(1, 4);
    ring.add(-3);
    ring.add(-1);
    ring.add(2);
    expect(ring.count(-3, 2)).toBe(1);
    expect(ring.count(2, 2)).toBe(1);
  });
});
