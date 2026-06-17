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
import { ApiForbiddenError } from "../errors.ts";
import { handleCoords } from "../resources/coords.ts";

export function registerCoordsRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { mapcodeService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode/coords/{code} — decode a mapcode to lat/lon
  // (also /mapcode/xml/coords/{code} and /mapcode/json/coords/{code})
  //
  // The {code} param may contain spaces (encoded as %20) and dots.
  // Fastify preserves the raw param value; we decodeURIComponent it.
  // -------------------------------------------------------------------------
  const coordsHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, string | undefined>;

    const code = decodeURIComponent(params["code"] ?? "");
    const context = query["context"];
    const territory = query["territory"];
    const include = query["include"] ?? "";

    const { dto, schema } = handleCoords(
      { code, context, territory, include },
      mapcodeService
    );
    return respond(reply, format, dto, schema);
  };

  app.get("/mapcode/coords/:code", coordsHandler);
  app.get("/mapcode/xml/coords/:code", coordsHandler);
  app.get("/mapcode/json/coords/:code", coordsHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/coords (no code) — forbidden (403)
  // Also /mapcode/xml/coords and /mapcode/json/coords.
  // -------------------------------------------------------------------------
  const coordsForbiddenHandler: RouteHandlerMethod = async (_request, _reply) => {
    throw new ApiForbiddenError("Missing URL path parameters: /{mapcode}");
  };

  app.get("/mapcode/coords", coordsForbiddenHandler);
  app.get("/mapcode/xml/coords", coordsForbiddenHandler);
  app.get("/mapcode/json/coords", coordsForbiddenHandler);
}
