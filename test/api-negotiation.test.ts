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

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

describe("Accept negotiation", () => {
  it.each([
    ["application/json", "json"],
    ["application/xml", "xml"],
    ["application/xml;q=0", "json"],
    ["application/json, application/xml", "json"],
    ["application/xml;q=0.5, */*", "json"],
    ["application/*", "json"],
    ["application/json;q=0, */*", "xml"],
    ["application/json;q=0, application/xml;q=0", "json"],
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "xml"],
  ])("Accept: %s → %s", async (accept, expected) => {
    const res = await app.inject({ method: "GET", url: "/mapcode/version", headers: { accept } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(new RegExp(`application/${expected}`));
  });

  it.each([
    ["/mapcode/xml/version", "application/json", "xml"],
    ["/mapcode/json/version", "application/xml", "json"],
  ])("%s with Accept: %s → %s", async (url, accept, expected) => {
    const res = await app.inject({ method: "GET", url, headers: { accept } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(new RegExp(`application/${expected}`));
  });
});
