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

// ---------------------------------------------------------------------------
// Request-recording vocabulary: endpoint kinds, 1-byte enum mappers, and the
// per-request stash that route handlers fill for the onResponse hook.
// See docs/superpowers/specs/2026-08-27-request-recording-and-replay-design.md.
// ---------------------------------------------------------------------------

import type { FastifyReply, FastifyRequest } from "fastify";
import type { RequestRecorder } from "../storage/request-recorder.ts";

/** Endpoint identity codes (smallint in the database, gapped for growth). */
export const KIND = {
  help: 0,
  // version/status: historical rows only — monitoring noise is no longer
  // recorded (see createRecordingHook), like the replay kind below.
  version: 1,
  status: 2,
  codes: 10,
  codesLocal: 11,
  codesInternational: 12,
  codesMapcodes: 13,
  codesTerritories: 14,
  coords: 20,
  territories: 30,
  territory: 31,
  alphabets: 40,
  alphabet: 41,
  // Historical rows only: replay-family requests are no longer recorded
  // (see isReplayFamilyUrl), and stats-query.ts excludes this kind.
  replay: 50,
  unmatched: 99,
} as const;

/** What a route handler stashes on the request for the onResponse hook. */
export interface RecordingStash {
  kind: number;
  latDeg?: number;
  lonDeg?: number;
  mapcode?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    recording: RecordingStash | null;
  }
}

/** Condense an HTTP status to its 1st and 3rd digit: 200→20, 404→44, 500→50. */
export function condenseStatus(code: number): number {
  return Math.trunc(code / 100) * 10 + (code % 10);
}

/** Map the `client` query param to its 1-byte code. The raw string is never stored. */
export function clientToCode(client: string | undefined): number {
  if (client === undefined || client === "") return 0;
  switch (client.toLowerCase()) {
    case "web":
      return 1;
    case "android":
      return 2;
    case "ios":
      return 3;
    default:
      return 4;
  }
}

/** True when allowLog opts the request out of recording (false/0/no, case-insensitive). */
export function allowLogDenies(allowLog: string | undefined): boolean {
  if (allowLog === undefined) return false;
  const value = allowLog.toLowerCase();
  return value === "false" || value === "0" || value === "no";
}

/** Latitude degrees → microdegrees, rounded and clamped to ±90e6. */
export function latToMicro(latDeg: number): number {
  return Math.min(90_000_000, Math.max(-90_000_000, Math.round(latDeg * 1e6)));
}

/** Longitude degrees → microdegrees, rounded and clamped to ±180e6. */
export function lonToMicro(lonDeg: number): number {
  return Math.min(180_000_000, Math.max(-180_000_000, Math.round(lonDeg * 1e6)));
}

// Route pattern (with /xml/ and /json/ prefixes collapsed) → kind, for
// requests whose handler did not stash one (failures and non-geo endpoints).
const ROUTE_KIND: Record<string, number> = {
  "/mapcode": KIND.help,
  "/mapcode/version": KIND.version,
  "/mapcode/status": KIND.status,
  "/mapcode/codes": KIND.codes,
  "/mapcode/codes/:latlon": KIND.codes,
  "/mapcode/codes/:latlon/territories": KIND.codesTerritories,
  "/mapcode/coords": KIND.coords,
  "/mapcode/coords/:code": KIND.coords,
  "/mapcode/territories": KIND.territories,
  "/mapcode/territories/:territory": KIND.territory,
  "/mapcode/alphabets": KIND.alphabets,
  "/mapcode/alphabets/:alphabet": KIND.alphabet,
};

/**
 * Replay-family requests (/mapcode/replay and anything below it) read the log
 * back — meta-traffic, not API usage — and are never recorded. Checked on the
 * raw request path so unmatched 404s below the prefix are skipped too.
 */
export function isReplayFamilyUrl(url: string): boolean {
  const path = url.split("?")[0].replace(/\/+$/, "");
  return path === "/mapcode/replay" || path.startsWith("/mapcode/replay/");
}

/**
 * Derive the endpoint kind from the matched route pattern. `routeUrl` is
 * `request.routeOptions.url` (undefined when no route matched → 99). The
 * `:type` route needs the actual type param to tell local/international/
 * mapcodes apart; an unknown type segment (which 404s) counts as plain codes.
 */
export function kindFromRoute(routeUrl: string | undefined, typeParam: string | undefined): number {
  if (routeUrl === undefined) return KIND.unmatched;
  const normalized = routeUrl.replace(/^\/mapcode\/(xml|json)\//, "/mapcode/");
  if (normalized === "/mapcode/codes/:latlon/:type") {
    switch ((typeParam ?? "").toLowerCase()) {
      case "local":
        return KIND.codesLocal;
      case "international":
        return KIND.codesInternational;
      case "mapcodes":
        return KIND.codesMapcodes;
      default:
        return KIND.codes;
    }
  }
  return ROUTE_KIND[normalized] ?? KIND.unmatched;
}

/**
 * Read a single query value without ever throwing (unlike getQueryParam):
 * the recording hook must never influence a response. Arrays → first element.
 */
export function rawQueryValue(query: unknown, name: string): string | undefined {
  if (query === null || typeof query !== "object") return undefined;
  const value = (query as Record<string, unknown>)[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * The single onResponse hook: assemble the event after the reply is sent.
 * Runs off the response path (onResponse fires after the bytes went out) and
 * must never throw — recording failures must never surface to callers.
 */
export function createRecordingHook(recorder: RequestRecorder) {
  return function recordRequest(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
    try {
      // Only successful calls to real API endpoints are usage: CORS preflights
      // and the replay family are transport/meta noise, invalid calls (4xx —
      // bad params, unknown routes, bad methods) and 5xx are not usage, and
      // status/version are monitoring noise.
      if (
        request.method.toUpperCase() !== "OPTIONS" &&
        reply.statusCode < 400 &&
        !isReplayFamilyUrl(request.url) &&
        !allowLogDenies(rawQueryValue(request.query, "allowLog"))
      ) {
        const stash = request.recording;
        const typeParam = (request.params as Record<string, string> | null)?.["type"];
        const kind = stash?.kind ?? kindFromRoute(request.routeOptions?.url, typeParam);
        if (kind !== KIND.status && kind !== KIND.version) {
          recorder.record({
            ts: Math.floor(Date.now() / 1000),
            kind,
            lat: stash?.latDeg !== undefined ? latToMicro(stash.latDeg) : null,
            lon: stash?.lonDeg !== undefined ? lonToMicro(stash.lonDeg) : null,
            status: condenseStatus(reply.statusCode),
            client: clientToCode(rawQueryValue(request.query, "client")),
            mapcode: stash?.mapcode ?? null,
          });
        }
      }
    } catch {
      // Swallow everything: recording must never affect a response.
    }
    done();
  };
}
