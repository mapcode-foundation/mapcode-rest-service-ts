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

import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { ServerDeps } from "../server.ts";
import { resolveFormat } from "./negotiation.ts";
import { respond, respondHtml } from "../serialization/respond.ts";
import { getHelpHtml, getVersionDto, getStatus, versionSchema } from "../resources/root.ts";

export function registerRootRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { version, mapcodeService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode — HTML help page
  // -------------------------------------------------------------------------
  const helpHandler: RouteHandlerMethod = async (_request, reply) => {
    return respondHtml(reply, getHelpHtml(version));
  };

  app.get("/mapcode", helpHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/version (+ /mapcode/xml/version + /mapcode/json/version)
  // -------------------------------------------------------------------------
  const versionHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    return respond(reply, format, getVersionDto(version), versionSchema);
  };

  app.get("/mapcode/version", versionHandler);
  app.get("/mapcode/xml/version", versionHandler);
  app.get("/mapcode/json/version", versionHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/status (+ /mapcode/xml/status + /mapcode/json/status)
  // Status returns 200 with empty body on success, 500 on failure.
  // -------------------------------------------------------------------------
  const statusHandler: RouteHandlerMethod = async (_request, reply) => {
    const ok = getStatus(mapcodeService);
    if (ok) {
      return reply.code(200).send("");
    }
    return reply.code(500).send("");
  };

  app.get("/mapcode/status", statusHandler);
  app.get("/mapcode/xml/status", statusHandler);
  app.get("/mapcode/json/status", statusHandler);
}
