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

import {
  Territory,
  Alphabet,
  Mapcode,
  Point,
  Rectangle,
  encode,
  encodeRestrictToCountryISO,
  encodeToShortest,
  encodeToInternational,
  decode as mapcodeDescode,
  decodeToRectangle as mapcodeDecodeToRectangle,
  UnknownMapcodeError,
  UnknownTerritoryError,
  UnknownAlphabetError,
} from "mapcode-ts";

export {
  Territory,
  Alphabet,
  Mapcode,
  Point,
  Rectangle,
  UnknownMapcodeError,
  UnknownTerritoryError,
  UnknownAlphabetError,
};

// ---------------------------------------------------------------------------
// MapcodeService interface
// ---------------------------------------------------------------------------

export interface MapcodeService {
  /**
   * Resolve a territory string (case-insensitive, '-'/'_' normalized) with optional parent
   * disambiguation. Ports the Java `resolveTerritory` + `getTerritoryAlias` algorithm faithfully.
   * Throws if the territory cannot be resolved.
   */
  resolveTerritory(territory: string, parent: string | null): Territory;

  /**
   * Case-insensitive lookup for an Alphabet by name. Throws if unknown.
   */
  resolveAlphabet(name: string): Alphabet;

  /**
   * Validate that `code` is a known ISO2 or ISO3 country code. Returns the code as-is when valid.
   * Throws if neither ISO2 nor ISO3 can be found.
   */
  resolveCountry(code: string): string;

  /** Encode lat/lon to all mapcodes, optionally restricted to a territory. */
  encodeAll(lat: number, lon: number, territory: Territory | null): Mapcode[];

  /** Encode lat/lon to all mapcodes restricted to an ISO country code (2 or 3 chars). */
  encodeAllForCountry(lat: number, lon: number, country: string): Mapcode[];

  /**
   * Encode lat/lon to the shortest mapcode for the given territory.
   * Returns null instead of throwing when no mapcode exists for that location/territory.
   */
  encodeShortest(lat: number, lon: number, territory: Territory): Mapcode | null;

  /** Encode lat/lon to the unambiguous international mapcode (AAA). */
  encodeInternational(lat: number, lon: number): Mapcode;

  /**
   * Decode a mapcode string to a Point. Pass an optional territory context for ambiguous codes.
   * Throws UnknownMapcodeError on invalid mapcode.
   */
  decode(code: string, context: Territory | null): Point;

  /** Decode a mapcode string to its bounding Rectangle. Throws on invalid mapcode. */
  decodeToRectangle(code: string, context: Territory | null): Rectangle;

  /** Returns true if the string matches the mapcode format (syntax only, not semantics). */
  isValidMapcodeFormat(code: string): boolean;

  /** Return all territories. */
  listTerritories(): Territory[];

  /** Return all alphabets. */
  listAlphabets(): Alphabet[];

  /**
   * Unescape HTML entities in a string. Handles the named entities that
   * Apache Commons `StringEscapeUtils.unescapeHtml4` covers in practice:
   *   &amp; &lt; &gt; &quot; &apos; &#39; &#NN; &#xNN;
   */
  htmlUnescape(s: string): string;
}

// ---------------------------------------------------------------------------
// getTerritoryAlias — port of MapcodeResourceImpl.getTerritoryAlias
// ---------------------------------------------------------------------------

/**
 * Search all territories for one whose alias list contains `paramAlias`
 * (after replacing '_' with '-' and uppercasing).
 * Returns null when not found.
 */
function getTerritoryAlias(paramAlias: string): Territory | null {
  const aliasToLookFor = paramAlias.replace(/_/g, "-").toUpperCase();
  return Territory.values().find((t) => t.getAliases().includes(aliasToLookFor)) ?? null;
}

// ---------------------------------------------------------------------------
// resolveTerritory — port of MapcodeResourceImpl.resolveTerritory
// ---------------------------------------------------------------------------

/**
 * Port of the Java `resolveTerritory` private static method.
 *
 * Algorithm:
 * 1. If a parent string is provided:
 *    a. Normalise: replace '-' → '_', uppercase, call Territory.fromString.
 *    b. If the resolved territory itself has a parent, use that parent instead
 *       (e.g. "US-IN" → parent is "USA", so use USA as context).
 *    c. If fromString threw, try getTerritoryAlias. Throw on failure.
 * 2. With the resolved parentTerritory (or null), call Territory.fromString(code, parent).
 * 3. If that throws (or no parent), fall back to Territory.fromString(code) without parent.
 */
function resolveTerritory(paramTerritory: string, paramParent: string | null): Territory {
  let parentTerritory: Territory | null = null;

  if (paramParent !== null) {
    let context: Territory;
    try {
      const cleaned = paramParent.replace(/-/g, "_").toUpperCase();
      context = Territory.fromString(cleaned);
      const parent = context.getParentTerritory();
      if (parent !== null) {
        context = parent;
      }
    } catch {
      // Check if it was an alias.
      const alias = getTerritoryAlias(paramParent);
      if (alias === null) {
        throw new Error(
          `Invalid parent territory '${paramParent}': not a known territory or alias`
        );
      }
      context = alias;
    }

    // Use the resolved context — mirroring Java's Territory.valueOf(context.toString())
    // which effectively no-ops on valid territories. It can throw (IllegalArgumentException)
    // if the code isn't a valid enum name, in which case we silently use null.
    try {
      parentTerritory = Territory.fromString(context.toString());
    } catch {
      parentTerritory = null;
    }
  }

  // Try with parent if available.
  if (parentTerritory !== null) {
    try {
      return Territory.fromString(paramTerritory.toUpperCase(), parentTerritory);
    } catch {
      // If using the parent fails, fall through and try without parent.
    }
  }

  return Territory.fromString(paramTerritory.toUpperCase());
}

// ---------------------------------------------------------------------------
// resolveAlphabet
// ---------------------------------------------------------------------------

function resolveAlphabet(name: string): Alphabet {
  const upper = name.toUpperCase();
  try {
    return Alphabet.fromString(upper);
  } catch {
    throw new UnknownAlphabetError(`Unknown alphabet: '${name}'`);
  }
}

// ---------------------------------------------------------------------------
// resolveCountry
// ---------------------------------------------------------------------------

function resolveCountry(code: string): string {
  const upper = code.toUpperCase();
  // Try ISO2 first (2-char codes), then ISO3 (3-char codes).
  if (upper.length === 2) {
    const iso2Codes = Territory.allCountryISO2Codes();
    if (iso2Codes.has(upper)) {
      return code;
    }
    throw new Error(`Unknown country ISO2 code: '${code}'`);
  }
  if (upper.length === 3) {
    const iso3Codes = Territory.allCountryISO3Codes();
    if (iso3Codes.has(upper)) {
      return code;
    }
    throw new Error(`Unknown country ISO3 code: '${code}'`);
  }
  throw new Error(`Invalid country code length for '${code}': must be 2 or 3 characters`);
}

// ---------------------------------------------------------------------------
// htmlUnescape
// ---------------------------------------------------------------------------

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function htmlUnescape(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (_, dec, hex, named) => {
    if (dec !== undefined) {
      return String.fromCharCode(parseInt(dec, 10));
    }
    if (hex !== undefined) {
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (named !== undefined) {
      return HTML_NAMED_ENTITIES[named.toLowerCase()] ?? `&${named};`;
    }
    return _;
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMapcodeService(): MapcodeService {
  return {
    resolveTerritory,
    resolveAlphabet,
    resolveCountry,

    encodeAll(lat, lon, territory) {
      return encode(lat, lon, territory ?? undefined);
    },

    encodeAllForCountry(lat, lon, country) {
      return encodeRestrictToCountryISO(lat, lon, country);
    },

    encodeShortest(lat, lon, territory) {
      try {
        return encodeToShortest(lat, lon, territory);
      } catch (err) {
        if (err instanceof UnknownMapcodeError) {
          return null;
        }
        // For other errors (e.g. point outside territory), also return null
        return null;
      }
    },

    encodeInternational(lat, lon) {
      return encodeToInternational(lat, lon);
    },

    decode(code, context) {
      return mapcodeDescode(code, context ?? undefined);
    },

    decodeToRectangle(code, context) {
      return mapcodeDecodeToRectangle(code, context ?? undefined);
    },

    isValidMapcodeFormat(code) {
      return Mapcode.isValidMapcodeFormat(code);
    },

    listTerritories() {
      return Territory.values();
    },

    listAlphabets() {
      return Alphabet.values();
    },

    htmlUnescape,
  };
}
