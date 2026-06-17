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
import type { Schema } from "../serialization/types.ts";
import {
  buildAlphabet,
  alphabetSchema,
  buildAlphabets,
  alphabetsSchema,
} from "../dto/index.ts";
import { ApiError, ApiInvalidFormatError, ApiIntegerOutOfRangeError } from "../errors.ts";
import { parseIntStrict, INTEGER_MAX } from "./params.ts";

// ---------------------------------------------------------------------------
// Module-level cache of the full alphabet DTO list (built once on first call).
// ---------------------------------------------------------------------------

let cachedAlphabetDTOs: Record<string, unknown>[] | null = null;

function getAllAlphabetDTOs(mapcodeService: MapcodeService): Record<string, unknown>[] {
  if (cachedAlphabetDTOs === null) {
    cachedAlphabetDTOs = mapcodeService.listAlphabets().map((a) =>
      buildAlphabet({ name: a.name })
    );
  }
  return cachedAlphabetDTOs;
}

// ---------------------------------------------------------------------------
// getAlphabets — port of MapcodeResourceImpl.getAlphabets.
// ---------------------------------------------------------------------------

export interface GetAlphabetsParams {
  /** Raw offset string (default "0"). */
  offset?: string;
  /** Raw count string (default "1000"). */
  count?: string;
}

export function handleGetAlphabets(
  params: GetAlphabetsParams,
  mapcodeService: MapcodeService
): { dto: Record<string, unknown>; schema: Schema } {
  const alphabets = getAllAlphabetDTOs(mapcodeService);
  const n = alphabets.length;

  // Parse count.
  const countStr = params.count ?? "1000";
  const count = parseIntStrict(countStr);
  if (count === null) {
    throw new ApiInvalidFormatError("count", countStr, "integer");
  }
  if (count < 0) {
    throw new ApiIntegerOutOfRangeError("count", count, 0, INTEGER_MAX);
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
  const slice = alphabets.slice(fromIndex, toIndex);

  const dto = buildAlphabets({ total: n, alphabets: slice });
  return { dto, schema: alphabetsSchema };
}

// ---------------------------------------------------------------------------
// getAlphabet — port of MapcodeResourceImpl.getAlphabet.
// ---------------------------------------------------------------------------

export interface GetAlphabetParams {
  /** The alphabet name (path parameter). */
  alphabet: string;
}

const API_ERROR_VALID_ALPHABET_CODES =
  "ROMAN|GREEK|CYRILLIC|HEBREW|DEVANAGARI|MALAYALAM|GEORGIAN|KATAKANA|THAI|LAO|ARMENIAN|BENGALI|GURMUKHI|TIBETAN|ARABIC|KOREAN|BURMESE|KHMER|SINHALESE|THAANA|CHINESE|TIFINAGH|TAMIL|AMHARIC|TELUGU|ODIA|KANNADA|GUJARATI";

export function handleGetAlphabet(
  params: GetAlphabetParams,
  mapcodeService: MapcodeService
): { dto: Record<string, unknown>; schema: Schema } {
  const { alphabet: alphabetParam } = params;

  let resolvedName: string;
  try {
    const resolved = mapcodeService.resolveAlphabet(alphabetParam);
    resolvedName = resolved.name;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiInvalidFormatError("alphabet", alphabetParam, API_ERROR_VALID_ALPHABET_CODES);
  }

  const dto = buildAlphabet({ name: resolvedName });
  return { dto, schema: alphabetSchema };
}

// ---------------------------------------------------------------------------
// (parseIntStrict is imported from ./params.ts)
// ---------------------------------------------------------------------------
