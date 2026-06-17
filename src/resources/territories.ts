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

import { AlphaCodeFormat } from "mapcode-ts";
import type { MapcodeService, Territory } from "../domain/mapcode-service.ts";
import type { Schema } from "../serialization/types.ts";
import {
  buildTerritory,
  territorySchema,
  buildTerritories,
  territoriesSchema,
  buildAlphabet,
} from "../dto/index.ts";
import { ApiInvalidFormatError, ApiIntegerOutOfRangeError } from "../errors.ts";

// ---------------------------------------------------------------------------
// Module-level cache of the full territory DTO list (built once on first call).
// ---------------------------------------------------------------------------

let cachedTerritoryDTOs: Record<string, unknown>[] | null = null;

function buildTerritoryDTO(t: Territory): Record<string, unknown> {
  return buildTerritory({
    alphaCode: t.toString(),
    alphaCodeMinimalUnambiguous: t.toAlphaCode(AlphaCodeFormat.MINIMAL_UNAMBIGUOUS),
    alphaCodeMinimal: t.toAlphaCode(AlphaCodeFormat.MINIMAL),
    fullName: t.getFullName(),
    parentTerritory: t.getParentTerritory()?.toString(),
    aliases: t.getAliases(),
    fullNameAliases: t.getFullNameAliases(),
    alphabets: t.getAlphabets().map((a) => buildAlphabet({ name: a.name })),
  });
}

function getAllTerritoryDTOs(mapcodeService: MapcodeService): Record<string, unknown>[] {
  if (cachedTerritoryDTOs === null) {
    cachedTerritoryDTOs = mapcodeService.listTerritories().map(buildTerritoryDTO);
  }
  return cachedTerritoryDTOs;
}

// ---------------------------------------------------------------------------
// getTerritories — port of MapcodeResourceImpl.getTerritories.
// ---------------------------------------------------------------------------

export interface GetTerritoriesParams {
  /** Raw offset string (default "0"). */
  offset?: string;
  /** Raw count string (default "1000"). */
  count?: string;
}

export function handleGetTerritories(
  params: GetTerritoriesParams,
  mapcodeService: MapcodeService
): { dto: Record<string, unknown>; schema: Schema } {
  const territories = getAllTerritoryDTOs(mapcodeService);
  const n = territories.length;

  // Parse count.
  const countStr = params.count ?? "1000";
  const count = parseIntStrict(countStr);
  if (count === null) {
    throw new ApiInvalidFormatError("count", countStr, "integer");
  }
  if (count < 0) {
    throw new ApiIntegerOutOfRangeError("count", count, 0, n);
  }

  // Parse offset.
  const offsetStr = params.offset ?? "0";
  const offset = parseIntStrict(offsetStr);
  if (offset === null) {
    throw new ApiInvalidFormatError("offset", offsetStr, "integer");
  }

  // Paging: negative offset counts from the end.
  const fromIndex = offset < 0 ? Math.max(0, n + offset) : Math.min(n, offset);
  const toIndex = Math.min(n, fromIndex + count);
  const slice = territories.slice(fromIndex, toIndex);

  const dto = buildTerritories({ total: n, territories: slice });
  return { dto, schema: territoriesSchema };
}

// ---------------------------------------------------------------------------
// getTerritory — port of MapcodeResourceImpl.getTerritory.
// ---------------------------------------------------------------------------

export interface GetTerritoryParams {
  /** The territory code (path parameter). */
  territory: string;
  /** Optional context (parent) territory for disambiguation. */
  context?: string;
}

export function handleGetTerritory(
  params: GetTerritoryParams,
  mapcodeService: MapcodeService
): { dto: Record<string, unknown>; schema: Schema } {
  const { territory: territoryParam } = params;
  const contextRaw = params.context !== undefined ? mapcodeService.htmlUnescape(params.context) : null;

  let resolved: Territory;
  try {
    resolved = mapcodeService.resolveTerritory(territoryParam, contextRaw);
  } catch {
    throw new ApiInvalidFormatError(
      "territory",
      territoryParam,
      "valid territory code (e.g. NLD, US-CA)"
    );
  }

  const dto = buildTerritoryDTO(resolved);
  return { dto, schema: territorySchema };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function parseIntStrict(s: string): number | null {
  if (s === "") return null;
  if (!/^[+-]?\d+$/.test(s)) return null;
  return parseInt(s, 10);
}
