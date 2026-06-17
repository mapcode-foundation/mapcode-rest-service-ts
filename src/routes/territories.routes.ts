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
import { respond } from "../serialization/respond.ts";
import { handleGetTerritories, handleGetTerritory } from "../resources/territories.ts";
import { getQueryParam } from "./query.ts";

export function registerTerritoriesRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { mapcodeService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode/territories — list all territories with paging.
  // -------------------------------------------------------------------------
  const territoriesHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const query = request.query as Record<string, unknown>;

    const { dto, schema } = handleGetTerritories(
      { offset: getQueryParam(query, "offset"), count: getQueryParam(query, "count") },
      mapcodeService
    );
    return respond(reply, format, dto, schema);
  };
  app.get("/mapcode/territories", territoriesHandler);
  app.get("/mapcode/xml/territories", territoriesHandler);
  app.get("/mapcode/json/territories", territoriesHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/territories/{territory} — single territory lookup.
  // -------------------------------------------------------------------------
  const territoryHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, unknown>;

    const { dto, schema } = handleGetTerritory(
      { territory: params["territory"] ?? "", context: getQueryParam(query, "context") },
      mapcodeService
    );
    return respond(reply, format, dto, schema);
  };
  app.get("/mapcode/territories/:territory", territoryHandler);
  app.get("/mapcode/xml/territories/:territory", territoryHandler);
  app.get("/mapcode/json/territories/:territory", territoryHandler);
}
