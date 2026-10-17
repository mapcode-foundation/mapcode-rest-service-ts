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

import { STATUS_CODES } from "node:http";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
  type FastifyServerOptions,
} from "fastify";
import type { MapcodeService } from "./domain/mapcode-service.ts";
import type { BoundaryService } from "./domain/boundary-service.ts";
import { ApiError } from "./errors.ts";
import { resolveFormat } from "./routes/negotiation.ts";
import { respondError } from "./serialization/respond.ts";
import { registerRootRoutes } from "./routes/root.routes.ts";
import { registerCoordsRoutes } from "./routes/coords.routes.ts";
import { registerCodesRoutes } from "./routes/codes.routes.ts";
import { registerTerritoriesRoutes } from "./routes/territories.routes.ts";
import { registerAlphabetsRoutes } from "./routes/alphabets.routes.ts";
import { createRecordingHook } from "./routes/recording.ts";
import type { RequestRecorder } from "./storage/request-recorder.ts";
import { registerReplayRoutes } from "./routes/replay.routes.ts";
import type { ReplayQueryFn } from "./storage/replay-query.ts";
import type { StatsQueryFn, StorageQueryFn } from "./storage/stats-query.ts";

// ---------------------------------------------------------------------------
// ServerDeps — passed to all route modules
// ---------------------------------------------------------------------------

export interface ServerDeps {
  mapcodeService: MapcodeService;
  boundaryService: BoundaryService;
  version: string;
  logger?: FastifyServerOptions["logger"];
  /** Optional request recorder; absent → no recording hook is installed. */
  recorder?: RequestRecorder;
  /** Replay endpoints config; absent → /mapcode/replay[/stats] is not registered. */
  replay?: { token: string; query: ReplayQueryFn; stats: StatsQueryFn; storage: StorageQueryFn };
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
  const app = Fastify({ logger: deps.logger ?? false, routerOptions: { ignoreTrailingSlash: true } });

  // Per-request stash the route handlers fill for the recording hook.
  app.decorateRequest("recording", null);
  if (deps.recorder !== undefined) {
    app.addHook("onResponse", createRecordingHook(deps.recorder, deps.boundaryService));
  }

  // -------------------------------------------------------------------------
  // Error handler
  // -------------------------------------------------------------------------
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const failure = describeFailure(error);
    request.log[failure.level]({
      err: error,
      method: request.method,
      url: request.url,
      statusCode: failure.status,
    }, failure.logMessage);
    return respondError(reply, format, failure.status, failure.message);
  });

  // -------------------------------------------------------------------------
  // Not-found handler (404)
  // -------------------------------------------------------------------------
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    request.log.warn({
      method: request.method,
      url: request.url,
      statusCode: 404,
    }, "route not found");
    return respondError(reply, format, 404, `Route not found: ${request.method} ${request.url}`);
  });

  // -------------------------------------------------------------------------
  // Method-not-allowed: reject non-GET/HEAD with 405
  // -------------------------------------------------------------------------
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    // The replay CORS preflights are the only permitted non-GET requests. This
    // hook runs onRequest, before route matching, so routerOptions'
    // ignoreTrailingSlash hasn't applied yet — strip the query string and
    // any trailing slash by hand to match the registered paths.
    const path = request.url.split("?")[0].replace(/\/+$/, "");
    const isReplayPath = deps.replay !== undefined && (path === "/mapcode/replay" || path === "/mapcode/replay/stats");
    if (method === "OPTIONS" && isReplayPath) return;
    if (method !== "GET" && method !== "HEAD") {
      const { format } = resolveFormat(request.url, request.headers.accept);
      request.log.warn({
        method: request.method,
        url: request.url,
        statusCode: 405,
      }, "method not allowed");
      reply.header("allow", isReplayPath ? "GET, HEAD, OPTIONS" : "GET, HEAD");
      return respondError(reply, format, 405, `Method not allowed: ${request.method}`);
    }
  });

  // -------------------------------------------------------------------------
  // Route modules
  // -------------------------------------------------------------------------
  registerRootRoutes(app, deps);
  registerCoordsRoutes(app, deps);
  registerCodesRoutes(app, deps);
  registerTerritoriesRoutes(app, deps);
  registerAlphabetsRoutes(app, deps);
  registerReplayRoutes(app, deps);

  return app;
}

interface Failure {
  status: number;
  message: string;
  level: "warn" | "error";
  logMessage: string;
}

// A client error keeps its status, but the body gets only the standard reason
// phrase; anything else is a 500. Either way the detail goes to the log only.
function describeFailure(error: FastifyError): Failure {
  if (error instanceof ApiError) {
    return { status: error.httpStatus, message: error.message, level: "warn", logMessage: "api request failed" };
  }
  const status = error.statusCode;
  if (status !== undefined && status >= 400 && status < 500) {
    return { status, message: STATUS_CODES[status] ?? "Bad Request", level: "warn", logMessage: "request rejected" };
  }
  return { status: 500, message: "Internal Server Error", level: "error", logMessage: "unexpected request error" };
}
