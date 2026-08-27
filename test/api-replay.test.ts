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

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.ts";
import { createMapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";
import type { ReplayColumns, ReplayQueryArgs } from "../src/storage/replay-query.ts";

const TOKEN = "test-token";
const AUTH = { authorization: `Bearer ${TOKEN}` };
const EMPTY: ReplayColumns = { ts: [], kind: [], lat: [], lon: [], status: [], client: [], mapcode: [] };

let app: FastifyInstance;
let queryCalls: ReplayQueryArgs[];
let queryResult: ReplayColumns;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({
    mapcodeService,
    boundaryService,
    version: "1.0",
    replay: {
      token: TOKEN,
      query: async (args) => {
        queryCalls.push(args);
        return queryResult;
      },
    },
  });
  await app.ready();
});

beforeEach(() => {
  queryCalls = [];
  queryResult = EMPTY;
});

describe("auth", () => {
  it("401s without an Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000" });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toMatchObject({ status: 401 });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(queryCalls).toHaveLength(0);
  });
  it("401s with a wrong token and with a non-Bearer scheme", async () => {
    for (const authorization of ["Bearer wrong", "Basic dTpw", "test-token"]) {
      const res = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000", headers: { authorization } });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("validation", () => {
  it("400s on missing from, oversized window, and bad limit", async () => {
    for (const qs of ["", "from=1000&to=" + (1000 + 31 * 86400 + 1), "from=1000&to=2000&limit=0"]) {
      const res = await app.inject({ method: "GET", url: `/mapcode/replay?${qs}`, headers: AUTH });
      expect(res.statusCode).toBe(400);
    }
  });

  it("400 response for a missing from still carries the CORS header", async () => {
    const res = await app.inject({ method: "GET", url: "/mapcode/replay", headers: AUTH });
    expect(res.statusCode).toBe(400);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("response", () => {
  it("returns the columnar shape with CORS and cache headers for a past window", async () => {
    queryResult = { ts: [1001], kind: [10], lat: [52376514], lon: [4908543], status: [20], client: [1], mapcode: [null] };
    const res = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000", headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toBe("private, max-age=3600");
    expect(JSON.parse(res.body)).toEqual({
      from: 1000,
      to: 2000,
      count: 1,
      truncated: false,
      ts: [1001],
      kind: [10],
      lat: [52376514],
      lon: [4908543],
      status: [20],
      client: [1],
      mapcode: [null],
    });
  });

  it("marks live windows no-store and defaults to≈now", async () => {
    const now = Math.floor(Date.now() / 1000);
    const res = await app.inject({ method: "GET", url: `/mapcode/replay?from=${now - 60}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Math.abs(queryCalls[0].to - now)).toBeLessThanOrEqual(2);
  });

  it("reports truncation and passes limit and kinds through", async () => {
    queryResult = { ts: [1, 2], kind: [10, 10], lat: [0, 0], lon: [0, 0], status: [20, 20], client: [0, 0], mapcode: [null, null] };
    const res = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000&limit=2&kind=10,20", headers: AUTH });
    expect(JSON.parse(res.body)).toMatchObject({ count: 2, truncated: true });
    expect(queryCalls[0]).toMatchObject({ limit: 2, kinds: [10, 20] });
  });

  it("gzips a large response when the client accepts it", async () => {
    const n = 2000;
    queryResult = {
      ts: Array.from({ length: n }, (_, i) => 1000 + i),
      kind: Array(n).fill(10),
      lat: Array(n).fill(52376514),
      lon: Array(n).fill(4908543),
      status: Array(n).fill(20),
      client: Array(n).fill(0),
      mapcode: Array(n).fill(null),
    };
    const res = await app.inject({
      method: "GET",
      url: "/mapcode/replay?from=1000&to=5000",
      headers: { ...AUTH, "accept-encoding": "gzip" },
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
    const body = JSON.parse(gunzipSync(res.rawPayload).toString("utf8"));
    expect(body.count).toBe(n);
  });
});

describe("CORS preflight", () => {
  it("answers OPTIONS /mapcode/replay with 204 and CORS headers", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/mapcode/replay" });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-headers"]).toBe("authorization");
    expect(res.headers["access-control-allow-methods"]).toBe("GET");
    expect(res.headers["access-control-max-age"]).toBe("86400");
  });

  it("still 405s OPTIONS on every other route", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/mapcode/version" });
    expect(res.statusCode).toBe(405);
  });
});

describe("without replay deps", () => {
  it("404s GET and 405s OPTIONS on /mapcode/replay", async () => {
    const mapcodeService = createMapcodeService();
    const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
    const bare = buildServer({ mapcodeService, boundaryService, version: "1.0" });
    await bare.ready();
    expect((await bare.inject({ method: "GET", url: "/mapcode/replay?from=1" })).statusCode).toBe(404);
    expect((await bare.inject({ method: "OPTIONS", url: "/mapcode/replay" })).statusCode).toBe(405);
    await bare.close();
  });
});
