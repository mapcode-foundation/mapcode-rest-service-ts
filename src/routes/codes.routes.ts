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
import { respond, respondList } from "../serialization/respond.ts";
import { ApiForbiddenError, ApiNotFoundError } from "../errors.ts";
import { handleCodes, handleTerritoriesForLatLon } from "../resources/codes.ts";

/** Split a "lat,lon" path segment on the FIRST comma. */
function splitLatLon(latlon: string): { latStr: string; lonStr: string } | null {
  const decoded = decodeURIComponent(latlon);
  const comma = decoded.indexOf(",");
  if (comma < 0) return null; // no comma → 404
  const latStr = decoded.slice(0, comma);
  const lonStr = decoded.slice(comma + 1);
  if (latStr === "" || lonStr === "") return null; // empty part → 404
  return { latStr, lonStr };
}

export function registerCodesRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { mapcodeService, boundaryService } = deps;

  // -------------------------------------------------------------------------
  // GET /mapcode/codes (no lat/lon) — forbidden (403).
  // -------------------------------------------------------------------------
  const forbiddenHandler: RouteHandlerMethod = async () => {
    throw new ApiForbiddenError("Missing URL path parameters: /{lat,lon}/{mapcodes|local|international}");
  };
  app.get("/mapcode/codes", forbiddenHandler);
  app.get("/mapcode/xml/codes", forbiddenHandler);
  app.get("/mapcode/json/codes", forbiddenHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/codes/{lat,lon} — default (no type).
  // -------------------------------------------------------------------------
  const codesHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, string | undefined>;

    const ll = splitLatLon(params["latlon"] ?? "");
    if (ll === null) {
      throw new ApiNotFoundError(`Route not found: ${request.method} ${request.url}`);
    }

    const result = handleCodes(
      {
        latStr: ll.latStr,
        lonStr: ll.lonStr,
        precision: query["precision"],
        territory: query["territory"],
        country: query["country"],
        context: query["context"],
        alphabet: query["alphabet"],
        include: query["include"] ?? "",
      },
      mapcodeService,
      boundaryService
    );
    return result.kind === "list"
      ? respondList(reply, format, result.items, result.schema)
      : respond(reply, format, result.dto, result.schema);
  };
  app.get("/mapcode/codes/:latlon", codesHandler);
  app.get("/mapcode/xml/codes/:latlon", codesHandler);
  app.get("/mapcode/json/codes/:latlon", codesHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/codes/{lat,lon}/territories — ranked territory candidates.
  // (Registered as a static path, so it wins over the :type param route.)
  // -------------------------------------------------------------------------
  const territoriesHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;

    const ll = splitLatLon(params["latlon"] ?? "");
    if (ll === null) {
      throw new ApiNotFoundError(`Route not found: ${request.method} ${request.url}`);
    }
    const { dto, schema } = handleTerritoriesForLatLon(ll.latStr, ll.lonStr, boundaryService);
    return respond(reply, format, dto, schema);
  };
  app.get("/mapcode/codes/:latlon/territories", territoriesHandler);
  app.get("/mapcode/xml/codes/:latlon/territories", territoriesHandler);
  app.get("/mapcode/json/codes/:latlon/territories", territoriesHandler);

  // -------------------------------------------------------------------------
  // GET /mapcode/codes/{lat,lon}/{type} — type ∈ {mapcodes,local,international}.
  // An unknown type segment yields 404 (no matching resource), mirroring Java.
  // -------------------------------------------------------------------------
  const codesTypeHandler: RouteHandlerMethod = async (request, reply) => {
    const { format } = resolveFormat(request.url, request.headers.accept);
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, string | undefined>;

    const type = (params["type"] ?? "").toLowerCase();
    if (type !== "mapcodes" && type !== "local" && type !== "international") {
      throw new ApiNotFoundError(`Route not found: ${request.method} ${request.url}`);
    }

    const ll = splitLatLon(params["latlon"] ?? "");
    if (ll === null) {
      throw new ApiNotFoundError(`Route not found: ${request.method} ${request.url}`);
    }

    const result = handleCodes(
      {
        latStr: ll.latStr,
        lonStr: ll.lonStr,
        type,
        precision: query["precision"],
        territory: query["territory"],
        country: query["country"],
        context: query["context"],
        alphabet: query["alphabet"],
        include: query["include"] ?? "",
      },
      mapcodeService,
      boundaryService
    );
    return result.kind === "list"
      ? respondList(reply, format, result.items, result.schema)
      : respond(reply, format, result.dto, result.schema);
  };
  app.get("/mapcode/codes/:latlon/:type", codesTypeHandler);
  app.get("/mapcode/xml/codes/:latlon/:type", codesTypeHandler);
  app.get("/mapcode/json/codes/:latlon/:type", codesTypeHandler);
}
