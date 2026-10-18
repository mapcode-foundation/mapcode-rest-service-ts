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

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer, type ServerDeps } from "../src/server.ts";
import { createMapcodeService, type MapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";

interface LogRecord {
  level: number;
  msg: string;
  req?: {
    method?: string;
    url?: string;
  };
  res?: {
    statusCode?: number;
  };
  err?: {
    message?: string;
  };
  method?: string;
  url?: string;
  statusCode?: number;
}

let mapcodeService: MapcodeService;
let boundaryService: BoundaryService;
let openApps: FastifyInstance[] = [];

beforeAll(async () => {
  mapcodeService = createMapcodeService();
  boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
});

afterEach(async () => {
  await Promise.all(openApps.map((app) => app.close()));
  openApps = [];
});

function buildLoggedServer(replay?: ServerDeps["replay"]): { app: FastifyInstance; logs: LogRecord[] } {
  const logs: LogRecord[] = [];
  let buffered = "";
  const stream = {
    write(chunk: string): void {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0) {
          logs.push(JSON.parse(line) as LogRecord);
        }
      }
    },
  };

  const app = buildServer({
    mapcodeService,
    boundaryService,
    version: "1.0",
    logger: { level: "info", stream },
    replay,
  });
  openApps.push(app);
  return { app, logs };
}

describe("server logging", () => {
  it("logs incoming API requests and completions at info level", async () => {
    const { app, logs } = buildLoggedServer();

    const res = await app.inject({ method: "GET", url: "/mapcode/version" });

    expect(res.statusCode).toBe(200);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 30,
          msg: "incoming request",
          req: expect.objectContaining({ method: "GET", url: "/mapcode/version" }),
        }),
        expect.objectContaining({
          level: 30,
          msg: "request completed",
          res: expect.objectContaining({ statusCode: 200 }),
        }),
      ])
    );
  });

  it("logs handled API errors at warn level", async () => {
    const { app, logs } = buildLoggedServer();

    const res = await app.inject({ method: "GET", url: "/mapcode/coords" });

    expect(res.statusCode).toBe(403);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 40,
          msg: "api request failed",
          method: "GET",
          url: "/mapcode/coords",
          statusCode: 403,
        }),
      ])
    );
  });

  it("logs not-found and method-not-allowed responses at warn level", async () => {
    const { app, logs } = buildLoggedServer();

    const notFound = await app.inject({ method: "GET", url: "/mapcode/unknown-route" });
    const methodNotAllowed = await app.inject({ method: "POST", url: "/mapcode/version" });

    expect(notFound.statusCode).toBe(404);
    expect(methodNotAllowed.statusCode).toBe(405);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 40,
          msg: "route not found",
          method: "GET",
          url: "/mapcode/unknown-route",
          statusCode: 404,
        }),
        expect.objectContaining({
          level: 40,
          msg: "method not allowed",
          method: "POST",
          url: "/mapcode/version",
          statusCode: 405,
        }),
      ])
    );
  });

  it("logs unexpected errors at error level", async () => {
    const { app, logs } = buildLoggedServer();
    app.get("/boom", async () => {
      throw new Error("boom");
    });

    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: "Internal Server Error", status: 500 });
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 50,
          msg: "unexpected request error",
          method: "GET",
          url: "/boom",
          statusCode: 500,
          err: expect.objectContaining({ message: "boom" }),
        }),
      ])
    );
  });

  it("keeps a framework 4xx status with a generic body and CORS, logged at warn", async () => {
    const { app, logs } = buildLoggedServer(failingReplay());

    const res = await app.inject({
      method: "GET",
      url: "/mapcode/replay/stats",
      headers: { "content-encoding": "foo" },
    });

    expect(res.statusCode).toBe(415);
    expect(JSON.parse(res.body)).toEqual({ message: "Unsupported Media Type", status: 415 });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 40,
          url: "/mapcode/replay/stats",
          statusCode: 415,
          err: expect.objectContaining({ message: "Unsupported Content-Encoding: foo" }),
        }),
      ])
    );
  });

  it("logs the database cause of a replay or stats failure, not in the body", async () => {
    const { app, logs } = buildLoggedServer(failingReplay());

    const replay = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000", headers: AUTH });
    const stats = await app.inject({ method: "GET", url: "/mapcode/replay/stats", headers: AUTH });

    for (const res of [replay, stats]) {
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ message: "Internal Server Error", status: 500 });
    }
    const failures = logs.filter((log) => log.statusCode === 500);
    expect(failures.map((log) => log.err?.message)).toEqual([
      expect.stringContaining("Query read timeout"),
      expect.stringContaining("connect ECONNREFUSED 10.0.0.1:5432"),
    ]);
  });

  it("logs which addresses refused when every address of the database host refuses", async () => {
    const refused = Object.assign(
      new AggregateError([
        new Error("connect ECONNREFUSED ::1:5432"),
        new Error("connect ECONNREFUSED 127.0.0.1:5432"),
      ], ""),
      { code: "ECONNREFUSED" },
    );
    const { app, logs } = buildLoggedServer({
      ...failingReplay(),
      query: async () => {
        throw refused;
      },
    });

    const res = await app.inject({ method: "GET", url: "/mapcode/replay?from=1000&to=2000", headers: AUTH });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: "Internal Server Error", status: 500 });
    const failure = logs.find((log) => log.statusCode === 500);
    expect(failure?.err?.message).toContain("ECONNREFUSED ::1:5432");
    expect(failure?.err?.message).toContain("ECONNREFUSED 127.0.0.1:5432");
  });
});

const AUTH = { authorization: "Bearer test-token" };

function failingReplay(): NonNullable<ServerDeps["replay"]> {
  return {
    token: "test-token",
    query: async () => {
      throw new Error("Query read timeout");
    },
    stats: async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:5432");
    },
    storage: async () => ({ databaseBytes: 0, tableBytes: 0, rowCount: 0 }),
  };
}
