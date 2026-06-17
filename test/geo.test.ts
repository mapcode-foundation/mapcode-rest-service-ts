import { describe, it, expect } from "vitest";
import { mapToLon, distanceInMeters } from "../src/domain/geo.ts";

describe("mapToLon", () => {
  it("keeps in-range longitudes", () => {
    expect(mapToLon(0)).toBe(0);
    expect(mapToLon(179)).toBe(179);
    expect(mapToLon(-180)).toBeCloseTo(-180, 9);
    expect(mapToLon(180)).toBeCloseTo(180, 9);
  });
  it("wraps out-of-range longitudes into [-180, 180]", () => {
    expect(mapToLon(181)).toBeCloseTo(-179, 9);
    expect(mapToLon(-181)).toBeCloseTo(179, 9);
    expect(mapToLon(540)).toBeCloseTo(180, 9);
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
