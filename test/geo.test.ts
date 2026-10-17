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
import { mapToLon, distanceInMeters } from "../src/domain/geo.ts";

describe("mapToLon", () => {
  // [input, speedtools Geo.mapToLon(input)] as printed by Temurin 17.
  const JAVA_MAP_TO_LON: [string, string][] = [
    ["0.0", "0.0"],
    ["-0.0", "0.0"],
    ["179.999999", "179.999999"],
    ["-179.999999", "-179.999999"],
    ["180.0", "-180.0"],
    ["-180.0", "-180.0"],
    ["181.0", "-179.0"],
    ["-181.0", "179.0"],
    ["-360.0", "-0.0"],
    ["540.0", "-180.0"],
    ["1000000.0", "-80.0"],
    ["1.0E-300", "0.0"],
    ["4.8936337", "4.893633700000009"],
    ["184.845895", "-175.15410499999996"],
    ["-343.206372", "16.793628000000012"],
  ];
  it.each(JAVA_MAP_TO_LON)("maps %s to %s like Java", (input, java) => {
    expect(mapToLon(Number(input))).toBe(Number(java));
  });
});

describe("distanceInMeters", () => {
  it("is zero for identical points", () => {
    expect(distanceInMeters(52, 4, 52, 4)).toBeCloseTo(0, 6);
  });
  it("matches the offset magnitude used by the Java service (small distances)", () => {
    // Two points ~2.8 m apart near Amsterdam (sanity bound, not exact).
    const d = distanceInMeters(52.159853, 4.499790, 52.159828, 4.499790);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(3.5);
  });
});
