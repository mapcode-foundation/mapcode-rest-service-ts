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
import { handleGetAlphabets, handleGetAlphabet } from "../resources/alphabets.ts";

export function registerAlphabetsRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { mapcodeService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode/alphabets — list all alphabets with paging.
  // -------------------------------------------------------------------------
  const alphabetsHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const query = request.query as Record<string, string | undefined>;

    const { dto, schema } = handleGetAlphabets(
      { offset: query["offset"], count: query["count"] },
      mapcodeService
    );
    return respond(reply, format, dto, schema);
  };
  app.get("/mapcode/alphabets", alphabetsHandler);
  app.get("/mapcode/xml/alphabets", alphabetsHandler);
  app.get("/mapcode/json/alphabets", alphabetsHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/alphabets/{alphabet} — single alphabet lookup.
  // -------------------------------------------------------------------------
  const alphabetHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;

    const { dto, schema } = handleGetAlphabet(
      { alphabet: params["alphabet"] ?? "" },
      mapcodeService
    );
    return respond(reply, format, dto, schema);
  };
  app.get("/mapcode/alphabets/:alphabet", alphabetHandler);
  app.get("/mapcode/xml/alphabets/:alphabet", alphabetHandler);
  app.get("/mapcode/json/alphabets/:alphabet", alphabetHandler);
}
