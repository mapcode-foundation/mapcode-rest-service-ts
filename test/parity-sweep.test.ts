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

// ---------------------------------------------------------------------------
// Parity sweep.
//
// Builds the app once and sweeps a grid of inputs through
// GET /mapcode/codes/{lat},{lon}/... asserting INTERNAL CONSISTENCY: the
// `international` mapcode the endpoint returns (code / territory / offsetMeters,
// as serialized) must equal what we recompute INDEPENDENTLY by calling
// mapcode-ts directly (encodeToInternational + decode) with the same lon
// wrapping (mapToLon) and the same offset rounding (Math.round(d*1e6)/1e6).
// offsetMeters is compared as a RAW number (not via formatDouble on both sides,
// which would mask a consistently-broken formatter).
//
// This guards against drift between the HTTP endpoint and the library: we are
// NOT asserting hardcoded Java golden bytes, we are asserting the endpoint
// matches an independent recomputation of the same library + formatting.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.ts";
import { createMapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";
import { Alphabet, encodeToInternational, decode } from "mapcode-ts";
import { mapToLon, distanceInMeters } from "../src/domain/geo.ts";

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

// Independent recomputation of the international mapcode the endpoint should
// emit for the given input, mirroring MapcodeResourceImpl.createMapcodeDTO +
// offsetFromLatLonInMeters exactly.
function expectedInternational(
  lat: number,
  lonRaw: number,
  precision: number,
  alphabet: Alphabet | null,
  includeOffset: boolean,
  includeTerritory: boolean,
  includeAlphabet: boolean
): { mapcode: string; mapcodeInAlphabet?: string; territory?: string; territoryInAlphabet?: string; offsetMeters?: number } {
  const lonDeg = mapToLon(lonRaw);
  const mc = encodeToInternational(lat, lonDeg);
  const code = mc.getCode(precision);
  const codeInAlphabet = mc.getCode(precision, alphabet);
  const territoryStr = mc.getTerritory().toString();
  const territoryInAlphabet = mc.getTerritory().toString(alphabet);
  // International territory is AAA → not a "local" territory; only emitted when
  // includeTerritory is requested. Mirrors createMapcodeDTO's includeOrLocal.
  const includeOrLocal = includeTerritory; // AAA !== AAA is false

  const out: {
    mapcode: string;
    mapcodeInAlphabet?: string;
    territory?: string;
    territoryInAlphabet?: string;
    offsetMeters?: number;
  } = { mapcode: code };

  if (includeAlphabet) {
    out.mapcodeInAlphabet = codeInAlphabet;
  } else if (codeInAlphabet !== code) {
    out.mapcodeInAlphabet = codeInAlphabet;
  }

  if (includeOrLocal) {
    out.territory = territoryStr;
    if (includeAlphabet) {
      out.territoryInAlphabet = territoryInAlphabet;
    } else if (territoryInAlphabet !== territoryStr) {
      out.territoryInAlphabet = territoryInAlphabet;
    }
  }

  if (includeOffset) {
    const p = decode(mc.getCode(precision), mc.getTerritory());
    const d = distanceInMeters(lat, lonDeg, p.getLatDeg(), p.getLonDeg());
    out.offsetMeters = Math.round(d * 1.0e6) / 1.0e6;
  }
  return out;
}

const LATS = [-90, -45, 0, 52.376514, 90];
const LONS = [-180, -1, 4.908542, 180, 181];
const PRECISIONS = [0, 2, 8];

interface IncludeCombo {
  label: string;
  param: string;
  offset: boolean;
  territory: boolean;
  alphabet: boolean;
}
const INCLUDE_COMBOS: IncludeCombo[] = [
  { label: "none", param: "", offset: false, territory: false, alphabet: false },
  { label: "offset,territory,alphabet,rectangle", param: "offset,territory,alphabet,rectangle", offset: true, territory: true, alphabet: true },
];

const ALPHABETS: { label: string; param?: string; alphabet: Alphabet | null }[] = [
  { label: "none", param: undefined, alphabet: null },
  { label: "GREEK", param: "GREEK", alphabet: Alphabet.GREEK },
];

describe("parity sweep — endpoint /mapcode/codes matches independent mapcode-ts recompute", () => {
  for (const lat of LATS) {
    for (const lonRaw of LONS) {
      for (const precision of PRECISIONS) {
        for (const inc of INCLUDE_COMBOS) {
          for (const alpha of ALPHABETS) {
            const qs: string[] = [];
            if (precision !== 0) qs.push(`precision=${precision}`);
            if (inc.param) qs.push(`include=${inc.param}`);
            if (alpha.param) qs.push(`alphabet=${alpha.param}`);
            const query = qs.length ? `?${qs.join("&")}` : "";
            // Default endpoint (no type) returns the MapcodesDTO which carries the
            // `international` field. (The /mapcodes type returns a bare array.)
            const url = `/mapcode/codes/${lat},${lonRaw}${query}`;

            it(`lat=${lat} lon=${lonRaw} prec=${precision} include=[${inc.label}] alphabet=${alpha.label}`, async () => {
              const res = await app.inject({
                method: "GET",
                url,
                headers: { accept: "application/json" },
              });
              expect(res.statusCode).toBe(200);
              const body = JSON.parse(res.body) as {
                international: {
                  mapcode: string;
                  mapcodeInAlphabet?: string;
                  territory?: string;
                  territoryInAlphabet?: string;
                  offsetMeters?: number;
                };
              };
              const actual = body.international;

              const exp = expectedInternational(
                lat,
                lonRaw,
                precision,
                alpha.alphabet,
                inc.offset,
                inc.territory,
                inc.alphabet
              );

              // Compare the serialized form for the mapcode string.
              expect(actual.mapcode).toBe(exp.mapcode);

              // mapcodeInAlphabet presence/value parity.
              expect(actual.mapcodeInAlphabet).toBe(exp.mapcodeInAlphabet);

              // territory / territoryInAlphabet parity.
              expect(actual.territory).toBe(exp.territory);
              expect(actual.territoryInAlphabet).toBe(exp.territoryInAlphabet);

              // offsetMeters parity: compare the RAW numbers directly. Applying
              // formatDouble to both sides would mask a consistently-broken
              // formatDouble — the very drift this sweep must catch. The value
              // parsed from the JSON body must equal the independently recomputed
              // Math.round(distanceInMeters*1e6)/1e6.
              if (exp.offsetMeters !== undefined) {
                expect(actual.offsetMeters).not.toBeUndefined();
                expect(actual.offsetMeters).toBe(exp.offsetMeters);
              } else {
                expect(actual.offsetMeters).toBeUndefined();
              }
            });
          }
        }
      }
    }
  }
});
