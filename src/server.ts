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

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import type { MapcodeService } from "./domain/mapcode-service.ts";
import type { BoundaryService } from "./domain/boundary-service.ts";
import { ApiError } from "./errors.ts";
import { resolveFormat } from "./routes/negotiation.ts";
import { respondError } from "./serialization/respond.ts";
import { registerRootRoutes } from "./routes/root.routes.ts";
import { registerCoordsRoutes } from "./routes/coords.routes.ts";
import { registerCodesRoutes } from "./routes/codes.routes.ts";

// ---------------------------------------------------------------------------
// ServerDeps — passed to all route modules
// ---------------------------------------------------------------------------

export interface ServerDeps {
  mapcodeService: MapcodeService;
  boundaryService: BoundaryService;
  version: string;
}

// ---------------------------------------------------------------------------
// buildServer — creates and configures the Fastify application
//
// To add route modules in later tasks:
//   registerCodesRoutes(app, deps);
//   registerCoordsRoutes(app, deps);
//   …etc — trivially add calls below the root routes registration.
// ---------------------------------------------------------------------------

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // -------------------------------------------------------------------------
  // Error handler
  // -------------------------------------------------------------------------
  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    if (error instanceof ApiError) {
      return respondError(reply, format, error.httpStatus, error.message);
    }
    return respondError(reply, format, 500, error.message ?? "Internal Server Error");
  });

  // -------------------------------------------------------------------------
  // Not-found handler (404)
  // -------------------------------------------------------------------------
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    return respondError(reply, format, 404, `Route not found: ${request.method} ${request.url}`);
  });

  // -------------------------------------------------------------------------
  // Method-not-allowed: reject non-GET/HEAD with 405
  // -------------------------------------------------------------------------
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const { format } = resolveFormat(request.url, request.headers.accept);
      return respondError(reply, format, 405, `Method not allowed: ${request.method}`);
    }
  });

  // -------------------------------------------------------------------------
  // Route modules
  // -------------------------------------------------------------------------
  registerRootRoutes(app, deps);
  registerCoordsRoutes(app, deps);
  registerCodesRoutes(app, deps);
  // Future route modules are added here:
  // registerTerritoriesRoutes(app, deps);
  // registerAlphabetsRoutes(app, deps);

  return app;
}
