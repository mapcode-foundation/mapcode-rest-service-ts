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

// Ported verbatim from ApiAlphabetsTest.java.

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

describe("checkAlphabetsJson", () => {
  it("GET /mapcode/alphabets → 200, all 28 alphabets in JSON", async () => {
    const res = await getJson("/mapcode/alphabets");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"total":28,"alphabets":[{"name":"ROMAN"},{"name":"GREEK"},{"name":"CYRILLIC"},{"name":"HEBREW"},{"name":"DEVANAGARI"},{"name":"MALAYALAM"},{"name":"GEORGIAN"},{"name":"KATAKANA"},{"name":"THAI"},{"name":"LAO"},{"name":"ARMENIAN"},{"name":"BENGALI"},{"name":"GURMUKHI"},{"name":"TIBETAN"},{"name":"ARABIC"},{"name":"KOREAN"},{"name":"BURMESE"},{"name":"KHMER"},{"name":"SINHALESE"},{"name":"THAANA"},{"name":"CHINESE"},{"name":"TIFINAGH"},{"name":"TAMIL"},{"name":"AMHARIC"},{"name":"TELUGU"},{"name":"ODIA"},{"name":"KANNADA"},{"name":"GUJARATI"}]}'
    );
  });
});

describe("checkAlphabetsXml", () => {
  const expected =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabets><total>28</total><alphabet><name>ROMAN</name></alphabet><alphabet><name>GREEK</name></alphabet><alphabet><name>CYRILLIC</name></alphabet><alphabet><name>HEBREW</name></alphabet><alphabet><name>DEVANAGARI</name></alphabet><alphabet><name>MALAYALAM</name></alphabet><alphabet><name>GEORGIAN</name></alphabet><alphabet><name>KATAKANA</name></alphabet><alphabet><name>THAI</name></alphabet><alphabet><name>LAO</name></alphabet><alphabet><name>ARMENIAN</name></alphabet><alphabet><name>BENGALI</name></alphabet><alphabet><name>GURMUKHI</name></alphabet><alphabet><name>TIBETAN</name></alphabet><alphabet><name>ARABIC</name></alphabet><alphabet><name>KOREAN</name></alphabet><alphabet><name>BURMESE</name></alphabet><alphabet><name>KHMER</name></alphabet><alphabet><name>SINHALESE</name></alphabet><alphabet><name>THAANA</name></alphabet><alphabet><name>CHINESE</name></alphabet><alphabet><name>TIFINAGH</name></alphabet><alphabet><name>TAMIL</name></alphabet><alphabet><name>AMHARIC</name></alphabet><alphabet><name>TELUGU</name></alphabet><alphabet><name>ODIA</name></alphabet><alphabet><name>KANNADA</name></alphabet><alphabet><name>GUJARATI</name></alphabet></alphabets>';

  it("GET /mapcode/alphabets (accept xml) → 200, all 28 alphabets in XML", async () => {
    const res = await getXml("/mapcode/alphabets");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });

  it("GET /mapcode/xml/alphabets → 200, same XML", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/alphabets" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expected);
  });
});

describe("checkAlphabetsCountJson", () => {
  it("count=2 → first 2 alphabets", async () => {
    const res = await getJson("/mapcode/alphabets?count=2");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"total":28,"alphabets":[{"name":"ROMAN"},{"name":"GREEK"}]}');
  });
});

describe("checkAlphabetsCountJsonError", () => {
  it("count=-2 → 400", async () => {
    const res = await getJson("/mapcode/alphabets?count=-2");
    expect(res.statusCode).toBe(400);
  });

  it("count=-1 → 400 body message contains 2147483647 (not list length)", async () => {
    const res = await getJson("/mapcode/alphabets?count=-1");
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { message: string; status: number };
    expect(body.message).toContain("2147483647");
    expect(body.message).not.toContain("28");
  });

  it("count=9999999999 → 400 (exceeds int32 max)", async () => {
    const res = await getJson("/mapcode/alphabets?count=9999999999");
    expect(res.statusCode).toBe(400);
  });

  it("count=1000 → 200 (large but valid, clamped to list size)", async () => {
    const res = await getJson("/mapcode/alphabets?count=1000");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { total: number };
    expect(body.total).toBe(28);
  });
});

describe("checkAlphabetsCountXml", () => {
  it("count=2 → first 2 alphabets in XML", async () => {
    const res = await getXml("/mapcode/alphabets?count=2");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabets><total>28</total><alphabet><name>ROMAN</name></alphabet><alphabet><name>GREEK</name></alphabet></alphabets>'
    );
  });
});

describe("checkAlphabetsCountOffsetJson", () => {
  it("count=1&offset=1 → GREEK", async () => {
    const res = await getJson("/mapcode/alphabets?count=1&offset=1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"total":28,"alphabets":[{"name":"GREEK"}]}');
  });
});

describe("checkAlphabetsCountOffsetXml", () => {
  it("count=1&offset=1 → GREEK in XML", async () => {
    const res = await getXml("/mapcode/alphabets?count=1&offset=1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabets><total>28</total><alphabet><name>GREEK</name></alphabet></alphabets>'
    );
  });
});

describe("checkAlphabetsCountOffsetFromEndJson", () => {
  it("count=1&offset=-1 → last alphabet (GUJARATI)", async () => {
    const res = await getJson("/mapcode/alphabets?count=1&offset=-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"total":28,"alphabets":[{"name":"GUJARATI"}]}');
  });
});

describe("checkAlphabetsCountOffsetFromEndXml", () => {
  it("count=1&offset=-1 → GUJARATI in XML", async () => {
    const res = await getXml("/mapcode/alphabets?count=1&offset=-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabets><total>28</total><alphabet><name>GUJARATI</name></alphabet></alphabets>'
    );
  });
});

describe("checkAlphabetJson", () => {
  it("GET /mapcode/alphabets/greek → {name:GREEK}", async () => {
    const res = await getJson("/mapcode/alphabets/greek");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"name":"GREEK"}');
  });
});

describe("checkAlphabetJsonError", () => {
  it("GET /mapcode/alphabets/mozart → 400", async () => {
    const res = await getJson("/mapcode/alphabets/mozart");
    expect(res.statusCode).toBe(400);
  });
});

describe("checkAlphabetXmlJson", () => {
  const expectedXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><alphabet><name>GREEK</name></alphabet>';
  const expectedJson = '{"name":"GREEK"}';

  it("GET /mapcode/alphabets/greek (accept xml) → GREEK XML", async () => {
    const res = await getXml("/mapcode/alphabets/greek");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedXml);
  });

  it("GET /mapcode/xml/alphabets/greek → GREEK XML", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/alphabets/greek" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedXml);
  });

  it("GET /mapcode/json/alphabets/greek → GREEK JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/json/alphabets/greek" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedJson);
  });
});
