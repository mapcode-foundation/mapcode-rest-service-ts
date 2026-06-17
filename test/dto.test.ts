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

import { describe, it, expect } from "vitest";
import { toJson } from "../src/serialization/json.ts";
import { toXml } from "../src/serialization/xml.ts";
import * as dto from "../src/dto/index.ts";

// ---------------------------------------------------------------------------
// VersionDTO
// ---------------------------------------------------------------------------

describe("VersionDTO", () => {
  it("JSON — ApiOthersTest.checkVersionJson", () => {
    const v = dto.buildVersion({ version: "1.0" });
    expect(toJson(v, dto.versionSchema)).toBe('{"version":"1.0"}');
  });

  it("XML — ApiOthersTest.checkVersionXmlJson", () => {
    const v = dto.buildVersion({ version: "1.0" });
    expect(toXml(v, dto.versionSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><version><version>1.0</version></version>',
    );
  });
});

// ---------------------------------------------------------------------------
// AlphabetDTO
// ---------------------------------------------------------------------------

describe("AlphabetDTO", () => {
  it("JSON — ApiAlphabetsTest.checkAlphabetJson (GREEK)", () => {
    const a = dto.buildAlphabet({ name: "GREEK" });
    expect(toJson(a, dto.alphabetSchema)).toBe('{"name":"GREEK"}');
  });

  it("XML — ApiAlphabetsTest.checkAlphabetXmlJson (GREEK)", () => {
    const a = dto.buildAlphabet({ name: "GREEK" });
    expect(toXml(a, dto.alphabetSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabet><name>GREEK</name></alphabet>',
    );
  });
});

// ---------------------------------------------------------------------------
// AlphabetsDTO — JSON + XML (objectListUnwrapped)
// ---------------------------------------------------------------------------

describe("AlphabetsDTO", () => {
  it("JSON 28 alphabets — ApiAlphabetsTest.checkAlphabetsJson", () => {
    const alphabetNames = [
      "ROMAN", "GREEK", "CYRILLIC", "HEBREW", "DEVANAGARI", "MALAYALAM",
      "GEORGIAN", "KATAKANA", "THAI", "LAO", "ARMENIAN", "BENGALI",
      "GURMUKHI", "TIBETAN", "ARABIC", "KOREAN", "BURMESE", "KHMER",
      "SINHALESE", "THAANA", "CHINESE", "TIFINAGH", "TAMIL", "AMHARIC",
      "TELUGU", "ODIA", "KANNADA", "GUJARATI",
    ];
    const a = dto.buildAlphabets({
      total: 28,
      alphabets: alphabetNames.map((name) => dto.buildAlphabet({ name })),
    });
    expect(toJson(a, dto.alphabetsSchema)).toBe(
      '{"total":28,"alphabets":[{"name":"ROMAN"},{"name":"GREEK"},{"name":"CYRILLIC"},{"name":"HEBREW"},{"name":"DEVANAGARI"},{"name":"MALAYALAM"},{"name":"GEORGIAN"},{"name":"KATAKANA"},{"name":"THAI"},{"name":"LAO"},{"name":"ARMENIAN"},{"name":"BENGALI"},{"name":"GURMUKHI"},{"name":"TIBETAN"},{"name":"ARABIC"},{"name":"KOREAN"},{"name":"BURMESE"},{"name":"KHMER"},{"name":"SINHALESE"},{"name":"THAANA"},{"name":"CHINESE"},{"name":"TIFINAGH"},{"name":"TAMIL"},{"name":"AMHARIC"},{"name":"TELUGU"},{"name":"ODIA"},{"name":"KANNADA"},{"name":"GUJARATI"}]}',
    );
  });

  it("JSON count=2 — ApiAlphabetsTest.checkAlphabetsCountJson", () => {
    const a = dto.buildAlphabets({
      total: 28,
      alphabets: [dto.buildAlphabet({ name: "ROMAN" }), dto.buildAlphabet({ name: "GREEK" })],
    });
    expect(toJson(a, dto.alphabetsSchema)).toBe(
      '{"total":28,"alphabets":[{"name":"ROMAN"},{"name":"GREEK"}]}',
    );
  });

  it("XML count=2 — ApiAlphabetsTest.checkAlphabetsCountXml (ROMAN, GREEK)", () => {
    const a = dto.buildAlphabets({
      total: 28,
      alphabets: [dto.buildAlphabet({ name: "ROMAN" }), dto.buildAlphabet({ name: "GREEK" })],
    });
    expect(toXml(a, dto.alphabetsSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabets><total>28</total><alphabet><name>ROMAN</name></alphabet><alphabet><name>GREEK</name></alphabet></alphabets>',
    );
  });
});

// ---------------------------------------------------------------------------
// MapcodeDTO
// ---------------------------------------------------------------------------

describe("MapcodeDTO", () => {
  it("JSON with territory — ApiCodesTest.checkCodesLocalJson (NLD)", () => {
    const m = dto.buildMapcode({ mapcode: "QKM.N4", territory: "NLD" });
    expect(toJson(m, dto.mapcodeSchema)).toBe('{"mapcode":"QKM.N4","territory":"NLD"}');
  });

  it("JSON without territory (international) — ApiCodesTest.checkCodesInternationalJson", () => {
    const m = dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" });
    expect(toJson(m, dto.mapcodeSchema)).toBe('{"mapcode":"VJ0L6.9PNQ"}');
  });

  it("JSON with all include fields — ApiCodesTest.checkCodesIncludeJson (first mapcode)", () => {
    const m = dto.buildMapcode({
      mapcode: "QKM.N4",
      mapcodeInAlphabet: "QKM.N4",
      territory: "NLD",
      territoryInAlphabet: "NLD",
      offsetMeters: 2.843693,
    });
    expect(toJson(m, dto.mapcodeSchema)).toBe(
      '{"mapcode":"QKM.N4","mapcodeInAlphabet":"QKM.N4","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.843693}',
    );
  });

  it("XML with territory — ApiCodesTest.checkCodesLocalXml", () => {
    const m = dto.buildMapcode({ mapcode: "QKM.N4", territory: "NLD" });
    expect(toXml(m, dto.mapcodeSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcode><mapcode>QKM.N4</mapcode><territory>NLD</territory></mapcode>',
    );
  });

  it("XML without territory (international) — ApiCodesTest.checkCodesInternationalXml", () => {
    const m = dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" });
    expect(toXml(m, dto.mapcodeSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode>',
    );
  });

  it("XML with all include fields — ApiCodesTest.checkCodesIncludeXml (first mapcode)", () => {
    const m = dto.buildMapcode({
      mapcode: "QKM.N4",
      mapcodeInAlphabet: "QKM.N4",
      territory: "NLD",
      territoryInAlphabet: "NLD",
      offsetMeters: 2.843693,
    });
    expect(toXml(m, dto.mapcodeSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcode><mapcode>QKM.N4</mapcode><mapcodeInAlphabet>QKM.N4</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.843693</offsetMeters></mapcode>',
    );
  });
});

// ---------------------------------------------------------------------------
// MapcodeListDTO — JSON (bare array) + XML (objectListUnwrapped)
// ---------------------------------------------------------------------------

describe("MapcodeListDTO", () => {
  it("JSON bare array — ApiCodesTest.checkCodesMapcodesJson (TEST_LATLON2)", () => {
    const items = [
      dto.buildMapcode({ mapcode: "QKM.N4", territory: "NLD" }),
      dto.buildMapcode({ mapcode: "CZQ.376", territory: "NLD" }),
      dto.buildMapcode({ mapcode: "N39J.QW0", territory: "NLD" }),
      dto.buildMapcode({ mapcode: "VHVN4.YZ74" }),
    ];
    expect(toJson(items, dto.mapcodeListSchema)).toBe(
      '[{"mapcode":"QKM.N4","territory":"NLD"},{"mapcode":"CZQ.376","territory":"NLD"},{"mapcode":"N39J.QW0","territory":"NLD"},{"mapcode":"VHVN4.YZ74"}]',
    );
  });

  it("JSON bare array international only — ApiCodesTest.checkCodesMapcodesJson (TEST_LATLON_INTL)", () => {
    const items = [dto.buildMapcode({ mapcode: "WHWZG.5Q6Q" })];
    expect(toJson(items, dto.mapcodeListSchema)).toBe('[{"mapcode":"WHWZG.5Q6Q"}]');
  });

  it("XML — same data as TEST_LATLON2 (unwrapped items under <mapcodes> root)", () => {
    // MapcodeListDTO XML: toXml receives a plain object {mapcodes:[...]} built from the array.
    // The xmlOrder uses objectListUnwrapped so items emit directly under <mapcodes>.
    const value: Record<string, unknown> = {
      mapcodes: [
        dto.buildMapcode({ mapcode: "QKM.N4", territory: "NLD" }),
        dto.buildMapcode({ mapcode: "CZQ.376", territory: "NLD" }),
        dto.buildMapcode({ mapcode: "N39J.QW0", territory: "NLD" }),
        dto.buildMapcode({ mapcode: "VHVN4.YZ74" }),
      ],
    };
    expect(toXml(value, dto.mapcodeListSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><mapcode><mapcode>QKM.N4</mapcode><territory>NLD</territory></mapcode><mapcode><mapcode>CZQ.376</mapcode><territory>NLD</territory></mapcode><mapcode><mapcode>N39J.QW0</mapcode><territory>NLD</territory></mapcode><mapcode><mapcode>VHVN4.YZ74</mapcode></mapcode></mapcodes>',
    );
  });
});

// ---------------------------------------------------------------------------
// MapcodesDTO
// ---------------------------------------------------------------------------

describe("MapcodesDTO", () => {
  it("JSON — ApiCodesTest.checkCodesJson (TEST_LATLON1)", () => {
    const v = dto.buildMapcodes({
      local: dto.buildMapcode({ mapcode: "JL0.KP", territory: "LUX" }),
      international: dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" }),
      mapcodes: [
        dto.buildMapcode({ mapcode: "JL0.KP", territory: "LUX" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "LUX" }),
        dto.buildMapcode({ mapcode: "SQB.NR3", territory: "BEL" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "BEL" }),
        dto.buildMapcode({ mapcode: "0L46.LG9", territory: "DEU" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "FRA" }),
        dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" }),
      ],
    });
    expect(toJson(v, dto.mapcodesSchema)).toBe(
      '{"local":{"mapcode":"JL0.KP","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ"},"mapcodes":[{"mapcode":"JL0.KP","territory":"LUX"},{"mapcode":"R8RN.07Z","territory":"LUX"},{"mapcode":"SQB.NR3","territory":"BEL"},{"mapcode":"R8RN.07Z","territory":"BEL"},{"mapcode":"0L46.LG9","territory":"DEU"},{"mapcode":"R8RN.07Z","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ"}]}',
    );
  });

  it("XML — ApiCodesTest.checkCodesXml (TEST_LATLON1) — territories undefined → omitted", () => {
    const v = dto.buildMapcodes({
      local: dto.buildMapcode({ mapcode: "JL0.KP", territory: "LUX" }),
      international: dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" }),
      mapcodes: [
        dto.buildMapcode({ mapcode: "JL0.KP", territory: "LUX" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "LUX" }),
        dto.buildMapcode({ mapcode: "SQB.NR3", territory: "BEL" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "BEL" }),
        dto.buildMapcode({ mapcode: "0L46.LG9", territory: "DEU" }),
        dto.buildMapcode({ mapcode: "R8RN.07Z", territory: "FRA" }),
        dto.buildMapcode({ mapcode: "VJ0L6.9PNQ" }),
      ],
      // territories omitted → undefined → no <territories> element in XML
    });
    expect(toXml(v, dto.mapcodesSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode></mapcodes></mapcodes>',
    );
  });

  it("JSON with territories — ApiCodesTest.checkCodesIncludeJson", () => {
    const v = dto.buildMapcodes({
      local: dto.buildMapcode({
        mapcode: "QKM.N4",
        mapcodeInAlphabet: "QKM.N4",
        territory: "NLD",
        territoryInAlphabet: "NLD",
        offsetMeters: 2.843693,
      }),
      international: dto.buildMapcode({
        mapcode: "VHVN4.YZ74",
        mapcodeInAlphabet: "VHVN4.YZ74",
        territory: "AAA",
        territoryInAlphabet: "AAA",
        offsetMeters: 1.907245,
      }),
      mapcodes: [
        dto.buildMapcode({ mapcode: "QKM.N4", mapcodeInAlphabet: "QKM.N4", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 2.843693 }),
        dto.buildMapcode({ mapcode: "CZQ.376", mapcodeInAlphabet: "CZQ.376", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 5.004936 }),
        dto.buildMapcode({ mapcode: "N39J.QW0", mapcodeInAlphabet: "N39J.QW0", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 2.836538 }),
        dto.buildMapcode({ mapcode: "VHVN4.YZ74", mapcodeInAlphabet: "VHVN4.YZ74", territory: "AAA", territoryInAlphabet: "AAA", offsetMeters: 1.907245 }),
      ],
      territories: [dto.buildTerritoryCandidate({ alphaCode: "NLD" })],
    });
    expect(toJson(v, dto.mapcodesSchema)).toBe(
      '{"local":{"mapcode":"QKM.N4","mapcodeInAlphabet":"QKM.N4","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.843693},"international":{"mapcode":"VHVN4.YZ74","mapcodeInAlphabet":"VHVN4.YZ74","territory":"AAA","territoryInAlphabet":"AAA","offsetMeters":1.907245},"mapcodes":[{"mapcode":"QKM.N4","mapcodeInAlphabet":"QKM.N4","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.843693},{"mapcode":"CZQ.376","mapcodeInAlphabet":"CZQ.376","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":5.004936},{"mapcode":"N39J.QW0","mapcodeInAlphabet":"N39J.QW0","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.836538},{"mapcode":"VHVN4.YZ74","mapcodeInAlphabet":"VHVN4.YZ74","territory":"AAA","territoryInAlphabet":"AAA","offsetMeters":1.907245}],"territories":[{"alphaCode":"NLD"}]}',
    );
  });

  it("XML with territories — ApiCodesTest.checkCodesIncludeXml", () => {
    const v = dto.buildMapcodes({
      local: dto.buildMapcode({
        mapcode: "QKM.N4",
        mapcodeInAlphabet: "QKM.N4",
        territory: "NLD",
        territoryInAlphabet: "NLD",
        offsetMeters: 2.843693,
      }),
      international: dto.buildMapcode({
        mapcode: "VHVN4.YZ74",
        mapcodeInAlphabet: "VHVN4.YZ74",
        territory: "AAA",
        territoryInAlphabet: "AAA",
        offsetMeters: 1.907245,
      }),
      mapcodes: [
        dto.buildMapcode({ mapcode: "QKM.N4", mapcodeInAlphabet: "QKM.N4", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 2.843693 }),
        dto.buildMapcode({ mapcode: "CZQ.376", mapcodeInAlphabet: "CZQ.376", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 5.004936 }),
        dto.buildMapcode({ mapcode: "N39J.QW0", mapcodeInAlphabet: "N39J.QW0", territory: "NLD", territoryInAlphabet: "NLD", offsetMeters: 2.836538 }),
        dto.buildMapcode({ mapcode: "VHVN4.YZ74", mapcodeInAlphabet: "VHVN4.YZ74", territory: "AAA", territoryInAlphabet: "AAA", offsetMeters: 1.907245 }),
      ],
      territories: [dto.buildTerritoryCandidate({ alphaCode: "NLD" })],
    });
    expect(toXml(v, dto.mapcodesSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>QKM.N4</mapcode><mapcodeInAlphabet>QKM.N4</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.843693</offsetMeters></local><international><mapcode>VHVN4.YZ74</mapcode><mapcodeInAlphabet>VHVN4.YZ74</mapcodeInAlphabet><territory>AAA</territory><territoryInAlphabet>AAA</territoryInAlphabet><offsetMeters>1.907245</offsetMeters></international><mapcodes><mapcode><mapcode>QKM.N4</mapcode><mapcodeInAlphabet>QKM.N4</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.843693</offsetMeters></mapcode><mapcode><mapcode>CZQ.376</mapcode><mapcodeInAlphabet>CZQ.376</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>5.004936</offsetMeters></mapcode><mapcode><mapcode>N39J.QW0</mapcode><mapcodeInAlphabet>N39J.QW0</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.836538</offsetMeters></mapcode><mapcode><mapcode>VHVN4.YZ74</mapcode><mapcodeInAlphabet>VHVN4.YZ74</mapcodeInAlphabet><territory>AAA</territory><territoryInAlphabet>AAA</territoryInAlphabet><offsetMeters>1.907245</offsetMeters></mapcode></mapcodes><territories><territory><alphaCode>NLD</alphaCode></territory></territories></mapcodes>',
    );
  });
});

// ---------------------------------------------------------------------------
// TerritoryCandidateDTO
// ---------------------------------------------------------------------------

describe("TerritoryCandidateDTO", () => {
  it("JSON country (no parent) — TerritoryCandidateDTOTest.validateCountryWithoutParent", () => {
    const t = dto.buildTerritoryCandidate({ alphaCode: "NLD" });
    expect(toJson(t, dto.territoryCandidateSchema)).toBe('{"alphaCode":"NLD"}');
  });

  it("JSON subdivision with parent — TerritoryCandidateDTOTest.validateSubdivisionWithParent", () => {
    const t = dto.buildTerritoryCandidate({ alphaCode: "USA-CA", parentAlphaCode: "USA" });
    expect(toJson(t, dto.territoryCandidateSchema)).toBe('{"alphaCode":"USA-CA","parentAlphaCode":"USA"}');
  });
});

// ---------------------------------------------------------------------------
// TerritoryDTO
// ---------------------------------------------------------------------------

describe("TerritoryDTO", () => {
  // NLD: no aliases, no fullNameAliases, no parentTerritory
  it("JSON NLD — ApiTerritoriesTest.checkTerritoryJson1", () => {
    const t = dto.buildTerritory({
      alphaCode: "NLD",
      alphaCodeMinimalUnambiguous: "NLD",
      alphaCodeMinimal: "NLD",
      fullName: "Netherlands",
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"alphaCode":"NLD","alphaCodeMinimalUnambiguous":"NLD","alphaCodeMinimal":"NLD","fullName":"Netherlands","alphabets":[{"name":"ROMAN"}]}',
    );
  });

  it("XML NLD — ApiTerritoriesTest.checkTerritoryXmlJson1", () => {
    const t = dto.buildTerritory({
      alphaCode: "NLD",
      alphaCodeMinimalUnambiguous: "NLD",
      alphaCodeMinimal: "NLD",
      fullName: "Netherlands",
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toXml(t, dto.territorySchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>NLD</alphaCode><alphaCodeMinimalUnambiguous>NLD</alphaCodeMinimalUnambiguous><alphaCodeMinimal>NLD</alphaCodeMinimal><fullName>Netherlands</fullName><aliases/><fullNameAliases/><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>',
    );
  });

  // IN-PY: has parentTerritory, no aliases
  it("JSON IN-PY — ApiTerritoriesTest.checkTerritoryJson2", () => {
    const t = dto.buildTerritory({
      alphaCode: "IN-PY",
      alphaCodeMinimalUnambiguous: "PY",
      alphaCodeMinimal: "PY",
      fullName: "Puducherry",
      parentTerritory: "IND",
      alphabets: [
        dto.buildAlphabet({ name: "MALAYALAM" }),
        dto.buildAlphabet({ name: "TELUGU" }),
        dto.buildAlphabet({ name: "DEVANAGARI" }),
      ],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"alphaCode":"IN-PY","alphaCodeMinimalUnambiguous":"PY","alphaCodeMinimal":"PY","fullName":"Puducherry","parentTerritory":"IND","alphabets":[{"name":"MALAYALAM"},{"name":"TELUGU"},{"name":"DEVANAGARI"}]}',
    );
  });

  it("XML IN-PY — ApiTerritoriesTest.checkTerritoryXml2", () => {
    const t = dto.buildTerritory({
      alphaCode: "IN-PY",
      alphaCodeMinimalUnambiguous: "PY",
      alphaCodeMinimal: "PY",
      fullName: "Puducherry",
      parentTerritory: "IND",
      alphabets: [
        dto.buildAlphabet({ name: "MALAYALAM" }),
        dto.buildAlphabet({ name: "TELUGU" }),
        dto.buildAlphabet({ name: "DEVANAGARI" }),
      ],
    });
    expect(toXml(t, dto.territorySchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>IN-PY</alphaCode><alphaCodeMinimalUnambiguous>PY</alphaCodeMinimalUnambiguous><alphaCodeMinimal>PY</alphaCodeMinimal><fullName>Puducherry</fullName><parentTerritory>IND</parentTerritory><aliases/><fullNameAliases/><alphabets><alphabet><name>MALAYALAM</name></alphabet><alphabet><name>TELUGU</name></alphabet><alphabet><name>DEVANAGARI</name></alphabet></alphabets></territory>',
    );
  });

  // GBR: has fullNameAliases, no aliases, no parentTerritory
  it("JSON GBR — ApiTerritoriesTest.checkTerritoryJson3", () => {
    const t = dto.buildTerritory({
      alphaCode: "GBR",
      alphaCodeMinimalUnambiguous: "GBR",
      alphaCodeMinimal: "GBR",
      fullName: "United Kingdom",
      fullNameAliases: ["Scotland", "Great Britain", "Northern Ireland", "Ireland, Northern"],
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"fullNameAliases":["Scotland","Great Britain","Northern Ireland","Ireland, Northern"],"alphaCode":"GBR","alphaCodeMinimalUnambiguous":"GBR","alphaCodeMinimal":"GBR","fullName":"United Kingdom","alphabets":[{"name":"ROMAN"}]}',
    );
  });

  it("XML GBR — ApiTerritoriesTest.checkTerritoryXml3", () => {
    const t = dto.buildTerritory({
      alphaCode: "GBR",
      alphaCodeMinimalUnambiguous: "GBR",
      alphaCodeMinimal: "GBR",
      fullName: "United Kingdom",
      fullNameAliases: ["Scotland", "Great Britain", "Northern Ireland", "Ireland, Northern"],
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toXml(t, dto.territorySchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>GBR</alphaCode><alphaCodeMinimalUnambiguous>GBR</alphaCodeMinimalUnambiguous><alphaCodeMinimal>GBR</alphaCodeMinimal><fullName>United Kingdom</fullName><aliases/><fullNameAliases><fullNameAlias>Scotland</fullNameAlias><fullNameAlias>Great Britain</fullNameAlias><fullNameAlias>Northern Ireland</fullNameAlias><fullNameAlias>Ireland, Northern</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>',
    );
  });

  // USA: has aliases AND fullNameAliases — from ApiTerritoriesTest.checkTerritories1Json prefix
  it("JSON USA — from ApiTerritoriesTest.checkTerritories1Json prefix", () => {
    const t = dto.buildTerritory({
      alphaCode: "USA",
      alphaCodeMinimalUnambiguous: "USA",
      alphaCodeMinimal: "USA",
      fullName: "USA",
      aliases: ["US"],
      fullNameAliases: ["United States of America", "America"],
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"aliases":["US"],"fullNameAliases":["United States of America","America"],"alphaCode":"USA","alphaCodeMinimalUnambiguous":"USA","alphaCodeMinimal":"USA","fullName":"USA","alphabets":[{"name":"ROMAN"}]}',
    );
  });

  // AAA: fullNameAliases but no aliases — from ApiTerritoriesTest.checkTerritories2Json
  it("JSON AAA — from ApiTerritoriesTest.checkTerritories2Json", () => {
    const t = dto.buildTerritory({
      alphaCode: "AAA",
      alphaCodeMinimalUnambiguous: "AAA",
      alphaCodeMinimal: "AAA",
      fullName: "International",
      fullNameAliases: ["Worldwide", "Earth"],
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"fullNameAliases":["Worldwide","Earth"],"alphaCode":"AAA","alphaCodeMinimalUnambiguous":"AAA","alphaCodeMinimal":"AAA","fullName":"International","alphabets":[{"name":"ROMAN"}]}',
    );
  });

  it("XML AAA — from ApiTerritoriesTest.checkTerritories2Xml", () => {
    const t = dto.buildTerritory({
      alphaCode: "AAA",
      alphaCodeMinimalUnambiguous: "AAA",
      alphaCodeMinimal: "AAA",
      fullName: "International",
      fullNameAliases: ["Worldwide", "Earth"],
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toXml(t, dto.territorySchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>AAA</alphaCode><alphaCodeMinimalUnambiguous>AAA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>AAA</alphaCodeMinimal><fullName>International</fullName><aliases/><fullNameAliases><fullNameAlias>Worldwide</fullNameAlias><fullNameAlias>Earth</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>',
    );
  });

  // US-IN: has parentTerritory — ApiTerritoriesTest.checkTerritoryStateJson
  it("JSON US-IN — ApiTerritoriesTest.checkTerritoryStateJson", () => {
    const t = dto.buildTerritory({
      alphaCode: "US-IN",
      alphaCodeMinimalUnambiguous: "US-IN",
      alphaCodeMinimal: "IN",
      fullName: "Indiana",
      parentTerritory: "USA",
      alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
    });
    expect(toJson(t, dto.territorySchema)).toBe(
      '{"alphaCode":"US-IN","alphaCodeMinimalUnambiguous":"US-IN","alphaCodeMinimal":"IN","fullName":"Indiana","parentTerritory":"USA","alphabets":[{"name":"ROMAN"}]}',
    );
  });
});

// ---------------------------------------------------------------------------
// TerritoriesDTO — JSON + XML (objectListUnwrapped)
// ---------------------------------------------------------------------------

describe("TerritoriesDTO", () => {
  it("JSON — ApiTerritoriesTest.checkTerritories2Json (count=1 offset=-1, last = AAA)", () => {
    const td = dto.buildTerritories({
      total: 533,
      territories: [
        dto.buildTerritory({
          alphaCode: "AAA",
          alphaCodeMinimalUnambiguous: "AAA",
          alphaCodeMinimal: "AAA",
          fullName: "International",
          fullNameAliases: ["Worldwide", "Earth"],
          alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
        }),
      ],
    });
    expect(toJson(td, dto.territoriesSchema)).toBe(
      '{"total":533,"territories":[{"fullNameAliases":["Worldwide","Earth"],"alphaCode":"AAA","alphaCodeMinimalUnambiguous":"AAA","alphaCodeMinimal":"AAA","fullName":"International","alphabets":[{"name":"ROMAN"}]}]}',
    );
  });

  it("XML — ApiTerritoriesTest.checkTerritories2Xml (count=1 offset=-1, last = AAA)", () => {
    const td = dto.buildTerritories({
      total: 533,
      territories: [
        dto.buildTerritory({
          alphaCode: "AAA",
          alphaCodeMinimalUnambiguous: "AAA",
          alphaCodeMinimal: "AAA",
          fullName: "International",
          fullNameAliases: ["Worldwide", "Earth"],
          alphabets: [dto.buildAlphabet({ name: "ROMAN" })],
        }),
      ],
    });
    expect(toXml(td, dto.territoriesSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territories><total>533</total><territory><alphaCode>AAA</alphaCode><alphaCodeMinimalUnambiguous>AAA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>AAA</alphaCodeMinimal><fullName>International</fullName><aliases/><fullNameAliases><fullNameAlias>Worldwide</fullNameAlias><fullNameAlias>Earth</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory></territories>',
    );
  });
});
