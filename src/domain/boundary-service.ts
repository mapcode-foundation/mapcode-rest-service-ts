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

import { readFile } from "node:fs/promises";
import Flatbush from "flatbush";
import { geojson } from "flatgeobuf";

/**
 * A single point-in-polygon match for a territory (admin boundary).
 */
export interface TerritoryMatch {
  alphaCode: string;
  parentAlphaCode: string | null;
  adminLevel: number;
  area: number;
}

/**
 * Even-odd ray-casting test for a single ring. The ring is stored in {@code coords}
 * as lon,lat interleaved pairs, from vertex index {@code startVertex} (inclusive) to
 * {@code endVertex} (exclusive). A closed ring (first vertex repeated as last) is fine;
 * the closing edge is handled by the wrap-around.
 *
 * @param coords      Flat lon,lat interleaved vertex array.
 * @param startVertex First vertex index of the ring (vertex, not float, index).
 * @param endVertex   One past the last vertex index of the ring.
 * @param lon         Test point longitude.
 * @param lat         Test point latitude.
 * @returns           True if the point is strictly inside or on the even-odd boundary.
 */
export function pointInRing(
  coords: Float64Array,
  startVertex: number,
  endVertex: number,
  lon: number,
  lat: number,
): boolean {
  let inside = false;
  const n = endVertex - startVertex;
  if (n < 3) {
    return false;
  }
  // Iterate edges (j, i) with j = previous vertex of i, wrapping around.
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xiIdx = (startVertex + i) * 2;
    const xjIdx = (startVertex + j) * 2;
    const xi = coords[xiIdx];
    const yi = coords[xiIdx + 1];
    const xj = coords[xjIdx];
    const yj = coords[xjIdx + 1];

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * In-memory, memory-optimized OSM admin-boundary point-in-polygon service.
 *
 * Loads a FlatGeobuf borders file once at startup into flat typed arrays plus a
 * flatbush spatial index, then answers ranked point-in-polygon queries. The
 * GeoJSON objects produced by the reader are discarded after transcoding.
 *
 * CSR layout (supports MultiPolygon + holes):
 * - coords:          all ring vertices, lon,lat interleaved.
 * - ringOffsets:     start vertex index of each ring (with an end sentinel).
 * - polyRingStart:   first ring index of each polygon (with an end sentinel).
 * - featurePolyStart: first polygon index of each feature (with an end sentinel).
 */
export class BoundaryService {
  private readonly index: Flatbush;

  private readonly coords: Float64Array;
  private readonly ringOffsets: Uint32Array;
  private readonly polyRingStart: Uint32Array;
  private readonly featurePolyStart: Uint32Array;

  private readonly alphaCode: string[];
  private readonly parentAlphaCode: (string | null)[];
  private readonly adminLevel: Uint8Array;
  private readonly area: Float64Array;
  private readonly minX: Float64Array;
  private readonly minY: Float64Array;
  private readonly maxX: Float64Array;
  private readonly maxY: Float64Array;

  private constructor(args: {
    index: Flatbush;
    coords: Float64Array;
    ringOffsets: Uint32Array;
    polyRingStart: Uint32Array;
    featurePolyStart: Uint32Array;
    alphaCode: string[];
    parentAlphaCode: (string | null)[];
    adminLevel: Uint8Array;
    area: Float64Array;
    minX: Float64Array;
    minY: Float64Array;
    maxX: Float64Array;
    maxY: Float64Array;
  }) {
    this.index = args.index;
    this.coords = args.coords;
    this.ringOffsets = args.ringOffsets;
    this.polyRingStart = args.polyRingStart;
    this.featurePolyStart = args.featurePolyStart;
    this.alphaCode = args.alphaCode;
    this.parentAlphaCode = args.parentAlphaCode;
    this.adminLevel = args.adminLevel;
    this.area = args.area;
    this.minX = args.minX;
    this.minY = args.minY;
    this.maxX = args.maxX;
    this.maxY = args.maxY;
  }

  /**
   * Loads a FlatGeobuf borders file into memory. Features lacking geometry or any
   * required property (alphaCode, adminLevel, area) are skipped. An empty
   * parentAlphaCode is normalised to null.
   *
   * @param bordersPath Path to the .fgb file.
   * @returns           A ready-to-query BoundaryService.
   * @throws            If the file cannot be read or parsed.
   */
  static async load(bordersPath: string): Promise<BoundaryService> {
    let bytes: Buffer;
    try {
      bytes = await readFile(bordersPath);
    } catch (e) {
      throw new Error(`Borders file not readable: ${bordersPath}`, {
        cause: e,
      });
    }
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let featureCollection: GeoJsonFeatureCollection;
    try {
      featureCollection = geojson.deserialize(
        u8,
      ) as unknown as GeoJsonFeatureCollection;
    } catch (e) {
      throw new Error(`Failed to parse borders file: ${bordersPath}`, {
        cause: e,
      });
    }

    // Growable plain arrays during build; converted to typed arrays at the end.
    const coordsList: number[] = [];
    const ringOffsetsList: number[] = [0];
    const polyRingStartList: number[] = [0];
    const featurePolyStartList: number[] = [0];

    const alphaCode: string[] = [];
    const parentAlphaCode: (string | null)[] = [];
    const adminLevelList: number[] = [];
    const areaList: number[] = [];
    const minXList: number[] = [];
    const minYList: number[] = [];
    const maxXList: number[] = [];
    const maxYList: number[] = [];

    let ringCount = 0;
    let polyCount = 0;
    let vertexCount = 0;

    for (const feature of featureCollection.features) {
      const geom = feature?.geometry;
      const props = feature?.properties ?? {};
      if (!geom) {
        continue;
      }

      const aCode = props.alphaCode;
      if (typeof aCode !== "string" || aCode.length === 0) {
        continue;
      }
      let pCode: string | null =
        typeof props.parentAlphaCode === "string"
          ? props.parentAlphaCode
          : null;
      if (pCode !== null && pCode.length === 0) {
        pCode = null;
      }
      const level = toInt(props.adminLevel);
      if (level === null) {
        continue;
      }
      const areaVal = toNumber(props.area);
      if (areaVal === null) {
        continue;
      }

      // Collect this feature's polygons (each as an array of rings of [lon,lat]).
      // A polygon is an array of rings; a ring is an array of [lon,lat] pairs.
      const polygons: Ring[][] = [];
      if (geom.type === "Polygon") {
        polygons.push(geom.coordinates as Ring[]);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates as Ring[][]) {
          polygons.push(poly);
        }
      } else {
        continue;
      }
      if (polygons.length === 0) {
        continue;
      }

      let featMinX = Infinity;
      let featMinY = Infinity;
      let featMaxX = -Infinity;
      let featMaxY = -Infinity;
      let appendedAnyVertex = false;

      for (const poly of polygons) {
        if (poly.length === 0) {
          continue;
        }
        for (const ring of poly) {
          for (const pair of ring) {
            const lon = pair[0];
            const lat = pair[1];
            coordsList.push(lon, lat);
            vertexCount++;
            appendedAnyVertex = true;
            if (lon < featMinX) featMinX = lon;
            if (lon > featMaxX) featMaxX = lon;
            if (lat < featMinY) featMinY = lat;
            if (lat > featMaxY) featMaxY = lat;
          }
          ringCount++;
          ringOffsetsList.push(vertexCount);
        }
        polyCount++;
        polyRingStartList.push(ringCount);
      }

      if (!appendedAnyVertex) {
        // Roll back: this feature contributed no geometry; remove its empty polys.
        // (In practice this does not happen for valid borders data.)
        continue;
      }

      featurePolyStartList.push(polyCount);
      alphaCode.push(aCode);
      parentAlphaCode.push(pCode);
      adminLevelList.push(level);
      areaList.push(areaVal);
      minXList.push(featMinX);
      minYList.push(featMinY);
      maxXList.push(featMaxX);
      maxYList.push(featMaxY);
    }

    const featureCount = alphaCode.length;
    if (featureCount === 0) {
      throw new Error(
        `Borders file contained no usable features: ${bordersPath}`,
      );
    }

    const index = new Flatbush(featureCount);
    for (let i = 0; i < featureCount; i++) {
      index.add(minXList[i], minYList[i], maxXList[i], maxYList[i]);
    }
    index.finish();

    return new BoundaryService({
      index,
      coords: Float64Array.from(coordsList),
      ringOffsets: Uint32Array.from(ringOffsetsList),
      polyRingStart: Uint32Array.from(polyRingStartList),
      featurePolyStart: Uint32Array.from(featurePolyStartList),
      alphaCode,
      parentAlphaCode,
      adminLevel: Uint8Array.from(adminLevelList),
      area: Float64Array.from(areaList),
      minX: Float64Array.from(minXList),
      minY: Float64Array.from(minYList),
      maxX: Float64Array.from(maxXList),
      maxY: Float64Array.from(maxYList),
    });
  }

  /**
   * Returns the territories whose admin boundary contains the given point, ranked
   * by adminLevel descending then area ascending.
   *
   * @param latDeg Latitude in degrees.
   * @param lonDeg Longitude in degrees.
   * @returns      Ranked matches (possibly empty).
   */
  lookup(latDeg: number, lonDeg: number): TerritoryMatch[] {
    const candidates = this.index.search(lonDeg, latDeg, lonDeg, latDeg);
    const hits: TerritoryMatch[] = [];
    for (const fi of candidates) {
      if (this.featureContains(fi, lonDeg, latDeg)) {
        hits.push({
          alphaCode: this.alphaCode[fi],
          parentAlphaCode: this.parentAlphaCode[fi],
          adminLevel: this.adminLevel[fi],
          area: this.area[fi],
        });
      }
    }
    hits.sort((a, b) => {
      if (a.adminLevel !== b.adminLevel) {
        return b.adminLevel - a.adminLevel; // higher level first
      }
      return a.area - b.area; // smaller area first
    });
    return hits;
  }

  /** True if the point is inside ANY of the feature's polygons. */
  private featureContains(
    featureIndex: number,
    lon: number,
    lat: number,
  ): boolean {
    const polyStart = this.featurePolyStart[featureIndex];
    const polyEnd = this.featurePolyStart[featureIndex + 1];
    for (let p = polyStart; p < polyEnd; p++) {
      if (this.polygonContains(p, lon, lat)) {
        return true;
      }
    }
    return false;
  }

  /**
   * True if the point is inside the polygon's outer ring AND not inside any of its
   * holes. The first ring of a polygon is the outer ring; the rest are holes.
   */
  private polygonContains(polyIndex: number, lon: number, lat: number): boolean {
    const ringStart = this.polyRingStart[polyIndex];
    const ringEnd = this.polyRingStart[polyIndex + 1];
    if (ringStart >= ringEnd) {
      return false;
    }
    // Outer ring.
    const outerStartVertex = this.ringOffsets[ringStart];
    const outerEndVertex = this.ringOffsets[ringStart + 1];
    if (!pointInRing(this.coords, outerStartVertex, outerEndVertex, lon, lat)) {
      return false;
    }
    // Holes.
    for (let r = ringStart + 1; r < ringEnd; r++) {
      const holeStartVertex = this.ringOffsets[r];
      const holeEndVertex = this.ringOffsets[r + 1];
      if (pointInRing(this.coords, holeStartVertex, holeEndVertex, lon, lat)) {
        return false;
      }
    }
    return true;
  }
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

// Minimal structural typing for the GeoJSON shape the reader yields. We do not
// retain these objects; they are transcoded into typed arrays and discarded.
interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}
interface GeoJsonFeature {
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown> | null;
}
interface GeoJsonFeatureCollection {
  features: GeoJsonFeature[];
}

// A linear ring: an ordered list of [lon, lat] coordinate pairs.
type Ring = number[][];
