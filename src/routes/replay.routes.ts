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

import { createHash, timingSafeEqual } from "node:crypto";
import compress from "@fastify/compress";
import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { ServerDeps } from "../server.ts";
import { ApiUnauthorizedError } from "../errors.ts";
import { handleReplay } from "../resources/replay.ts";
import { getQueryParam } from "./query.ts";

// ---------------------------------------------------------------------------
// GET /mapcode/replay — token-protected, JSON only (deliberately outside the
// Java parity contract: no /xml/ or /json/ aliases). Registered only when a
// database is configured; otherwise the path 404s like any unknown route.
// ---------------------------------------------------------------------------

/**
 * Compare the Bearer token against the expected one as SHA-256 digests:
 * digesting equalizes lengths, making timingSafeEqual applicable and leaking
 * neither content nor length. Header only — never a ?token= query param.
 */
function bearerTokenMatches(header: string | undefined, expectedToken: string): boolean {
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(given, expected);
}

export function registerReplayRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const replay = deps.replay;
  if (replay === undefined) return;

  const replayHandler: RouteHandlerMethod = async (request, reply) => {
    if (!bearerTokenMatches(request.headers.authorization, replay.token)) {
      throw new ApiUnauthorizedError("Missing or invalid Bearer token");
    }
    const query = request.query as Record<string, unknown>;
    const { dto, cacheControl } = await handleReplay(
      {
        from: getQueryParam(query, "from"),
        to: getQueryParam(query, "to"),
        limit: getQueryParam(query, "limit"),
        kind: getQueryParam(query, "kind"),
      },
      Math.floor(Date.now() / 1000),
      replay.query
    );
    // Wildcard CORS is safe: auth is a Bearer header, not an ambient
    // credential a foreign origin could ride on.
    return reply
      .code(200)
      .header("access-control-allow-origin", "*")
      .header("cache-control", cacheControl)
      .send(dto);
  };

  // Compression scoped to this route only — the parity endpoints'
  // byte-for-byte responses must never see a content-encoding change.
  app.register(async (scope) => {
    await scope.register(compress);
    scope.get("/mapcode/replay", replayHandler);
  });

  // A Bearer header from browser JS forces a CORS preflight.
  app.options("/mapcode/replay", async (_request, reply) => {
    return reply
      .code(204)
      .header("access-control-allow-origin", "*")
      .header("access-control-allow-headers", "authorization")
      .header("access-control-allow-methods", "GET")
      .header("access-control-max-age", "86400")
      .send();
  });
}
