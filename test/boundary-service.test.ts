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

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundaryService, pointInRing } from "../src/domain/boundary-service.ts";

// Optional per-test override for the flatgeobuf GeoJSON deserializer. When set, the
// mocked module returns this value; otherwise it delegates to the real implementation.
// This lets us exercise the load() CSR-build path with hand-built FeatureCollections
// without disturbing the tests that read the real .fgb fixture.
let deserializeOverride:
  | ((bytes: Uint8Array) => unknown)
  | null = null;

vi.mock("flatgeobuf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("flatgeobuf")>();
  return {
    ...actual,
    geojson: {
      ...actual.geojson,
      deserialize: (...args: Parameters<typeof actual.geojson.deserialize>) =>
        deserializeOverride
          ? deserializeOverride(args[0] as Uint8Array)
          : (actual.geojson.deserialize as (...a: unknown[]) => unknown)(...args),
    },
  };
});

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "resources",
  "borders-test.fgb",
);

describe("pointInRing", () => {
  // A unit square (0,0)-(10,10) stored as lon,lat interleaved, closed ring.
  const square = new Float64Array([
    0, 0, 10, 0, 10, 10, 0, 10, 0, 0,
  ]);

  it("returns true for a point inside the square", () => {
    expect(pointInRing(square, 0, square.length / 2, 5, 5)).toBe(true);
  });

  it("returns false for a point outside the square", () => {
    expect(pointInRing(square, 0, square.length / 2, 15, 5)).toBe(false);
    expect(pointInRing(square, 0, square.length / 2, -1, 5)).toBe(false);
  });

  it("handles a square with a hole via two ring calls", () => {
    // Outer 0..10, inner hole 4..6.
    const coords = new Float64Array([
      // outer ring (5 verts)
      0, 0, 10, 0, 10, 10, 0, 10, 0, 0,
      // inner ring / hole (5 verts)
      4, 4, 6, 4, 6, 6, 4, 6, 4, 4,
    ]);
    const outerStart = 0;
    const outerEnd = 5;
    const holeStart = 5;
    const holeEnd = 10;
    // Point in hole: inside outer but inside hole -> not in polygon.
    expect(pointInRing(coords, outerStart, outerEnd, 5, 5)).toBe(true);
    expect(pointInRing(coords, holeStart, holeEnd, 5, 5)).toBe(true);
    // Point between hole and outer edge: inside outer, not in hole.
    expect(pointInRing(coords, outerStart, outerEnd, 2, 2)).toBe(true);
    expect(pointInRing(coords, holeStart, holeEnd, 2, 2)).toBe(false);
  });
});

describe("BoundaryService", () => {
  it("loads the fixture", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    expect(svc).toBeInstanceOf(BoundaryService);
  });

  it("returns the country only for a point inside a country", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    const matches = svc.lookup(52.0, 5.0); // inside NLD square
    expect(matches.length).toBe(1);
    expect(matches[0].alphaCode).toBe("NLD");
    expect(matches[0].parentAlphaCode).toBeNull();
    expect(matches[0].adminLevel).toBe(2);
  });

  it("returns subdivision before country (ranking by adminLevel desc)", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    const matches = svc.lookup(36.0, -120.0); // inside USA-CA square
    expect(matches.length).toBe(2);
    expect(matches[0].alphaCode).toBe("USA-CA");
    expect(matches[0].parentAlphaCode).toBe("USA");
    expect(matches[0].adminLevel).toBe(4);
    expect(matches[1].alphaCode).toBe("USA");
    expect(matches[1].adminLevel).toBe(2);
  });

  it("returns empty list for a sea point", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    const matches = svc.lookup(0.0, -30.0); // mid-Atlantic
    expect(matches).toEqual([]);
  });

  it("returns the smaller polygon first for a disputed region (area asc)", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    // (6.5, 106.5) is inside both DISPUTED-A (large) and DISPUTED-B (small).
    const matches = svc.lookup(6.5, 106.5);
    expect(matches.length).toBe(2);
    expect(matches[0].alphaCode).toBe("DISPUTED-B");
    expect(matches[1].alphaCode).toBe("DISPUTED-A");
  });

  it("reads pre-tagged subdivision alphaCode and returns it twice", async () => {
    const svc = await BoundaryService.load(FIXTURE);
    const matches = svc.lookup(62.0, 22.5);
    expect(matches.length).toBe(2);
    expect(matches[0].alphaCode).toBe("NO-MAPCODE-PARENT");
    expect(matches[0].adminLevel).toBe(4);
    expect(matches[1].alphaCode).toBe("NO-MAPCODE-PARENT");
    expect(matches[1].adminLevel).toBe(2);
  });

  it("rejects a missing borders file", async () => {
    await expect(BoundaryService.load("/does/not/exist.fgb")).rejects.toThrow();
  });
});

describe("BoundaryService load — degenerate feature CSR rollback", () => {
  afterEach(() => {
    deserializeOverride = null;
  });

  it("handles a degenerate feature before a valid feature without spurious matches", async () => {
    // Feed load() a hand-built FeatureCollection where a degenerate feature (a
    // non-empty polygon array whose rings are all empty -> no vertices appended)
    // PRECEDES a valid feature. Without the rollback, the degenerate feature leaves
    // phantom polygons/rings in the CSR arrays and desynchronizes featurePolyStart;
    // with the rollback, the CSR arrays are exactly as before the iteration.
    //
    // NOTE: empirically the phantom polygons left by a no-vertex feature all have an
    // EMPTY outer ring, which point-in-ring always rejects, so the desync corrupts
    // only internal polygon counts, not lookup RESULTS reachable via the public API.
    // This test is therefore a behavioral regression guard (valid feature resolves;
    // the dropped feature yields no match), not a proof of the counter arithmetic;
    // see task-7-report.md for the full reachability analysis.
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          // Degenerate: two polygons, each a single empty ring -> contributes no
          // vertices, but advances ringCount/polyCount and pushes to the offset
          // lists before the rollback restores them.
          geometry: { type: "MultiPolygon", coordinates: [[[]], [[]]] },
          properties: { alphaCode: "BAD", parentAlphaCode: "", adminLevel: 2, area: 1 },
        },
        {
          // Valid square (0,0)-(10,10).
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
          properties: { alphaCode: "GOOD", parentAlphaCode: "", adminLevel: 2, area: 100 },
        },
      ],
    };
    deserializeOverride = () => collection;

    // Any path works; readFile content is ignored because deserialize is mocked.
    const svc = await BoundaryService.load(FIXTURE);

    // lookup(lat, lon): point (5,5) is inside the GOOD square.
    const matches = svc.lookup(5, 5);
    expect(matches.length).toBe(1);
    expect(matches[0].alphaCode).toBe("GOOD");
    // The dropped degenerate feature must never surface.
    expect(matches.some((m) => m.alphaCode === "BAD")).toBe(false);

    // A point outside the square returns nothing.
    expect(svc.lookup(50, 50)).toEqual([]);
  });
});
