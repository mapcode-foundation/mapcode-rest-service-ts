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

import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../server.ts";
import { resolveFormat } from "./negotiation.ts";
import { respond, respondHtml } from "../serialization/respond.ts";
import { getHelpHtml, getVersionDto, getStatus, versionSchema } from "../resources/root.ts";

export function registerRootRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { version, mapcodeService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode — HTML help page
  // -------------------------------------------------------------------------
  app.get("/mapcode", async (_request, reply) => {
    return respondHtml(reply, getHelpHtml(version));
  });

  // -------------------------------------------------------------------------
  // GET /mapcode/version (+ /mapcode/xml/version + /mapcode/json/version)
  // -------------------------------------------------------------------------
  const versionHandler = async (
    request: { url: string; headers: { accept?: string } },
    reply: Parameters<typeof respond>[0]
  ) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    return respond(reply, format, getVersionDto(version), versionSchema);
  };

  app.get("/mapcode/version", versionHandler as never);
  app.get("/mapcode/xml/version", versionHandler as never);
  app.get("/mapcode/json/version", versionHandler as never);

  // -------------------------------------------------------------------------
  // GET /mapcode/status (+ /mapcode/xml/status + /mapcode/json/status)
  // Status returns 200 with empty body on success, 500 on failure.
  // -------------------------------------------------------------------------
  const statusHandler = async (
    _request: unknown,
    reply: Parameters<typeof respond>[0]
  ) => {
    const ok = getStatus(mapcodeService);
    if (ok) {
      return reply.code(200).send("");
    }
    return reply.code(500).send("");
  };

  app.get("/mapcode/status", statusHandler as never);
  app.get("/mapcode/xml/status", statusHandler as never);
  app.get("/mapcode/json/status", statusHandler as never);
}
