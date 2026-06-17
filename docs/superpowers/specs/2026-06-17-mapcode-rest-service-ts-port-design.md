# Design: Port mapcode-rest-service (Java) to TypeScript

**Date:** 2026-06-17
**Status:** Approved
**Author:** Rijn Buve / Claude

## 1. Goal

Port the Java `mapcode-rest-service` to TypeScript, using the `mapcode-ts` npm
library for all encode/decode/territory/alphabet logic. The TypeScript service
must expose **exactly the same REST API** as the Java service (byte-for-byte
response parity where the Java tests assert it), so it is a drop-in replacement
for the public `https://api.mapcode.com/mapcode` API.

The test suite must be a **superset** of the existing Java tests: every Java
test case is reproduced, plus additional parity and edge-case tests.

The implementation may differ from Java where TypeScript/Node idioms are
cleaner. Specifically:

- Configuration via `.env` (Node built-in `--env-file`), **not**
  `resources/` + `external-resources/` + `.properties`.
- No bespoke CLI / WAR / Tomcat / Procfile startup — a plain Node entrypoint.
- **No** request tracing (`speedtools.Tracer`, MongoDB) — dropped entirely.
- No Guice DI, no akka/Futures async, no JAX-RS `AsyncResponse`.
- Run comfortably on a **1 GB RAM** machine under light load — memory-frugal by
  design, especially the borders data.

## 2. Constraints & principles

- **Minimize external dependencies.** Runtime deps (final): `fastify`,
  `flatgeobuf` (+ transitive `flatbuffers`), `flatbush`, `mapcode-ts`.
  XML serialization, JSON field-ordering, `.env` loading, and DI are all
  dependency-free.
- **Memory-optimized borders from day one** (see §7). The in-memory polygon
  store uses flat typed arrays, not arrays-of-objects, so later optimization is
  about shrinking/quantizing, not rewriting.
- Layered architecture; each layer independently testable.
- Standard Node/TypeScript conventions throughout.

## 3. The Java API surface (what we reproduce)

All endpoints are `GET`. JSON is the default; XML is selected by
`Accept: application/xml`. The `/mapcode/xml/...` and `/mapcode/json/...` URL
prefixes force XML / JSON regardless of the `Accept` header.

| Method & path | Behavior |
|---|---|
| `GET /mapcode` | HTML help page (`<html><pre>MAPCODE API (<version>)…</pre></html>`). |
| `GET /mapcode/version` | `VersionDTO` `{version}`. |
| `GET /mapcode/status` | Round-trip encode/decode self-check; 200 if OK, else 500. |
| `GET /mapcode/codes` | **403** (missing path params). |
| `GET /mapcode/codes/{lat},{lon}` | Encode → `MapcodesDTO` (local, international, mapcodes[], territories[]). |
| `GET /mapcode/codes/{lat},{lon}/{type}` | `type` ∈ `mapcodes\|local\|international` (case-insensitive). `local`/`international` → `MapcodeDTO`; `mapcodes` → `MapcodeListDTO` (bare JSON array). |
| `GET /mapcode/codes/{lat},{lon}/territories` | `TerritoryCandidatesDTO` — ranked OSM admin-boundary territories. |
| `GET /mapcode/coords` | **403** (missing path params). |
| `GET /mapcode/coords/{code}` | Decode → `PointDTO` (or `RectangleDTO` if `include=rectangle`). |
| `GET /mapcode/territories` | `TerritoriesDTO` `{total, territories[]}` with `offset`/`count`. |
| `GET /mapcode/territories/{territory}` | `TerritoryDTO`. |
| `GET /mapcode/alphabets` | `AlphabetsDTO` `{total, alphabets[]}` with `offset`/`count`. |
| `GET /mapcode/alphabets/{alphabet}` | `AlphabetDTO`. |

### Query parameters

- `/codes/{lat},{lon}[/{type}]`: `precision` (0–8, default 0), `territory`
  (name or alphacode), `country` (ISO-3166 alpha-2/alpha-3), `alphabet`,
  `include` (comma list of `offset,territory,alphabet,rectangle`), `client`,
  `allowLog`. `context` **must be absent** here → 400 if present.
- `/coords/{code}`: `context` (territory name/alphacode), `include` (`rectangle`
  only effective), `client`, `allowLog`. `territory` **must be absent** → 400.
- `/territories`, `/alphabets`: `offset` (default 0; negative counts from end),
  `count` (default 1000; **negative → 400**), `client`, `allowLog`.
- `/territories/{territory}`: `context` (disambiguation), `client`, `allowLog`.

`client` and `allowLog` are **accepted and ignored** (kept for API compat; no
tracing).

### Key behaviors (from `MapcodeResourceImpl`)

- **lat** parsed as double, must be in `[-90, 90]` → else 400.
- **lon** parsed as double, then wrapped to `[-180, 180]` via `Geo.mapToLon`.
- **precision** integer in `[0, 8]` → else 400.
- `territory` **and** `country` both set → 409 (`ApiConflictException`).
- `territory` resolution (`resolveTerritory`): HTML-unescape, uppercase,
  `-`↔`_` normalization, optional parent-context disambiguation, alias lookup.
- `country` validated via `Territory.fromCountryISO2` then `…ISO3`.
- Encode path computes: all mapcodes, the international mapcode, and a "local"
  mapcode. For each it also decodes to a rectangle (for `include=rectangle`).
- **Default (no `type`)** response (`MapcodesDTO`): also looks up boundary
  territories. If non-empty, the `mapcodes` array is **re-sorted** by the
  position of each code's territory in the territories list (codes whose
  territory isn't listed go last, stable), and `local` is overridden to the
  first code whose territory matches the top boundary territory. At sea (empty),
  original order + original local-selection logic are preserved.
- `MapcodeDTO` field population (`createMapcodeDTO`):
  - `mapcode` = `mapcode.getCode(precision)`.
  - `mapcodeInAlphabet` = `getCode(precision, alphabet)`; included always if
    `include=alphabet`, else only if it differs from `mapcode`.
  - `territory` = territory string, included if `include=territory` **or**
    territory ≠ `AAA`.
  - `territoryInAlphabet` = same gating as territory; within that, always if
    `include=alphabet`, else only if differs from `territory`.
  - `offsetMeters` = `Math.round(distanceInMeters * 1e6) / 1e6` when
    `include=offset` (great-circle distance from input to decoded code center).
  - `rectangle` = `RectangleDTO` when `include=rectangle`.
- `/coords/{code}`: validate `Mapcode.isValidMapcodeFormat` → else 400;
  decode (or decodeToRectangle) with optional context; unknown → 404.
- `/status`: encodes `52.158974,4.492479` as `local` with territory `NLD`,
  expects `QJM.1G`, then decodes `NLD QJM.1G` back and checks it's ≈ the input.

## 4. Architecture & layering

```
HTTP layer (Fastify): routing, content negotiation, /xml//json/ aliases, error mapping
        │ parsed/validated request → typed params
Resource handlers (framework-agnostic): the MapcodeResourceImpl/RootResourceImpl logic
        │ domain calls
Domain services:
   • MapcodeService  — wraps mapcode-ts; resolveTerritory/alphabet/country helpers
   • BoundaryService — in-memory OSM polygons; point-in-polygon + ranking
   • geo             — mapToLon, distanceInMeters (ported from speedtools Geo)
        │ plain result objects
DTO builders → ordered field specs
        │
Serialization: JSON (ordered, null/empty-omitting) + XML (hand-rolled)
```

Wiring is plain constructor injection via a `buildServer(deps)` factory (no DI
container). Handlers are pure functions of `(params, services)` returning a DTO
or throwing an `ApiError`; this keeps them trivially unit-testable and lets the
`/status` self-check call them directly (as the Java code does).

## 5. Directory layout

```
src/
  index.ts                 # entrypoint: load env, build boundary service, listen
  config.ts                # env parsing + validation
  server.ts                # buildServer(deps): Fastify instance + route registration + error handler
  routes/
    mapcode.routes.ts      # /codes, /coords, /territories, /alphabets (+ alias variants)
    root.routes.ts         # /, /version, /status
    negotiation.ts         # Accept header + /xml//json/ prefix → output format
  resources/
    codes.ts               # convertLatLonToMapcode logic
    coords.ts              # convertMapcodeToLatLon logic
    territories.ts         # getTerritories / getTerritory / getTerritoriesForLatLon
    alphabets.ts           # getAlphabets / getAlphabet
    root.ts                # help HTML / version / status
  domain/
    mapcode-service.ts     # mapcode-ts wrapper + resolveTerritory/alphabet/country
    boundary-service.ts    # FGB load → typed-array store + flatbush + PIP + ranking
    geo.ts                 # mapToLon, distanceInMeters
  dto/
    index.ts               # DTO builders + field specs (shared by JSON & XML)
  serialization/
    json.ts                # ordered JSON writer (omit null/empty; Java-style doubles)
    xml.ts                 # hand-rolled XML writer
  errors.ts                # ApiError hierarchy → HTTP status
test/
  resources/borders-test.fgb        # copied verbatim from Java src/test/resources
  *.test.ts                         # superset suite (see §10)
docs/superpowers/specs/...          # this spec + plan
.env.example
package.json  tsconfig.json  vitest.config.ts
```

## 6. Serialization parity (highest-risk area)

The Java tests assert exact JSON and XML strings (e.g.
`{"local":{"mapcode":"JL0.KP","territory":"LUX"},...}` and
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes>...`).

**DTO model:** Each DTO is described by an ordered **field spec** — a list of
`{name, type}` in Java declaration order. Builders produce a plain object whose
keys are inserted in that order. Both serializers consume the same spec.

**JSON writer rules (replicate Jackson `@JsonInclude(NON_EMPTY)`):**
- Emit fields in declaration order.
- Omit `null`/`undefined`, empty string, and empty array.
- `string`/`boolean` → standard JSON.
- `double`-typed numbers → **Java-style formatting**: a `formatDouble()` helper
  that yields the same text Java's `Double.toString`/Jackson would, including
  rendering integer-valued doubles with a trailing `.0` (JS default would drop
  it). `offsetMeters` already rounded to 6 decimals upstream.
- Top-level list DTO (`MapcodeListDTO`) serializes as a bare JSON array.

**XML writer rules (replicate JAXB):**
- Fixed prologue: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`.
- Root element name per DTO (`mapcodes`, `mapcode`, `point`, `rectangle`,
  `territories`, `territory`, `alphabets`, `alphabet`, `version`).
- List elements: wrapper element contains repeated item elements
  (e.g. `<mapcodes><mapcode>…</mapcode>…</mapcodes>`;
  `<territories><territory><alphaCode>NLD</alphaCode></territory></territories>`).
- Same null/empty omission as JSON. XML-escape text content.

**Known residual risk — lat/lon double formatting.** Java emits `Double.toString`;
JS emits shortest round-trip. They agree in the overwhelming majority of cases
but not universally. Mitigation: centralize all double rendering in
`formatDouble()`, and add a **parity sweep test** that compares TS output to
captured Java output across a broad grid of coordinates/precisions/alphabets/
includes. Tune `formatDouble()` until the sweep is clean.

## 7. BoundaryService (memory-optimized)

Replaces the Java `BoundaryService` (JTS + FlatGeobuf reader + STRtree +
prepared-geometry LRU cache).

**Load (startup, once):**
- Use the `flatgeobuf` reader to iterate features from the borders file.
- Per feature, read properties `alphaCode` (required), `parentAlphaCode`
  (nullable; empty→null), `adminLevel` (required int), `area` (required double).
  Skip features missing required props or geometry.
- Transcode geometry into a shared **flat typed-array store**, then discard the
  lib's feature objects:
  - `coords: Float64Array` — all ring vertices, lon/lat interleaved.
  - `ringOffsets: Uint32Array`, `polyOffsets: Uint32Array` — CSR-style slice
    indices delimiting rings within polygons and polygons within features.
    (Supports MultiPolygon and holes.)
  - Per-feature metadata in parallel arrays: `alphaCode: string[]`,
    `parentAlphaCode: (string|null)[]`, `adminLevel: Uint8Array`,
    `area: Float64Array`, and bbox arrays `minX/minY/maxX/maxY: Float64Array`.
- Build a `flatbush` index over the feature bboxes.

**Query `lookup(lat, lon) → TerritoryMatch[]`:**
- flatbush bbox search for the point → candidate feature indices.
- For each candidate, ray-casting **point-in-polygon** over the flat coord pool,
  honoring holes (point counts as inside only if in an outer ring and not in any
  of that polygon's holes).
- Collect matches; sort by `adminLevel` **descending**, then `area` **ascending**
  (identical to Java: more specific subdivision before country; smaller polygon
  first at equal level).
- `TerritoryMatch = { alphaCode, parentAlphaCode, adminLevel, area }`.

No prepared-geometry cache: at light load the candidate set per point is tiny,
ray-casting is cheap and allocation-light, and we save the JTS-cache memory.

**Memory:** 22 MB production FGB → tens of MB of `Float64Array` coords + small
index. Comfortable on 1 GB. Future optimization (out of scope now): quantize
coords to `Float32Array`/scaled ints — the query code is agnostic to this.

**Decision:** spatial index = **flatbush** (tiny, zero-dep, typed-array R-tree).

## 8. Configuration & runtime

`config.ts` reads from `process.env` (populated by Node's built-in
`--env-file=.env`; no `dotenv` dependency):

- `PORT` — default `8080`.
- `MAPCODE_BORDERS_PATH` — **required**; service refuses to start if missing or
  unreadable (matches Java). Tests point it at `borders-test.fgb`.
- `VERSION` — optional; defaults to the `version` field of `package.json`.
- `MAPCODE_BOUNDARY_PREPARED_CACHE_SIZE` and other JTS-specific knobs are **not**
  ported (no prepared cache).

`index.ts` (standard entrypoint): parse config → construct `BoundaryService`
(load borders) → `buildServer({ boundaryService, mapcodeService, version })` →
`listen({ port })`. Run with `node --env-file=.env dist/index.js` (prod) or
`tsx --env-file=.env src/index.ts` (dev).

Dropped: Guice, speedtools, akka, MongoDB tracing, `mapcode-secret.properties`,
`log4j.xml`, WAR/Tomcat/Procfile/CLI. Logging uses Fastify's built-in pino.

## 9. Error handling

`errors.ts` defines an `ApiError` base (carrying `httpStatus` and a message) with
subclasses mirroring the Java exceptions. Handlers throw; one Fastify error
handler maps them to status + a serialized error body (JSON or XML per the
request's negotiated format).

| ApiError | Raised when | HTTP |
|---|---|---|
| `ApiInvalidFormatError` | bad lat/lon/precision/territory/country/alphabet/include; forbidden param present (`context` on `/codes`, `territory` on `/coords`); empty/`x` values | **400** |
| `ApiNotFoundError` | no mapcode/location/rectangle found; no local mapcode | **404** |
| `ApiForbiddenError` | `/codes` or `/coords` with no path params | **403** |
| `ApiConflictError` | both `territory` and `country` given | **409** |
| `ApiIntegerOutOfRangeError` | negative `count` | **400** |

- Unknown route → **404**; non-`GET`/`HEAD` method → **405** (Java blocked these
  in `web.xml`).
- **Error body shape** (Java tests assert only status codes, so we define and
  lock our own): JSON `{"message": "...", "status": <code>}`; XML
  `<exception><message>…</message><status>…</status></exception>`. Final shape
  fixed in the plan and covered by new tests.

## 10. Testing strategy (superset)

- **Vitest**; server in-process via `fastify.inject()` (no socket needed).
- Copy the Java `borders-test.fgb` fixture verbatim so `territories` results and
  the boundary-driven re-ranking match exactly.
- **Reproduce every Java test case**, organized by source class:
  - `ApiCodesTest` — encode JSON/XML at precision 0/1/8; `mapcodes`/`local`/
    `international` filters; `territory`/`country` restriction; `include=offset,
    territory,alphabet`; lat/lon range & wrapping; missing/invalid params;
    `context` forbidden; `local` not-found (404).
  - `ApiCoordsTest` — decode JSON/XML; `context`; `include=rectangle`; invalid
    mapcode format (400); unknown mapcode (404); `territory` forbidden (400).
  - `ApiCodesTerritoriesTest` — `/codes/{lat},{lon}/territories` ranking; at-sea
    empty list.
  - `ApiTerritoriesTest` — list with `offset`/`count` (incl. negative offset);
    single territory; `context` disambiguation; negative `count` → 400.
  - `ApiAlphabetsTest` — list + single alphabet; pagination.
  - `ApiOthersTest` — `/version`, `/status`, help page, `/xml/` & `/json/`
    aliases.
  - `ApiDTOTest`, `TerritoryCandidateDTOTest`, `TerritoryCandidateListDTOTest` —
    DTO construction/validation/serialization.
  - `BoundaryServiceTest` — load + point-in-polygon + ranking unit tests.
- **Add (the "and some"):**
  - Byte-for-byte **parity sweep**: TS vs captured Java output across a coordinate
    grid × precisions × alphabets × include combinations.
  - Boundary PIP edge cases (holes, multipolygons, on-border, antimeridian-ish).
  - JSON **and** XML asserted for every endpoint (Java only does some).
  - Config-failure: missing/unreadable borders file → startup error.
  - 405 for non-GET; 404 for unknown routes.

## 11. Out of scope

- Request tracing / MongoDB / analytics.
- Re-deriving the mapcode algorithm (delegated to `mapcode-ts`).
- Regenerating `borders.fgb` (the Python `tools/` pipeline stays in the Java
  repo; the TS service only consumes the file).
- Coordinate quantization / Float32 optimization (future; store is ready for it).

## 12. Implementation phasing (summary; full plan separate)

1. Scaffold (package.json, tsconfig, vitest, config, .env, entrypoint skeleton).
2. Serialization core (field specs, JSON + XML writers, `formatDouble`) + tests.
3. `geo.ts` (`mapToLon`, `distanceInMeters`) + tests.
4. `MapcodeService` wrapper + `resolveTerritory`/alphabet/country + tests.
5. DTOs + builders.
6. `BoundaryService` (FGB load → typed-array store + flatbush + PIP + ranking).
7. Resource handlers (codes, coords, territories, alphabets, root).
8. Fastify routes + negotiation + `/xml//json/` aliases + error handler.
9. Full superset test suite + parity sweep; tune `formatDouble`.
10. README, `.env.example`, build script, final verification.
