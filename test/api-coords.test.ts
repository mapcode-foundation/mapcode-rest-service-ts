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

// Test constants (ported from ApiCoordsTest.java)
const TEST_CODE1 = "VJ0L6.9PNQ";
const TEST_CODE2 = "JL0.KP";
const TEST_CONTEXT2 = "LUX";

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

// ---------------------------------------------------------------------------
// Ported from ApiCoordsTest.java — exact expected strings
// ---------------------------------------------------------------------------

describe("checkCoords1Json", () => {
  it("decodes VJ0L6.9PNQ to lat/lon as JSON", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}`,
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"latDeg":50.141726,"lonDeg":6.1358875}');
  });
});

describe("checkCoords1Xml", () => {
  it("decodes VJ0L6.9PNQ to lat/lon as XML", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}`,
      headers: { accept: "application/xml" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        "<point><latDeg>50.141726</latDeg><lonDeg>6.1358875</lonDeg></point>"
    );
  });
});

describe("checkCoords2Json", () => {
  it("decodes JL0.KP with context=LUX as JSON", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE2}?context=${TEST_CONTEXT2}`,
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"latDeg":50.141735,"lonDeg":6.135845}');
  });
});

describe("checkCoords2Xml", () => {
  it("decodes JL0.KP with context=LUX as XML", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE2}?context=${TEST_CONTEXT2}`,
      headers: { accept: "application/xml" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        "<point><latDeg>50.141735</latDeg><lonDeg>6.135845</lonDeg></point>"
    );
  });
});

// ---------------------------------------------------------------------------
// Additional parity tests (errors, include=rectangle, xml/json path prefix)
// ---------------------------------------------------------------------------

describe("GET /mapcode/coords (no code) → 403", () => {
  it("returns 403 for /mapcode/coords (bare, no code)", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/coords" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for /mapcode/xml/coords", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/coords" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for /mapcode/json/coords", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/json/coords" });
    expect(res.statusCode).toBe(403);
  });
});

describe("territory param present → 400", () => {
  it("returns 400 when territory= is supplied", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}?territory=NLD`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("territory");
  });
});

describe("invalid include token → 400", () => {
  it("returns 400 for unknown include=BOGUS", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}?include=BOGUS`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("include");
  });
});

describe("invalid mapcode format → 400", () => {
  it("returns 400 for a badly-formatted code", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/coords/NOT_A_MAPCODE",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("mapcode");
  });
});

describe("unknown mapcode (valid format, no location) → 404", () => {
  it("returns 404 for a syntactically-valid but unresolvable code", async () => {
    // ZZ.ZZ is valid format but maps to no known location without a territory
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/coords/ZZ.ZZ",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("invalid context → 400", () => {
  it("returns 400 for a non-existent context territory", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE2}?context=BOGUSLAND`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("territory");
  });
});

describe("include=RECTANGLE → returns rectangle", () => {
  it("returns rectangle for VJ0L6.9PNQ with include=RECTANGLE (JSON)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}?include=RECTANGLE`,
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("southWest");
    expect(res.body).toContain("northEast");
    expect(res.body).toContain("center");
  });

  it("returns rectangle for VJ0L6.9PNQ with include=RECTANGLE (XML)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}?include=RECTANGLE`,
      headers: { accept: "application/xml" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<southWest>");
    expect(res.body).toContain("<northEast>");
    expect(res.body).toContain("<center>");
  });

  it("returns correct rectangle values for VJ0L6.9PNQ", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/coords/${TEST_CODE1}?include=RECTANGLE`,
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.southWest.latDeg).toBeCloseTo(50.141705, 5);
    expect(body.southWest.lonDeg).toBeCloseTo(6.135857, 5);
    expect(body.northEast.latDeg).toBeCloseTo(50.141747, 5);
    expect(body.northEast.lonDeg).toBeCloseTo(6.135918, 5);
    expect(body.center.latDeg).toBeCloseTo(50.141726, 5);
    expect(body.center.lonDeg).toBeCloseTo(6.1358875, 5);
  });
});

describe("/mapcode/xml/coords/{code} and /mapcode/json/coords/{code}", () => {
  it("returns XML via /mapcode/xml/coords/{code}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/xml/coords/${TEST_CODE1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<point>");
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
  });

  it("returns JSON via /mapcode/json/coords/{code}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mapcode/json/coords/${TEST_CODE1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("latDeg");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
