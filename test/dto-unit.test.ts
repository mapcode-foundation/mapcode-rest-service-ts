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
// DTO unit tests — ports of the Java getter/constructor unit tests:
//   ApiDTOTest.java
//   dto/TerritoryCandidateDTOTest.java
//   dto/TerritoryCandidateListDTOTest.java
//
// The Java DTOs are mutable JavaBeans (constructor + getters + setters + list
// wrapper classes with size()/get()). The TS port models DTOs as immutable
// plain objects produced by build* factories plus a serialization Schema; there
// are no setters and no ListDTO wrapper classes (lists are plain arrays). So:
//
//   - Constructor → getter cases are ported as build*() → field-access checks.
//   - List size()/get(i) cases are ported as array .length / [i] checks.
//   - Optional/null parent cases are ported (undefined ⇔ Java null).
//   - The unicode round-trip from checkMapcodeDTO is ported verbatim.
//   - Pure setter-mutation cases (e.g. setName/setTotal/setAliases collapsing an
//     array to one element) have NO TS counterpart (objects are immutable) and
//     are intentionally NOT ported.
//   - validate() has no TS counterpart (validation lives in the resource layer);
//     the TerritoryCandidate*Test "validate() ok" assertions reduce to field
//     and ordering checks here.
//
// Serialization parity for these DTOs is already covered exhaustively in
// test/dto.test.ts; this file only adds the field-construction/ordering cases
// dto.test.ts does not exercise.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  buildAlphabet,
  buildPoint,
  buildMapcode,
  buildMapcodes,
  buildTerritory,
  buildTerritories,
  buildVersion,
  buildTerritoryCandidate,
  buildTerritoryCandidates,
} from "../src/dto/index.ts";

// ===========================================================================
// ApiDTOTest ports
// ===========================================================================

describe("AlphabetDTO (checkAlphabetDTO)", () => {
  it("constructor sets name", () => {
    expect(buildAlphabet({ name: "x" }).name).toBe("x");
  });
});

describe("AlphabetListDTO / AlphabetsDTO (checkAlphabetListDTO, checkAlphabetsDTO)", () => {
  it("list preserves single entry", () => {
    const list = [buildAlphabet({ name: "x" })];
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("x");
  });

  it("array constructor preserves ROMAN/GREEK/ARABIC ordering", () => {
    const alphabets = ["ROMAN", "GREEK", "ARABIC"].map((name) => buildAlphabet({ name }));
    expect(alphabets).toHaveLength(3);
    expect(alphabets[0].name).toBe("ROMAN");
    expect(alphabets[1].name).toBe("GREEK");
    expect(alphabets[2].name).toBe("ARABIC");
  });
});

describe("PointDTO (checkCoordinatesDTO)", () => {
  it("constructor sets latDeg/lonDeg", () => {
    const p = buildPoint({ latDeg: 1.0, lonDeg: 2.0 });
    expect(p.latDeg).toBeCloseTo(1.0, 2);
    expect(p.lonDeg).toBeCloseTo(2.0, 2);
  });

  it("accepts boundary values -90 / -180", () => {
    const p = buildPoint({ latDeg: -90.0, lonDeg: -180.0 });
    expect(p.latDeg).toBeCloseTo(-90.0, 2);
    expect(p.lonDeg).toBeCloseTo(-180.0, 2);
  });
});

describe("MapcodeDTO (checkMapcodeDTO)", () => {
  it("constructor sets all five fields", () => {
    const x = buildMapcode({
      mapcode: "XX.XX",
      mapcodeInAlphabet: "YY.YY",
      territory: "NLD",
      territoryInAlphabet: "BEL",
      offsetMeters: 1.0,
    });
    expect(x.mapcode).toBe("XX.XX");
    expect(x.mapcodeInAlphabet).toBe("YY.YY");
    expect(x.territory).toBe("NLD");
    expect(x.territoryInAlphabet).toBe("BEL");
    expect(x.offsetMeters).toBeCloseTo(1.0, 2);
  });

  it("preserves unicode mapcodeInAlphabet / territory round-trip", () => {
    const x = buildMapcode({
      mapcode: "11.11",
      mapcodeInAlphabet: "ΗΠ.Θ2-Б",
      territory: "ΓΨΞ",
      territoryInAlphabet: "444",
      offsetMeters: 1.0,
    });
    expect(x.mapcode).toBe("11.11");
    expect(x.mapcodeInAlphabet).toBe("ΗΠ.Θ2-Б");
    expect(x.territory).toBe("ΓΨΞ");
    expect(x.territoryInAlphabet).toBe("444");
  });
});

describe("MapcodeListDTO / MapcodesDTO (checkMapcodeListDTO, checkMapcodesDTO)", () => {
  it("mapcode list preserves single entry", () => {
    const list = [
      buildMapcode({ mapcode: "XX.XX", mapcodeInAlphabet: "YY.YY", territory: "NLD", territoryInAlphabet: "BEL", offsetMeters: 1.0 }),
    ];
    expect(list).toHaveLength(1);
    expect(list[0].mapcode).toBe("XX.XX");
  });

  it("MapcodesDTO exposes local/international/mapcodes with nested field access", () => {
    const x = buildMapcodes({
      local: buildMapcode({ mapcode: "AA.AA", mapcodeInAlphabet: "aa.aa", territory: "USA", territoryInAlphabet: "usa", offsetMeters: 1.0 }),
      international: buildMapcode({ mapcode: "BB.BB", mapcodeInAlphabet: "bb.bb", territory: "CAN", territoryInAlphabet: "can", offsetMeters: 1.0 }),
      mapcodes: [
        buildMapcode({ mapcode: "XX.XX", mapcodeInAlphabet: "YY.YY", territory: "NLD", territoryInAlphabet: "BEL", offsetMeters: 1.0 }),
      ],
    });
    expect(x.local).not.toBeUndefined();
    expect((x.local as Record<string, unknown>).mapcode).toBe("AA.AA");
    expect((x.international as Record<string, unknown>).mapcodeInAlphabet).toBe("bb.bb");
    expect((x.mapcodes as Record<string, unknown>[])[0].territoryInAlphabet).toBe("BEL");
  });
});

describe("TerritoryDTO / TerritoryListDTO / TerritoriesDTO (checkTerritoryDTO, checkTerritoryListDTO, checkTerritoriesDTO)", () => {
  const buildSample = () =>
    buildTerritory({
      alphaCode: "a",
      alphaCodeMinimalUnambiguous: "b",
      alphaCodeMinimal: "c",
      fullName: "d",
      parentTerritory: "e",
      aliases: ["f", "g"],
      fullNameAliases: ["h", "i"],
      alphabets: ["ROMAN", "GREEK", "ARABIC"].map((name) => buildAlphabet({ name })),
    });

  it("constructor sets all fields and preserves alias array ordering", () => {
    const x = buildSample();
    expect(x.alphaCode).toBe("a");
    expect(x.alphaCodeMinimalUnambiguous).toBe("b");
    expect(x.alphaCodeMinimal).toBe("c");
    expect(x.fullName).toBe("d");
    expect(x.parentTerritory).toBe("e");
    const aliases = x.aliases as string[];
    expect(aliases).toHaveLength(2);
    expect(aliases[0]).toBe("f");
    expect(aliases[1]).toBe("g");
    const fullNameAliases = x.fullNameAliases as string[];
    expect(fullNameAliases).toHaveLength(2);
    expect(fullNameAliases[0]).toBe("h");
    expect(fullNameAliases[1]).toBe("i");
  });

  it("territory list preserves single entry", () => {
    const list = [buildSample()];
    expect(list).toHaveLength(1);
    expect(list[0].alphaCode).toBe("a");
  });

  it("TerritoriesDTO carries total + territories with field access", () => {
    const x = buildTerritories({ total: 10, territories: [buildSample()] });
    expect(x.total).toBe(10);
    expect((x.territories as Record<string, unknown>[])[0].alphaCode).toBe("a");
  });
});

describe("VersionDTO (checkVersionDTO)", () => {
  it("constructor sets version", () => {
    expect(buildVersion({ version: "x" }).version).toBe("x");
  });
});

// ===========================================================================
// TerritoryCandidateDTOTest ports
// ===========================================================================

describe("TerritoryCandidateDTO (TerritoryCandidateDTOTest)", () => {
  it("validateSubdivisionWithParent — subdivision keeps alphaCode + parentAlphaCode", () => {
    const dto = buildTerritoryCandidate({ alphaCode: "USA-CA", parentAlphaCode: "USA" });
    expect(dto.alphaCode).toBe("USA-CA");
    expect(dto.parentAlphaCode).toBe("USA");
  });

  it("validateCountryWithoutParent — country has no parentAlphaCode (Java null ⇔ undefined)", () => {
    const dto = buildTerritoryCandidate({ alphaCode: "NLD" });
    expect(dto.alphaCode).toBe("NLD");
    expect(dto.parentAlphaCode).toBeUndefined();
  });
});

// ===========================================================================
// TerritoryCandidateListDTOTest ports
// ===========================================================================

describe("TerritoryCandidateListDTO (TerritoryCandidateListDTOTest)", () => {
  it("validateEmpty — empty candidate list has length 0", () => {
    const dto = buildTerritoryCandidates({ territories: [] });
    expect(dto.territories as Record<string, unknown>[]).toHaveLength(0);
  });

  it("validateWithEntries — two candidates keep order USA-CA then USA", () => {
    const dto = buildTerritoryCandidates({
      territories: [
        buildTerritoryCandidate({ alphaCode: "USA-CA", parentAlphaCode: "USA" }),
        buildTerritoryCandidate({ alphaCode: "USA" }),
      ],
    });
    const territories = dto.territories as Record<string, unknown>[];
    expect(territories).toHaveLength(2);
    expect(territories[0].alphaCode).toBe("USA-CA");
    expect(territories[1].alphaCode).toBe("USA");
  });
});
