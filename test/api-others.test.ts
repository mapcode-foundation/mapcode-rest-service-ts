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

describe("GET /mapcode/status", () => {
  it("returns 200 for /mapcode/status", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/status" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for /mapcode/xml/status", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/status" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for /mapcode/json/status", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/json/status" });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /mapcode (help)", () => {
  it("returns 200 and body starts with <html>", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^<html>/);
  });
});

describe("GET /mapcode/version — JSON", () => {
  it("returns {\"version\":\"1.0\"} with Accept: application/json", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/version",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"version":"1.0"}');
  });

  it("returns JSON for /mapcode/json/version (no Accept header)", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/json/version" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"version":"1.0"}');
  });

  it("defaults to JSON when no Accept header is given", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/version" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"version":"1.0"}');
  });
});

describe("GET /mapcode/version — XML", () => {
  it("returns XML with Accept: application/xml", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/version",
      headers: { accept: "application/xml" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><version><version>1.0</version></version>'
    );
  });

  it("returns XML for /mapcode/xml/version (no Accept header)", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/xml/version" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><version><version>1.0</version></version>'
    );
  });
});

describe("Content-type headers", () => {
  it("sets application/json;charset=UTF-8 for JSON response", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/version",
      headers: { accept: "application/json" },
    });
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["content-type"]).toMatch(/UTF-8/i);
  });

  it("sets application/xml;charset=UTF-8 for XML response", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/version",
      headers: { accept: "application/xml" },
    });
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.headers["content-type"]).toMatch(/UTF-8/i);
  });

  it("sets text/html;charset=UTF-8 for help page", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode" });
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
});

describe("Method enforcement", () => {
  it("returns 405 for POST /mapcode/version", async () => {
    const res = await app.inject({ method: "POST", url: "/mapcode/version" });
    expect(res.statusCode).toBe(405);
  });

  it("returns 404 for unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/unknown-route" });
    expect(res.statusCode).toBe(404);
  });
});
