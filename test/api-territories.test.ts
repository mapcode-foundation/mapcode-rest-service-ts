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

import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../src/server.ts";
import { createMapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";
import type { FastifyInstance } from "fastify";

// Ported verbatim from ApiTerritoriesTest.java.

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

async function getJson(url: string) {
  return app.inject({ method: "GET", url, headers: { accept: "application/json" } });
}
async function getXml(url: string) {
  return app.inject({ method: "GET", url, headers: { accept: "application/xml" } });
}

describe("checkTerritories1Json", () => {
  it("GET /mapcode/territories → 200, total:533, correct first/last 500 chars", async () => {
    const res = await getJson("/mapcode/territories");
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(500);
    const sub1 = res.body.substring(0, 500);
    const sub2 = res.body.substring(res.body.length - 500);
    expect(sub1).toBe(
      '{"total":533,"territories":[{"aliases":["US"],"fullNameAliases":["United States of America","America"],"alphaCode":"USA","alphaCodeMinimalUnambiguous":"USA","alphaCodeMinimal":"USA","fullName":"USA","alphabets":[{"name":"ROMAN"}]},{"aliases":["IN"],"alphaCode":"IND","alphaCodeMinimalUnambiguous":"IND","alphaCodeMinimal":"IND","fullName":"India","alphabets":[{"name":"DEVANAGARI"},{"name":"BENGALI"},{"name":"ROMAN"}]},{"aliases":["CA"],"alphaCode":"CAN","alphaCodeMinimalUnambiguous":"CAN","alphaCo'
    );
    expect(sub2).toBe(
      '"USA-UM","JTN"],"alphaCode":"UMI","alphaCodeMinimalUnambiguous":"UMI","alphaCodeMinimal":"UMI","fullName":"United States Minor Outlying Islands","alphabets":[{"name":"ROMAN"}]},{"alphaCode":"CPT","alphaCodeMinimalUnambiguous":"CPT","alphaCodeMinimal":"CPT","fullName":"Clipperton Island","alphabets":[{"name":"ROMAN"}]},{"fullNameAliases":["Worldwide","Earth"],"alphaCode":"AAA","alphaCodeMinimalUnambiguous":"AAA","alphaCodeMinimal":"AAA","fullName":"International","alphabets":[{"name":"ROMAN"}]}]}'
    );
  });
});

describe("checkTerritories1XmlJson", () => {
  it("GET /mapcode/territories XML (accept) → 200, correct first/last 500 chars", async () => {
    const expectedXml1 =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territories><total>533</total><territory><alphaCode>USA</alphaCode><alphaCodeMinimalUnambiguous>USA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>USA</alphaCodeMinimal><fullName>USA</fullName><aliases><alias>US</alias></aliases><fullNameAliases><fullNameAlias>United States of America</fullNameAlias><fullNameAlias>America</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory><territory><a';
    const expectedXml2 =
      "sland</fullName><aliases/><fullNameAliases/><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory><territory><alphaCode>AAA</alphaCode><alphaCodeMinimalUnambiguous>AAA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>AAA</alphaCodeMinimal><fullName>International</fullName><aliases/><fullNameAliases><fullNameAlias>Worldwide</fullNameAlias><fullNameAlias>Earth</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory></territories>";

    const res = await getXml("/mapcode/territories");
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(500);
    expect(res.body.substring(0, 500)).toBe(expectedXml1);
    expect(res.body.substring(res.body.length - 500)).toBe(expectedXml2);
  });

  it("GET /mapcode/xml/territories → 200, same XML", async () => {
    const expectedXml1 =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territories><total>533</total><territory><alphaCode>USA</alphaCode><alphaCodeMinimalUnambiguous>USA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>USA</alphaCodeMinimal><fullName>USA</fullName><aliases><alias>US</alias></aliases><fullNameAliases><fullNameAlias>United States of America</fullNameAlias><fullNameAlias>America</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory><territory><a';
    const expectedXml2 =
      "sland</fullName><aliases/><fullNameAliases/><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory><territory><alphaCode>AAA</alphaCode><alphaCodeMinimalUnambiguous>AAA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>AAA</alphaCodeMinimal><fullName>International</fullName><aliases/><fullNameAliases><fullNameAlias>Worldwide</fullNameAlias><fullNameAlias>Earth</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory></territories>";

    const res = await app.inject({ method: "GET", url: "/mapcode/xml/territories" });
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(500);
    expect(res.body.substring(0, 500)).toBe(expectedXml1);
    expect(res.body.substring(res.body.length - 500)).toBe(expectedXml2);
  });

  it("GET /mapcode/json/territories → 200, correct first/last 500 chars JSON", async () => {
    const expectedJson1 =
      '{"total":533,"territories":[{"aliases":["US"],"fullNameAliases":["United States of America","America"],"alphaCode":"USA","alphaCodeMinimalUnambiguous":"USA","alphaCodeMinimal":"USA","fullName":"USA","alphabets":[{"name":"ROMAN"}]},{"aliases":["IN"],"alphaCode":"IND","alphaCodeMinimalUnambiguous":"IND","alphaCodeMinimal":"IND","fullName":"India","alphabets":[{"name":"DEVANAGARI"},{"name":"BENGALI"},{"name":"ROMAN"}]},{"aliases":["CA"],"alphaCode":"CAN","alphaCodeMinimalUnambiguous":"CAN","alphaCo';
    const expectedJson2 =
      '"USA-UM","JTN"],"alphaCode":"UMI","alphaCodeMinimalUnambiguous":"UMI","alphaCodeMinimal":"UMI","fullName":"United States Minor Outlying Islands","alphabets":[{"name":"ROMAN"}]},{"alphaCode":"CPT","alphaCodeMinimalUnambiguous":"CPT","alphaCodeMinimal":"CPT","fullName":"Clipperton Island","alphabets":[{"name":"ROMAN"}]},{"fullNameAliases":["Worldwide","Earth"],"alphaCode":"AAA","alphaCodeMinimalUnambiguous":"AAA","alphaCodeMinimal":"AAA","fullName":"International","alphabets":[{"name":"ROMAN"}]}]}';

    const res = await app.inject({ method: "GET", url: "/mapcode/json/territories" });
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(500);
    expect(res.body.substring(0, 500)).toBe(expectedJson1);
    expect(res.body.substring(res.body.length - 500)).toBe(expectedJson2);
  });
});

describe("checkTerritoriesCountJsonError", () => {
  it("count=-1 → 400", async () => {
    const res = await getJson("/mapcode/territories?count=-1");
    expect(res.statusCode).toBe(400);
  });

  it("count=-1 → 400 body message contains 2147483647 (not list length)", async () => {
    const res = await getJson("/mapcode/territories?count=-1");
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { message: string; status: number };
    expect(body.message).toContain("2147483647");
    expect(body.message).not.toContain("533");
  });

  it("count=9999999999 → 400 (exceeds int32 max)", async () => {
    const res = await getJson("/mapcode/territories?count=9999999999");
    expect(res.statusCode).toBe(400);
  });

  it("count=1000 → 200 (large but valid, clamped to list size)", async () => {
    const res = await getJson("/mapcode/territories?count=1000");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { total: number };
    expect(body.total).toBe(533);
  });
});

describe("checkTerritories2Json", () => {
  it("count=1&offset=-1 → last territory (AAA)", async () => {
    const res = await getJson("/mapcode/territories?count=1&offset=-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"total":533,"territories":[{"fullNameAliases":["Worldwide","Earth"],"alphaCode":"AAA","alphaCodeMinimalUnambiguous":"AAA","alphaCodeMinimal":"AAA","fullName":"International","alphabets":[{"name":"ROMAN"}]}]}'
    );
  });
});

describe("checkTerritories2Xml", () => {
  it("count=1&offset=-1 → last territory XML", async () => {
    const res = await getXml("/mapcode/territories?count=1&offset=-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territories><total>533</total><territory><alphaCode>AAA</alphaCode><alphaCodeMinimalUnambiguous>AAA</alphaCodeMinimalUnambiguous><alphaCodeMinimal>AAA</alphaCodeMinimal><fullName>International</fullName><aliases/><fullNameAliases><fullNameAlias>Worldwide</fullNameAlias><fullNameAlias>Earth</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory></territories>'
    );
  });
});

describe("checkTerritoryJsonError", () => {
  it("unknown territory /territories/xyz → 400", async () => {
    const res = await getJson("/mapcode/territories/xyz");
    expect(res.statusCode).toBe(400);
  });
});

describe("checkTerritoryJson", () => {
  it("GET /mapcode/territories/nld → NLD JSON", async () => {
    const res = await getJson("/mapcode/territories/nld");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"alphaCode":"NLD","alphaCodeMinimalUnambiguous":"NLD","alphaCodeMinimal":"NLD","fullName":"Netherlands","alphabets":[{"name":"ROMAN"}]}'
    );
  });
});

describe("checkTerritoryJson1", () => {
  it("GET /mapcode/territories/nld (accept json) → NLD", async () => {
    const expected =
      '{"alphaCode":"NLD","alphaCodeMinimalUnambiguous":"NLD","alphaCodeMinimal":"NLD","fullName":"Netherlands","alphabets":[{"name":"ROMAN"}]}';
    const res = await getJson("/mapcode/territories/nld");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });

  it("GET /mapcode/territories/nld (no accept) → NLD", async () => {
    const expected =
      '{"alphaCode":"NLD","alphaCodeMinimalUnambiguous":"NLD","alphaCodeMinimal":"NLD","fullName":"Netherlands","alphabets":[{"name":"ROMAN"}]}';
    const res = await app.inject({ method: "GET", url: "/mapcode/territories/nld" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkTerritoryJson2", () => {
  it("GET /mapcode/territories/in-py → IN-PY subdivision JSON", async () => {
    const expected =
      '{"alphaCode":"IN-PY","alphaCodeMinimalUnambiguous":"PY","alphaCodeMinimal":"PY","fullName":"Puducherry","parentTerritory":"IND","alphabets":[{"name":"MALAYALAM"},{"name":"TELUGU"},{"name":"DEVANAGARI"}]}';
    const res = await getJson("/mapcode/territories/in-py");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkTerritoryJson3", () => {
  it("GET /mapcode/territories/gbr → GBR with fullNameAliases", async () => {
    const expected =
      '{"fullNameAliases":["Scotland","Great Britain","Northern Ireland","Ireland, Northern"],"alphaCode":"GBR","alphaCodeMinimalUnambiguous":"GBR","alphaCodeMinimal":"GBR","fullName":"United Kingdom","alphabets":[{"name":"ROMAN"}]}';
    const res = await getJson("/mapcode/territories/gbr");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkTerritoryXmlJson1", () => {
  it("GET /mapcode/territories/nld (accept xml) → NLD XML", async () => {
    const expectedXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>NLD</alphaCode><alphaCodeMinimalUnambiguous>NLD</alphaCodeMinimalUnambiguous><alphaCodeMinimal>NLD</alphaCodeMinimal><fullName>Netherlands</fullName><aliases/><fullNameAliases/><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>';
    const res = await getXml("/mapcode/territories/nld");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedXml);
  });

  it("GET /mapcode/xml/territories/nld → NLD XML", async () => {
    const expectedXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>NLD</alphaCode><alphaCodeMinimalUnambiguous>NLD</alphaCodeMinimalUnambiguous><alphaCodeMinimal>NLD</alphaCodeMinimal><fullName>Netherlands</fullName><aliases/><fullNameAliases/><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>';
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/territories/nld" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedXml);
  });

  it("GET /mapcode/json/territories/nld → NLD JSON", async () => {
    const expectedJson =
      '{"alphaCode":"NLD","alphaCodeMinimalUnambiguous":"NLD","alphaCodeMinimal":"NLD","fullName":"Netherlands","alphabets":[{"name":"ROMAN"}]}';
    const res = await app.inject({ method: "GET", url: "/mapcode/json/territories/nld" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedJson);
  });
});

describe("checkTerritoryXml2", () => {
  it("GET /mapcode/territories/in-py (accept xml) → IN-PY XML", async () => {
    const expected =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>IN-PY</alphaCode><alphaCodeMinimalUnambiguous>PY</alphaCodeMinimalUnambiguous><alphaCodeMinimal>PY</alphaCodeMinimal><fullName>Puducherry</fullName><parentTerritory>IND</parentTerritory><aliases/><fullNameAliases/><alphabets><alphabet><name>MALAYALAM</name></alphabet><alphabet><name>TELUGU</name></alphabet><alphabet><name>DEVANAGARI</name></alphabet></alphabets></territory>';
    const res = await getXml("/mapcode/territories/in-py");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkTerritoryXml3", () => {
  it("GET /mapcode/territories/gbr (accept xml) → GBR XML", async () => {
    const expected =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territory><alphaCode>GBR</alphaCode><alphaCodeMinimalUnambiguous>GBR</alphaCodeMinimalUnambiguous><alphaCodeMinimal>GBR</alphaCodeMinimal><fullName>United Kingdom</fullName><aliases/><fullNameAliases><fullNameAlias>Scotland</fullNameAlias><fullNameAlias>Great Britain</fullNameAlias><fullNameAlias>Northern Ireland</fullNameAlias><fullNameAlias>Ireland, Northern</fullNameAlias></fullNameAliases><alphabets><alphabet><name>ROMAN</name></alphabet></alphabets></territory>';
    const res = await getXml("/mapcode/territories/gbr");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkTerritoryStateJson", () => {
  it("GET /mapcode/territories/in → US-IN (default)", async () => {
    const usIn =
      '{"alphaCode":"US-IN","alphaCodeMinimalUnambiguous":"US-IN","alphaCodeMinimal":"IN","fullName":"Indiana","parentTerritory":"USA","alphabets":[{"name":"ROMAN"}]}';
    const res = await getJson("/mapcode/territories/in");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(usIn);
  });

  it("GET /mapcode/territories/in?context=xyz → 400", async () => {
    const res = await getJson("/mapcode/territories/in?context=xyz");
    expect(res.statusCode).toBe(400);
  });

  it("GET /mapcode/territories/in with repeated context → 400", async () => {
    const res = await getJson("/mapcode/territories/in?context=us&context=ru");
    expect(res.statusCode).toBe(400);
  });

  it("GET /mapcode/territories/in?context=nld → 400", async () => {
    const res = await getJson("/mapcode/territories/in?context=nld");
    expect(res.statusCode).toBe(400);
  });

  it("GET /mapcode/territories/in?context=ind → US-IN", async () => {
    const usIn =
      '{"alphaCode":"US-IN","alphaCodeMinimalUnambiguous":"US-IN","alphaCodeMinimal":"IN","fullName":"Indiana","parentTerritory":"USA","alphabets":[{"name":"ROMAN"}]}';
    const res = await getJson("/mapcode/territories/in?context=ind");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(usIn);
  });

  it("GET /mapcode/territories/in?context=us → US-IN", async () => {
    const usIn =
      '{"alphaCode":"US-IN","alphaCodeMinimalUnambiguous":"US-IN","alphaCodeMinimal":"IN","fullName":"Indiana","parentTerritory":"USA","alphabets":[{"name":"ROMAN"}]}';
    const res = await getJson("/mapcode/territories/in?context=us");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(usIn);
  });

  it("GET /mapcode/territories/in?context=ru → RU-IN", async () => {
    const res = await getJson("/mapcode/territories/in?context=ru");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"alphaCode":"RU-IN","alphaCodeMinimalUnambiguous":"RU-IN","alphaCodeMinimal":"IN","fullName":"Ingushetia Republic","parentTerritory":"RUS","alphabets":[{"name":"CYRILLIC"},{"name":"ROMAN"}]}'
    );
  });
});
