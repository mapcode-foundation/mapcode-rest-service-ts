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

// Ported verbatim from ApiCodesTerritoriesTest.java.

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

describe("pointInsideCountryReturnsCountryJson", () => {
  it("(52,5) inside NLD → {\"territories\":[{\"alphaCode\":\"NLD\"}]}", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/52.0,5.0/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"territories":[{"alphaCode":"NLD"}]}');
  });
});

describe("pointInsideSubdivisionReturnsSubdivisionThenCountryJson", () => {
  it("(36,-120) inside USA-CA then USA", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/36.0,-120.0/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"territories":[' +
        '{"alphaCode":"USA-CA","parentAlphaCode":"USA"},' +
        '{"alphaCode":"USA"}]}'
    );
  });
});

describe("pointAtSeaReturnsEmptyListJson", () => {
  it("(0,-30) mid-Atlantic → {\"territories\":[]}", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/0.0,-30.0/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"territories":[]}');
  });
});

describe("disputedRegionReturnsSmallerPolygonFirstJson", () => {
  it("(6.5,106.5) DISPUTED-B before DISPUTED-A", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/6.5,106.5/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"territories":[' +
        '{"alphaCode":"DISPUTED-B"},' +
        '{"alphaCode":"DISPUTED-A"}]}'
    );
  });
});

describe("latOutOfRangeReturns400", () => {
  it("(91,5) → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/91.0,5.0/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("lonOutOfRangeIsWrapped", () => {
  it("(52,365) wraps to 5 → NLD", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/52.0,365.0/territories",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"territories":[{"alphaCode":"NLD"}]}');
  });
});

describe("pointInsideCountryReturnsCountryXml", () => {
  it("(52,5) inside NLD → XML wraps in <territoryCandidate>", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/codes/52.0,5.0/territories",
      headers: { accept: "application/xml" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        "<territories><territoryCandidate><alphaCode>NLD</alphaCode></territoryCandidate></territories>"
    );
  });
});
