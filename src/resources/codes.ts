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

import type { MapcodeService } from "../domain/mapcode-service.ts";
import { Territory, Alphabet, Mapcode, Rectangle, UnknownMapcodeError } from "../domain/mapcode-service.ts";
import { decode as mapcodeDecode } from "mapcode-ts";
import type { BoundaryService } from "../domain/boundary-service.ts";
import { mapToLon, distanceInMeters } from "../domain/geo.ts";
import type { Schema } from "../serialization/types.ts";
import {
  buildMapcode,
  mapcodeSchema,
  buildMapcodes,
  mapcodesSchema,
  mapcodeListSchema,
  buildTerritoryCandidate,
  buildTerritoryCandidates,
  territoryCandidatesSchema,
} from "../dto/index.ts";
import { parseIntStrict } from "./params.ts";
import {
  ApiInvalidFormatError,
  ApiNotFoundError,
  ApiConflictError,
} from "../errors.ts";

// ---------------------------------------------------------------------------
// Valid include / type tokens (ported from ParamInclude / ParamType enums).
// ---------------------------------------------------------------------------

const VALID_INCLUDE_TOKENS = new Set(["OFFSET", "TERRITORY", "ALPHABET", "RECTANGLE"]);
const VALID_INCLUDES_LOWER = "offset|territory|alphabet|rectangle";
const VALID_TYPES_LOWER = "mapcodes|local|international";

// ApiConstants.
const API_LAT_MIN = -90.0;
const API_LAT_MAX = 90.0;
const API_PRECISION_MIN = 0;
const API_PRECISION_MAX = 8;

// ---------------------------------------------------------------------------
// CodesParams — the path/query parameters the handler needs.
// ---------------------------------------------------------------------------

export interface CodesParams {
  latStr: string;
  lonStr: string;
  /** "mapcodes" | "local" | "international" (case-insensitive) or undefined. */
  type?: string;
  /** Raw precision string; defaults to "0". */
  precision?: string;
  territory?: string;
  country?: string;
  context?: string;
  alphabet?: string;
  /** Comma-separated include options. Defaults to "". */
  include: string;
}

// A discriminated handler result: either a single DTO (object) or a bare list.
export type CodesResult =
  | { kind: "object"; dto: Record<string, unknown>; schema: Schema }
  | { kind: "list"; items: Record<string, unknown>[]; schema: Schema };

// A mapcode paired with its decoded bounding rectangle.
interface MapcodeAndRectangle {
  mapcode: Mapcode;
  rectangle: Rectangle;
}

// ---------------------------------------------------------------------------
// handleCodes — port of MapcodeResourceImpl.convertLatLonToMapcode (main overload).
// ---------------------------------------------------------------------------

export function handleCodes(params: CodesParams, mapcodeService: MapcodeService, boundaryService: BoundaryService): CodesResult {
  const { latStr, lonStr, type: paramType, context, territory: paramTerritory, country: paramCountry, alphabet: paramAlphabet, include } = params;
  const paramPrecision = params.precision;

  // Prevent 'context' from inadvertently being specified.
  if (context !== undefined && context !== null) {
    throw new ApiInvalidFormatError("context", context, "null");
  }

  // Check lat range.
  const latDeg = Number(emptyIfNull(latStr));
  if (latStr === "" || !Number.isFinite(latDeg) || !isBetween(latDeg, API_LAT_MIN, API_LAT_MAX)) {
    throw new ApiInvalidFormatError("latDeg", latStr, `[${API_LAT_MIN}, ${API_LAT_MAX}]`);
  }

  // Check lon range (wrapped to [-180, 180]).
  const lonRaw = Number(emptyIfNull(lonStr));
  if (lonStr === "" || !Number.isFinite(lonRaw)) {
    throw new ApiInvalidFormatError("latDeg", lonStr, "Double");
  }
  const lonDeg = mapToLon(lonRaw);

  // Check precision (absent → default "0"; present-but-empty "" → 400).
  const precisionStr = paramPrecision ?? "0";
  const precision = parseIntStrict(precisionStr);
  if (precision === null || !isBetween(precision, API_PRECISION_MIN, API_PRECISION_MAX)) {
    throw new ApiInvalidFormatError("precision", paramPrecision, `[${API_PRECISION_MIN}, ${API_PRECISION_MAX}]`);
  }

  // territory XOR country.
  if (paramTerritory !== undefined && paramTerritory !== null && paramCountry !== undefined && paramCountry !== null) {
    throw new ApiConflictError("Cannot specify both territory and country");
  }

  // Resolve territory or validate country.
  let territory: Territory | null = null;
  let country: string | null = null;
  if (paramTerritory !== undefined && paramTerritory !== null) {
    try {
      territory = mapcodeService.resolveTerritory(mapcodeService.htmlUnescape(paramTerritory), null);
    } catch {
      throw new ApiInvalidFormatError("territory", paramTerritory, "valid territory code");
    }
  } else if (paramCountry !== undefined && paramCountry !== null) {
    try {
      country = mapcodeService.resolveCountry(mapcodeService.htmlUnescape(paramCountry));
    } catch {
      throw new ApiInvalidFormatError("country", paramCountry, "valid country code");
    }
  }

  // Resolve alphabet (optional).
  let alphabet: Alphabet | null = null;
  if (paramAlphabet !== undefined && paramAlphabet !== null) {
    try {
      alphabet = mapcodeService.resolveAlphabet(paramAlphabet);
    } catch {
      throw new ApiInvalidFormatError("alphabet", paramAlphabet, "valid alphabet code");
    }
  }

  // Check type.
  let type: "MAPCODES" | "LOCAL" | "INTERNATIONAL" | null = null;
  if (paramType !== undefined && paramType !== null) {
    const upper = paramType.toUpperCase();
    if (upper === "MAPCODES" || upper === "LOCAL" || upper === "INTERNATIONAL") {
      type = upper;
    } else {
      throw new ApiInvalidFormatError("type", paramType, VALID_TYPES_LOWER);
    }
  }

  // Parse include flags.
  let includeOffset = false;
  let includeTerritory = false;
  let includeAlphabet = false;
  let includeRectangle = false;
  for (const raw of include.toUpperCase().split(",")) {
    if (raw === "") continue;
    if (!VALID_INCLUDE_TOKENS.has(raw)) {
      throw new ApiInvalidFormatError("include", include, VALID_INCLUDES_LOWER);
    }
    if (raw === "OFFSET") includeOffset = true;
    if (raw === "TERRITORY") includeTerritory = true;
    if (raw === "ALPHABET") includeAlphabet = true;
    if (raw === "RECTANGLE") includeRectangle = true;
  }

  // Encode.
  const mapcodesAndRectangles: MapcodeAndRectangle[] = [];
  let mapcodeInternationalAndRectangle: MapcodeAndRectangle;
  let mapcodeLocalAndRectangle: MapcodeAndRectangle | null;
  try {
    const mapcodes = country !== null
      ? mapcodeService.encodeAllForCountry(latDeg, lonDeg, country)
      : mapcodeService.encodeAll(latDeg, lonDeg, territory);

    for (const mapcode of mapcodes) {
      try {
        const rectangle = mapcodeService.decodeToRectangle(mapcode.getCode(), mapcode.getTerritory());
        mapcodesAndRectangles.push({ mapcode, rectangle });
      } catch (err) {
        if (!(err instanceof UnknownMapcodeError)) throw err;
        // Unknown mapcode — skip, matching the Java service which only logs.
      }
    }

    const mapcodeInternational = mapcodeService.encodeInternational(latDeg, lonDeg);
    mapcodeInternationalAndRectangle = {
      mapcode: mapcodeInternational,
      rectangle: mapcodeService.decodeToRectangle(mapcodeInternational.getCode(), null),
    };

    // Shortest local mapcode.
    let mapcodeLocal: Mapcode | null = null;
    if (country !== null) {
      mapcodeLocal = mapcodeService.encodeShortest(latDeg, lonDeg, Territory.fromCountryISO(country));
    } else if (territory !== null) {
      mapcodeLocal = mapcodeService.encodeShortest(latDeg, lonDeg, territory);
    } else {
      let localTerritory: Territory | null = null;
      for (const mapcode of mapcodes) {
        if (mapcode.getTerritory() !== Territory.AAA) {
          if (localTerritory === null) {
            localTerritory = mapcode.getTerritory();
            mapcodeLocal = mapcode;
          } else if (localTerritory !== mapcode.getTerritory()) {
            if (mapcode.getCode().length < (mapcodeLocal as Mapcode).getCode().length) {
              mapcodeLocal = mapcode;
              localTerritory = mapcode.getTerritory();
            }
          }
        }
      }
    }
    mapcodeLocalAndRectangle = mapcodeLocal === null
      ? null
      : { mapcode: mapcodeLocal, rectangle: mapcodeService.decodeToRectangle(mapcodeLocal.getCode(), mapcodeLocal.getTerritory()) };
  } catch (err) {
    if (err instanceof UnknownMapcodeError) {
      throw new ApiNotFoundError(`No mapcode found for lat=${latDeg}, lon=${lonDeg}, territory=${territory}`);
    }
    throw err;
  }

  const dtoOf = (mr: MapcodeAndRectangle) =>
    createMapcodeDTO(mr, precision, alphabet, includeOffset, includeTerritory, includeAlphabet, includeRectangle, latDeg, lonDeg);

  if (type === null) {
    // Boundary-derived territory candidates (ranked).
    const territoryMatches = boundaryService.lookup(latDeg, lonDeg);
    const territoryCandidates = territoryMatches.length === 0
      ? null
      : territoryMatches.map((m) =>
          buildTerritoryCandidate({ alphaCode: m.alphaCode, parentAlphaCode: m.parentAlphaCode ?? undefined }));

    let effectiveLocalAndRectangle = mapcodeLocalAndRectangle;
    if (territoryCandidates !== null) {
      // Build a rank map (first occurrence wins).
      const territoryRank = new Map<string, number>();
      for (let i = 0; i < territoryMatches.length; i++) {
        if (!territoryRank.has(territoryMatches[i].alphaCode)) {
          territoryRank.set(territoryMatches[i].alphaCode, i);
        }
      }
      // Stable sort by rank (codes whose territory is not present go last).
      const MAX = Number.MAX_SAFE_INTEGER;
      stableSort(mapcodesAndRectangles, (a, b) => {
        const ra = territoryRank.get(a.mapcode.getTerritory().toString()) ?? MAX;
        const rb = territoryRank.get(b.mapcode.getTerritory().toString()) ?? MAX;
        return ra - rb;
      });
      const topTerritoryAlpha = territoryMatches[0].alphaCode;
      for (const mr of mapcodesAndRectangles) {
        if (topTerritoryAlpha === mr.mapcode.getTerritory().toString()) {
          effectiveLocalAndRectangle = mr;
          break;
        }
      }
    }

    const dto = buildMapcodes({
      local: effectiveLocalAndRectangle === null ? undefined : dtoOf(effectiveLocalAndRectangle),
      international: dtoOf(mapcodeInternationalAndRectangle),
      mapcodes: mapcodesAndRectangles.map(dtoOf),
      territories: territoryCandidates ?? undefined,
    });
    return { kind: "object", dto, schema: mapcodesSchema };
  }

  switch (type) {
    case "LOCAL": {
      if (mapcodeLocalAndRectangle === null) {
        throw new ApiNotFoundError(`No local mapcode for: ${mapcodeInternationalAndRectangle.mapcode.getCode()}`);
      }
      return { kind: "object", dto: dtoOf(mapcodeLocalAndRectangle), schema: mapcodeSchema };
    }
    case "INTERNATIONAL":
      return { kind: "object", dto: dtoOf(mapcodeInternationalAndRectangle), schema: mapcodeSchema };
    case "MAPCODES":
      return { kind: "list", items: mapcodesAndRectangles.map(dtoOf), schema: mapcodeListSchema };
  }
}

// ---------------------------------------------------------------------------
// createMapcodeDTO — port of MapcodeResourceImpl.createMapcodeDTO.
// ---------------------------------------------------------------------------

function createMapcodeDTO(
  mr: MapcodeAndRectangle,
  precision: number,
  alphabet: Alphabet | null,
  includeOffset: boolean,
  includeTerritory: boolean,
  includeAlphabet: boolean,
  includeRectangle: boolean,
  latDeg: number,
  lonDeg: number
): Record<string, unknown> {
  const { mapcode, rectangle } = mr;
  const code = mapcode.getCode(precision);
  const codeInAlphabet = mapcode.getCode(precision, alphabet);
  const territoryStr = mapcode.getTerritory().toString();
  const territoryInAlphabet = mapcode.getTerritory().toString(alphabet);
  const includeOrLocal = includeTerritory || mapcode.getTerritory() !== Territory.AAA;

  return buildMapcode({
    mapcode: code,
    mapcodeInAlphabet: includeAlphabet ? codeInAlphabet : (codeInAlphabet === code ? undefined : codeInAlphabet),
    territory: includeOrLocal ? territoryStr : undefined,
    territoryInAlphabet: includeOrLocal
      ? (includeAlphabet ? territoryInAlphabet : (territoryInAlphabet === territoryStr ? undefined : territoryInAlphabet))
      : undefined,
    offsetMeters: includeOffset ? offsetFromLatLonInMeters(latDeg, lonDeg, mapcode, precision) : undefined,
    rectangle: includeRectangle
      ? {
          southWest: { latDeg: rectangle.getSouthWest().getLatDeg(), lonDeg: rectangle.getSouthWest().getLonDeg() },
          northEast: { latDeg: rectangle.getNorthEast().getLatDeg(), lonDeg: rectangle.getNorthEast().getLonDeg() },
          center: { latDeg: rectangle.getCenter().getLatDeg(), lonDeg: rectangle.getCenter().getLonDeg() },
        }
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// offsetFromLatLonInMeters — port of MapcodeResourceImpl.offsetFromLatLonInMeters.
// ---------------------------------------------------------------------------

function offsetFromLatLonInMeters(latDeg: number, lonDeg: number, mapcode: Mapcode, precision: number): number {
  const million = 1.0e6;
  // The Java implementation decodes the mapcode (with its territory) and measures
  // the distance from the requested point to the decoded centre.
  // (decode never throws here in practice; matches the Java try/catch returning 0.)
  // The decode is done through MapcodeCodec.decode, so do it directly here.
  const point = decodeForOffset(mapcode, precision);
  if (point === null) return 0.0;
  const distanceMeters = distanceInMeters(latDeg, lonDeg, point.latDeg, point.lonDeg);
  return Math.round(distanceMeters * million) / million;
}

// Decode the mapcode (with its own territory) to the centre point used for the
// offset distance. Mirrors MapcodeCodec.decode in offsetFromLatLonInMeters.
function decodeForOffset(mapcode: Mapcode, precision: number): { latDeg: number; lonDeg: number } | null {
  try {
    const p = mapcodeDecode(mapcode.getCode(precision), mapcode.getTerritory());
    return { latDeg: p.getLatDeg(), lonDeg: p.getLonDeg() };
  } catch (err) {
    if (err instanceof UnknownMapcodeError) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// handleTerritoriesForLatLon — port of MapcodeResourceImpl.getTerritoriesForLatLon.
// ---------------------------------------------------------------------------

export function handleTerritoriesForLatLon(
  latStr: string,
  lonStr: string,
  boundaryService: BoundaryService
): { dto: Record<string, unknown>; schema: Schema } {
  const latDeg = Number(emptyIfNull(latStr));
  if (latStr === "" || !Number.isFinite(latDeg) || !isBetween(latDeg, API_LAT_MIN, API_LAT_MAX)) {
    throw new ApiInvalidFormatError("latDeg", latStr, `[${API_LAT_MIN}, ${API_LAT_MAX}]`);
  }
  const lonRaw = Number(emptyIfNull(lonStr));
  if (lonStr === "" || !Number.isFinite(lonRaw)) {
    throw new ApiInvalidFormatError("lonDeg", lonStr, "Double");
  }
  const lonDeg = mapToLon(lonRaw);

  const matches = boundaryService.lookup(latDeg, lonDeg);
  const dto = buildTerritoryCandidates({
    territories: matches.map((m) =>
      buildTerritoryCandidate({ alphaCode: m.alphaCode, parentAlphaCode: m.parentAlphaCode ?? undefined })),
  });
  return { dto, schema: territoryCandidatesSchema };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function emptyIfNull(s: string | undefined | null): string {
  return s ?? "";
}

function isBetween(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

/** Stable sort in place (Array.prototype.sort is stable in V8, but be explicit). */
function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): void {
  const indexed = arr.map((v, i) => [v, i] as [T, number]);
  indexed.sort((a, b) => {
    const c = cmp(a[0], b[0]);
    return c !== 0 ? c : a[1] - b[1];
  });
  for (let i = 0; i < arr.length; i++) arr[i] = indexed[i][0];
}
