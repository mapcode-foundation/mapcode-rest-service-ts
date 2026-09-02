# README for Mapcode REST API Web Services

**Copyright (C) 2014-2026 Stichting Mapcode Foundation (http://www.mapcode.com)**

A TypeScript port of the Mapcode REST service
([mapcode-rest-service](https://github.com/mapcode-foundation/mapcode-rest-service),
originally a Java/Guice/Jersey application). It exposes the **same HTTP API** —
same paths, same query parameters, the same JSON and XML byte-for-byte
serialization, and the same error semantics — implemented on
[Fastify](https://fastify.dev/) over the
[`mapcode-ts`](https://www.npmjs.com/package/mapcode-ts) encoding/decoding
library.

Compared with the original Java service, this port is built for operational
simplicity: it runs with a smaller memory footprint, can sustain higher request
loads, and is easier to package and deploy as a Node.js service.

## Requirements

- **Node.js ≥ 20** for the built service. `npm run dev` runs TypeScript directly
  with Node's type stripping and needs Node.js ≥ 22.6.0.
- The [`mapcode-ts`](https://www.npmjs.com/package/mapcode-ts) library,
  installed from npm.
- A **borders FlatGeobuf file** (`borders.fgb`) for the boundary/territory
  lookups (see below).

## Install

```bash
npm install
```

## The borders file (`borders.fgb`)

The `/mapcode/codes/{lat},{lon}` default response and the
`/mapcode/codes/{lat},{lon}/territories` endpoint look up OpenStreetMap
administrative boundaries (point-in-polygon + ranking). These come from a
[FlatGeobuf](https://flatgeobuf.org/) file that the service loads fully into
memory on startup.

Point the service at it with the **`MAPCODE_BORDERS_PATH`** environment
variable (required — the service refuses to start without it):

```bash
MAPCODE_BORDERS_PATH=./data//borders.fgb
```

The production `borders.fgb` (~22 MB) is produced by the Java repository's
`tools/` pipeline (which ingests OSM extracts and writes the FlatGeobuf). That
pipeline is **out of scope** for this port. A small fixture used by the test
suite lives at `test/resources/borders-test.fgb`.

## Configuration

Configuration is read from environment variables (via `src/config.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `MAPCODE_BORDERS_PATH` | _(required)_ | Path to the `borders.fgb` file. |
| `PORT` | `8080` | TCP port to listen on. |
| `VERSION` | `package.json` version | Version string returned by `/mapcode/version`. |
| `MAPCODE_DB_URL` | _(unset)_ | Optional Postgres connection string. When unset, request recording is disabled and `/mapcode/replay` is not registered. Contains credentials — never logged. **Do not put `sslmode` in the URL** (see TLS note below). |
| `MAPCODE_REPLAY_TOKEN` | _(unset)_ | Bearer token for `GET /mapcode/replay` and `GET /mapcode/replay/stats`. **Required whenever `MAPCODE_DB_URL` is set** — the service refuses to start without it (fail closed). |
| `MAPCODE_DB_CA_CERT` | _(unset)_ | PEM of the database CA certificate, for verified TLS to Postgres. A multi-line PEM cannot be supplied via `.env` (the loader is line-based) — set it as a real environment variable. A PEM collapsed to one line is **silently ignored** by the TLS stack — keep the original line breaks. |

**TLS to Postgres:** set `MAPCODE_DB_CA_CERT` to the cluster's CA and leave
`sslmode` out of `MAPCODE_DB_URL`. With the CA set, the service connects with
full certificate verification (`rejectUnauthorized: true`) — equivalent to
libpq's `verify-full`. Adding `sslmode=require` to the URL *breaks* this: `pg`
8.x gives connection-string `sslmode` precedence over the programmatic `ssl`
options, discarding the configured CA and failing the handshake against a
provider-signed certificate (e.g. DigitalOcean managed Postgres) with
`self-signed certificate in certificate chain`. Providers whose CA is not
downloadable from a control panel expose it in the TLS handshake itself:
`openssl s_client -connect <host>:<port> -starttls postgres -showcerts`.

A `.env` file is optional. If present, it is loaded at startup before
configuration is read. Existing environment variables take precedence over
values in `.env`, so deployment-provided settings are not overwritten. For
example:

```dotenv
# .env
MAPCODE_BORDERS_PATH=./data/borders.fgb
PORT=8080
```

## Scripts

```bash
npm run dev        # run src/index.ts directly (--experimental-strip-types)
npm run build      # tsc → dist/ (relative .ts imports rewritten to .js)
npm start          # node dist/index.js
npm test           # vitest run (full suite)
npm run test:watch # vitest in watch mode
npm run typecheck  # tsc --noEmit
```

Run the built server:

```bash
npm run build
MAPCODE_BORDERS_PATH=./data//borders.fgb node dist/index.js
# → mapcode-rest-service-ts listening on :8080 (version 2.4.19.3)
curl localhost:8080/mapcode/version
# {"version":"2.4.19.3"}
```

## API

All endpoints are `GET`. JSON is the default; XML is selected by
`Accept: application/xml`. The `/mapcode/xml/...` and `/mapcode/json/...` URL
prefixes force XML / JSON regardless of the `Accept` header.

| Method & path | Behavior |
|---|---|
| `GET /mapcode` | HTML help page (`<html><pre>MAPCODE API (<version>) (optimized version)…</pre></html>`). |
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

`client` and `allowLog` are accepted and ignored (kept for API compatibility).
The running service logs incoming requests at info level and handled warnings or
errors at their corresponding levels.

## Logging

The production entrypoint enables Fastify's structured JSON logger at info level.
Each REST call emits Fastify's standard `incoming request` and `request completed`
entries. Handled API errors, unknown routes, and unsupported methods are logged
at warn level. Unexpected request errors are logged at error level with the
serialized error attached.

### Notes on behavior

- **lat** must be in `[-90, 90]` → else 400. **lon** is wrapped to `[-180, 180]`.
- **precision** integer in `[0, 8]` → else 400.
- `territory` **and** `country` both set → 409.
- At sea (no boundary territory), `/codes/{lat},{lon}/territories` returns an
  empty list: JSON `{"territories":[]}`, XML
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><territories></territories>`.

## Request recording and replay

When `MAPCODE_DB_URL` is set, the service records a bounded, best-effort log of
incoming requests to Postgres (fire-and-forget; recording never affects API
latency or availability) and registers `GET /mapcode/replay` to read it back.

`GET /mapcode/replay` is token-protected — it requires
`Authorization: Bearer <MAPCODE_REPLAY_TOKEN>`, else 401. It is JSON-only (no
`/xml` alias). Query parameters:

| Parameter | Default | Meaning |
|---|---|---|
| `from` | _(required)_ | Window start, epoch seconds (inclusive). |
| `to` | now | Window end, epoch seconds (exclusive). |
| `limit` | `50000` | Max rows returned; max `200000`. |
| `kind` | _(all)_ | Comma-separated list of endpoint-kind numbers to filter on. |

The window (`to - from`) is capped at 31 days. The response is a columnar JSON
object (`{from, to, count, truncated, ts, kind, lat, lon, status, client,
mapcode}`) shaped for a canvas/WebGL renderer to iterate directly. Windows
that end more than a minute in the past are cacheable
(`Cache-Control: private, max-age=3600`); more recent windows are `no-store`,
since events can take a few seconds to leave the recorder's queue and become
queryable.

`GET /mapcode/replay/stats` (same Bearer token, no parameters) returns usage
counters over fixed trailing windows anchored at now — non-geo rows included.
Calls to `/mapcode/replay` and anything below it are meta-traffic: they are
not recorded, and historical replay rows are excluded from the counts:

```json
{
  "now": 1756800000,
  "totals": { "1m": 12, "1h": 341, "1d": 5121, "7d": 40100, "31d": 160002, "1y": 1900003, "all": 2400000 },
  "avgPerHour": { "1d": 213.4, "7d": 238.7, "31d": 215.1, "1y": 216.9 },
  "byKind": [
    { "kind": 2, "name": "status", "totals": { "1m": 10, "1h": 300, "1d": 5000, "7d": 40000, "31d": 160000, "1y": 1900000, "all": 2399000 } },
    { "kind": 10, "name": "codes", "totals": { "1m": 2, "1h": 41, "1d": 121, "7d": 100, "31d": 2, "1y": 3, "all": 1000 } }
  ]
}
```

`avgPerHour` is `totals[w] / hours(w)` rounded to one decimal, for the windows
from 1d up (shorter windows are too bursty to average; `all` has an unknown
span). `byKind` breaks the same window counts down per endpoint kind (the
`KIND` vocabulary in `src/routes/recording.ts`), sorted by all-time count
descending; kinds with no rows are omitted, and `totals` are the column sums
of `byKind`. Responses carry `Cache-Control: private, max-age=60`.

## Project layout

```
src/
  index.ts            entrypoint: load config → BoundaryService.load → buildServer → listen
  config.ts           env-based configuration
  server.ts           Fastify app: error/404/405 handlers, route registration
  routes/             HTTP layer (content negotiation, /xml//json/ aliases)
  resources/          framework-agnostic handler logic (ports of *ResourceImpl)
  domain/             MapcodeService (wraps mapcode-ts), BoundaryService, geo helpers
  dto/                DTO build* factories + serialization Schemas
  serialization/      JSON/XML serializers (byte-parity with Jackson/JAXB), formatDouble
test/                 vitest suite (per-endpoint ports + parity sweep)
```

## License

Apache-2.0.
