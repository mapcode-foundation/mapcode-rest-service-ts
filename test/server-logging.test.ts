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
import { buildServer } from "../src/server.ts";
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

function buildLoggedServer(): { app: FastifyInstance; logs: LogRecord[] } {
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
});
