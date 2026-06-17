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
import { UnknownMapcodeError } from "../domain/mapcode-service.ts";
import type { Schema } from "../serialization/types.ts";
import {
  buildPoint,
  pointSchema,
  buildRectangle,
  rectangleSchema,
} from "../dto/index.ts";
import {
  ApiInvalidFormatError,
  ApiNotFoundError,
} from "../errors.ts";

// ---------------------------------------------------------------------------
// Valid include tokens for the /coords endpoint (ported from ParamInclude enum)
// ---------------------------------------------------------------------------

const VALID_INCLUDE_TOKENS = new Set(["OFFSET", "TERRITORY", "ALPHABET", "RECTANGLE"]);
const VALID_INCLUDES_LOWER = "offset|territory|alphabet|rectangle";

// ---------------------------------------------------------------------------
// CoordsParams — the query/path parameters the handler needs
// ---------------------------------------------------------------------------

export interface CoordsParams {
  /** The mapcode string (URL-decoded path parameter). */
  code: string;
  /** Optional territory context for ambiguous codes. */
  context?: string;
  /** Must be absent/null — if present the handler returns 400. */
  territory?: string;
  /** Comma-separated include options, e.g. "RECTANGLE". Defaults to "". */
  include: string;
}

// ---------------------------------------------------------------------------
// handleCoords — framework-agnostic resource handler
// ---------------------------------------------------------------------------

/**
 * Decode a mapcode string to a lat/lon point (or a bounding rectangle when
 * `include=RECTANGLE` is requested).
 *
 * Ported from MapcodeResourceImpl.convertMapcodeToLatLon (lines 502–587).
 */
export function handleCoords(
  params: CoordsParams,
  mapcodeService: MapcodeService
): { dto: Record<string, unknown>; schema: Schema } {
  const { code, context, territory, include } = params;

  // 1. territory param must be absent — guards against accidental reuse of the
  //    /codes endpoint's territory= query param on the /coords endpoint.
  if (territory !== undefined && territory !== null) {
    throw new ApiInvalidFormatError("territory", territory, "null");
  }

  // 2. Parse include tokens (uppercase, comma-split).
  let foundRectangle = false;
  for (const raw of include.split(",")) {
    const arg = raw.trim().toUpperCase();
    if (arg === "") continue;
    if (!VALID_INCLUDE_TOKENS.has(arg)) {
      throw new ApiInvalidFormatError("include", include, VALID_INCLUDES_LOWER);
    }
    if (arg === "RECTANGLE") {
      foundRectangle = true;
    }
  }

  // 3. Resolve territory context (optional).
  let territoryContext: ReturnType<MapcodeService["resolveTerritory"]> | null = null;
  if (context !== undefined && context !== null) {
    try {
      territoryContext = mapcodeService.resolveTerritory(
        mapcodeService.htmlUnescape(context),
        null
      );
    } catch {
      throw new ApiInvalidFormatError("territory", context, "valid territory code");
    }
  }

  // 4. Validate mapcode format (syntax only).
  if (!mapcodeService.isValidMapcodeFormat(code)) {
    throw new ApiInvalidFormatError("mapcode", code, "[XXX] XX.XX[-XX]");
  }

  // 5. Decode.
  if (foundRectangle) {
    try {
      const rect = mapcodeService.decodeToRectangle(code, territoryContext);
      const dto = buildRectangle({
        southWest: { latDeg: rect.getSouthWest().getLatDeg(), lonDeg: rect.getSouthWest().getLonDeg() },
        northEast: { latDeg: rect.getNorthEast().getLatDeg(), lonDeg: rect.getNorthEast().getLonDeg() },
        center: { latDeg: rect.getCenter().getLatDeg(), lonDeg: rect.getCenter().getLonDeg() },
      });
      return { dto, schema: rectangleSchema };
    } catch (err) {
      if (err instanceof UnknownMapcodeError) {
        throw new ApiNotFoundError(
          `No rectangle found for mapcode='${code}', context=${territoryContext}`
        );
      }
      throw err;
    }
  } else {
    try {
      const point = mapcodeService.decode(code, territoryContext);
      const dto = buildPoint({ latDeg: point.getLatDeg(), lonDeg: point.getLonDeg() });
      return { dto, schema: pointSchema };
    } catch (err) {
      if (err instanceof UnknownMapcodeError) {
        throw new ApiNotFoundError(
          `No location found for mapcode='${code}', context=${territoryContext}`
        );
      }
      throw err;
    }
  }
}
