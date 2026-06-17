# Mapcode REST Service TypeScript Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Java `mapcode-rest-service` to TypeScript on Fastify, using `mapcode-ts` for codec logic, with byte-for-byte API parity and a superset test suite.

**Architecture:** Layered — Fastify routes (negotiation + error mapping) → framework-agnostic resource handlers → domain services (`mapcode-service` wrapping `mapcode-ts`; `boundary-service` with an in-memory typed-array polygon store) → DTO builders → schema-driven JSON/XML serializers. Wiring via a plain `buildServer(deps)` factory (no DI container).

**Tech Stack:** Node ≥20, TypeScript, Fastify, `mapcode-ts`, `flatgeobuf` (+`flatbuffers`), `flatbush`, Vitest.

## Global Constraints

- **Source of truth:** The Java repo at `../mapcode-rest-service` (relative to project root `/Users/ribu/source/mapcode-foundation/mapcode-rest-service-ts`). Java service code: `../mapcode-rest-service/service/src/main/java/com/mapcode/services/`. Java tests: `../mapcode-rest-service/service/src/test/java/com/mapcode/services/`. **All ported tests must copy the exact expected JSON/XML strings from these Java test files verbatim.**
- **Design spec:** `docs/superpowers/specs/2026-06-17-mapcode-rest-service-ts-port-design.md` — read it before starting.
- **Runtime dependencies (max):** `fastify`, `mapcode-ts`, `flatgeobuf`, `flatbush`. No other runtime deps (XML, JSON ordering, `.env`, DI are all hand-rolled / built-in).
- **Node:** `>=20`. `.env` via Node's built-in `--env-file` (no `dotenv`).
- **Memory:** target 1 GB RAM. Boundary store uses flat typed arrays (`Float64Array`/`Uint32Array`), never arrays-of-objects per vertex.
- **No tracing:** `client` and `allowLog` query params are accepted and ignored. No MongoDB, no `speedtools.Tracer`.
- **Copyright header** on every source file (match the Java `Copyright (C) ... Stichting Mapcode Foundation` Apache-2.0 header style).
- **JSON serialization = Jackson `@JsonInclude(NON_EMPTY)`:** omit `null`/`undefined`, empty string, empty array. **XML = JAXB:** omit null/empty scalars but **render empty list wrappers as self-closing** (`<aliases/>`). JSON and XML field order can differ per DTO — match the test bytes, not a single canonical order.
- **Versioning:** `buildServer` takes an explicit `version` string. Tests construct it with `"1.0"`.
- **TDD throughout. Commit after every passing task.**

---

## Task 1: Project scaffold, config, entrypoint skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/config.ts`, `src/index.ts` (skeleton)
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` where `interface Config { port: number; bordersPath: string; version: string }`. Throws `Error` if `MAPCODE_BORDERS_PATH` is missing/empty.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "mapcode-rest-service-ts",
  "version": "1.0.0",
  "description": "TypeScript port of the Mapcode REST API service.",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "node --env-file=.env --experimental-strip-types src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --env-file=.env dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "license": "Apache-2.0",
  "dependencies": {
    "fastify": "^5.2.0",
    "mapcode-ts": "^1.0.0",
    "flatgeobuf": "^3.36.0",
    "flatbush": "^4.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.3",
    "vitest": "^4.1.9"
  }
}
```

Note: `mapcode-ts` is a local sibling. Install it from the local path: after writing `package.json`, run `npm install ../mapcode-ts` (this rewrites the dependency to `file:../mapcode-ts`), then `npm install`. Verify the other deps resolve from npm.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Write `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules/
dist/
.env
*.log
.DS_Store
```

`.env.example`:
```
PORT=8080
MAPCODE_BORDERS_PATH=./data/borders.fgb
# VERSION is optional; defaults to package.json version.
```

- [ ] **Step 5: Write the failing test `test/config.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("parses port, bordersPath and version", () => {
    const cfg = loadConfig({ PORT: "9090", MAPCODE_BORDERS_PATH: "/x/b.fgb", VERSION: "1.0" });
    expect(cfg).toEqual({ port: 9090, bordersPath: "/x/b.fgb", version: "1.0" });
  });

  it("defaults port to 8080 and version to a non-empty string", () => {
    const cfg = loadConfig({ MAPCODE_BORDERS_PATH: "/x/b.fgb" });
    expect(cfg.port).toBe(8080);
    expect(cfg.version.length).toBeGreaterThan(0);
  });

  it("throws when MAPCODE_BORDERS_PATH is missing", () => {
    expect(() => loadConfig({})).toThrow(/MAPCODE_BORDERS_PATH/);
  });
});
```

- [ ] **Step 6: Run test, verify it fails**

Run: `npm test -- config`
Expected: FAIL (`loadConfig` not found).

- [ ] **Step 7: Implement `src/config.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  bordersPath: string;
  version: string;
}

function packageVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bordersPath = (env.MAPCODE_BORDERS_PATH ?? "").trim();
  if (!bordersPath) {
    throw new Error("MAPCODE_BORDERS_PATH is required (path to the borders.fgb file).");
  }
  const port = env.PORT ? Number.parseInt(env.PORT, 10) : 8080;
  const version = (env.VERSION ?? "").trim() || packageVersion();
  return { port, bordersPath, version };
}
```

- [ ] **Step 8: Write `src/index.ts` skeleton** (wired fully in Task 13; keep minimal but compiling)

```ts
import { loadConfig } from "./config.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  // Boundary service + server are wired in Task 13.
  console.log(`mapcode-rest-service-ts config loaded: port=${config.port}, version=${config.version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Run test + typecheck, verify pass**

Run: `npm test -- config && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffold, config loader and entrypoint skeleton"
```

---

## Task 2: Error hierarchy

**Files:**
- Create: `src/errors.ts`
- Test: `test/errors.test.ts`

**Interfaces:**
- Produces: `class ApiError extends Error { readonly httpStatus: number }` and subclasses `ApiInvalidFormatError(field, value, expected)` (400), `ApiNotFoundError(message)` (404), `ApiForbiddenError(message)` (403), `ApiConflictError(message)` (409), `ApiIntegerOutOfRangeError(field, value, min, max)` (400). All carry a human-readable `message`.

- [ ] **Step 1: Write failing test `test/errors.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  ApiError, ApiInvalidFormatError, ApiNotFoundError,
  ApiForbiddenError, ApiConflictError, ApiIntegerOutOfRangeError,
} from "../src/errors.ts";

describe("ApiError hierarchy", () => {
  it("maps each error to the correct HTTP status", () => {
    expect(new ApiInvalidFormatError("lat", "x", "[-90, 90]").httpStatus).toBe(400);
    expect(new ApiNotFoundError("nope").httpStatus).toBe(404);
    expect(new ApiForbiddenError("nope").httpStatus).toBe(403);
    expect(new ApiConflictError("nope").httpStatus).toBe(409);
    expect(new ApiIntegerOutOfRangeError("count", -1, 0, 10).httpStatus).toBe(400);
  });

  it("are instances of ApiError and Error", () => {
    const e = new ApiNotFoundError("x");
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toBeInstanceOf(Error);
  });

  it("ApiInvalidFormatError includes field/value/expected in its message", () => {
    const e = new ApiInvalidFormatError("lat", "x", "[-90, 90]");
    expect(e.message).toContain("lat");
    expect(e.message).toContain("[-90, 90]");
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npm test -- errors` — FAIL.

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
export class ApiError extends Error {
  readonly httpStatus: number;
  constructor(httpStatus: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
  }
}

export class ApiInvalidFormatError extends ApiError {
  constructor(field: string, value: unknown, expected: string) {
    super(400, `Invalid format for '${field}': '${String(value)}', expected: ${expected}`);
  }
}

export class ApiNotFoundError extends ApiError {
  constructor(message: string) { super(404, message); }
}

export class ApiForbiddenError extends ApiError {
  constructor(message: string) { super(403, message); }
}

export class ApiConflictError extends ApiError {
  constructor(message: string) { super(409, message); }
}

export class ApiIntegerOutOfRangeError extends ApiError {
  constructor(field: string, value: number, min: number, max: number) {
    super(400, `Value out of range for '${field}': ${value}, expected: [${min}, ${max}]`);
  }
}
```

- [ ] **Step 4: Run, verify pass.** Run: `npm test -- errors` — PASS.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: ApiError hierarchy with HTTP status mapping"`

---

## Task 3: Geo helpers (`mapToLon`, `distanceInMeters`)

**Files:**
- Create: `src/domain/geo.ts`
- Test: `test/geo.test.ts`

**Source of truth:** speedtools `Geo.mapToLon` and `Geo.distanceInMeters`. `mapToLon` wraps a longitude into `[-180, 180]`. `distanceInMeters` is a great-circle (haversine-equivalent) distance on a spherical Earth (radius 6378137 m). These feed `offsetMeters` which the Java rounds with `Math.round(d*1e6)/1e6`.

**Interfaces:**
- Produces: `mapToLon(lonDeg: number): number`, `distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number`.

- [ ] **Step 1: Write failing test `test/geo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mapToLon, distanceInMeters } from "../src/domain/geo.ts";

describe("mapToLon", () => {
  it("keeps in-range longitudes", () => {
    expect(mapToLon(0)).toBe(0);
    expect(mapToLon(179)).toBe(179);
    expect(mapToLon(-180)).toBeCloseTo(-180, 9);
    expect(mapToLon(180)).toBeCloseTo(180, 9);
  });
  it("wraps out-of-range longitudes into [-180, 180]", () => {
    expect(mapToLon(181)).toBeCloseTo(-179, 9);
    expect(mapToLon(-181)).toBeCloseTo(179, 9);
    expect(mapToLon(540)).toBeCloseTo(180, 9);
  });
});

describe("distanceInMeters", () => {
  it("is zero for identical points", () => {
    expect(distanceInMeters(52, 4, 52, 4)).toBeCloseTo(0, 6);
  });
  it("matches the offset magnitude used by the Java service (small distances)", () => {
    // Two points ~2.8 m apart near Amsterdam (sanity bound, not exact).
    const d = distanceInMeters(52.159853, 4.499790, 52.159828, 4.499790);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(3.5);
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npm test -- geo`.

- [ ] **Step 3: Implement `src/domain/geo.ts`**

```ts
const EARTH_RADIUS_M = 6378137.0;

/** Wrap a longitude in degrees into the range [-180, 180]. Mirrors speedtools Geo.mapToLon. */
export function mapToLon(lonDeg: number): number {
  let lon = lonDeg % 360;
  if (lon > 180) lon -= 360;
  else if (lon < -180) lon += 360;
  return lon;
}

/** Great-circle distance in meters on a spherical Earth. Mirrors speedtools Geo.distanceInMeters. */
export function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dPhi = (lat2 - lat1) * toRad;
  const dLam = (lon2 - lon1) * toRad;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}
```

- [ ] **Step 4: Run, verify pass.** Run: `npm test -- geo`.

- [ ] **Step 5: Commit.** `git commit -am "feat: geo helpers (mapToLon, distanceInMeters)"`

> **Note for Task 9 (codes) reviewer:** if the `offsetMeters` parity sweep in Task 13 shows systematic deviation from captured Java values, the haversine here must be reconciled with speedtools `Geo.distanceInMeters` exactly (read `com.tomtom.speedtools.geometry.Geo`). Flag rather than guess.

---

## Task 4: Serialization core (JSON + XML + formatDouble)

**Files:**
- Create: `src/serialization/types.ts` (schema types + `FieldType`)
- Create: `src/serialization/format.ts` (`formatDouble`)
- Create: `src/serialization/json.ts`
- Create: `src/serialization/xml.ts`
- Test: `test/serialization.test.ts`

**Concept:** A DTO instance is a plain object. Each DTO has a **schema** describing, per format, the ordered fields. A field is one of: `string`, `double`, `int`, `boolean`, `object` (nested schema), `objectList` (list with item element name + item schema), `stringList` (list of strings with item element name). Schemas live with the DTOs (Task 5); the serializers here are schema-driven and generic.

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type FieldType =
    | { kind: "string" } | { kind: "double" } | { kind: "int" } | { kind: "boolean" }
    | { kind: "object"; schema: Schema }
    | { kind: "objectList"; itemName: string; schema: Schema }
    | { kind: "stringList"; itemName: string };
  export interface Field { name: string; type: FieldType }
  export interface Schema { rootName: string; jsonOrder: Field[]; xmlOrder: Field[] }
  // format.ts
  export function formatDouble(n: number): string;
  // json.ts
  export function toJson(value: Record<string, unknown> | unknown[], schema: Schema): string;
  // xml.ts
  export function toXml(value: Record<string, unknown>, schema: Schema): string;
  ```
- `toJson`/`toXml` apply omission rules: JSON omits null/undefined, `""`, and empty arrays. XML omits null/undefined and `""` scalars, but emits empty list wrappers as `<name/>`.

- [ ] **Step 1: Write failing test `test/serialization.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatDouble } from "../src/serialization/format.ts";
import { toJson } from "../src/serialization/json.ts";
import { toXml } from "../src/serialization/xml.ts";
import type { Schema } from "../src/serialization/types.ts";

const versionSchema: Schema = {
  rootName: "version",
  jsonOrder: [{ name: "version", type: { kind: "string" } }],
  xmlOrder: [{ name: "version", type: { kind: "string" } }],
};

describe("formatDouble (Java Double.toString parity)", () => {
  it("renders integer-valued doubles with a trailing .0", () => {
    expect(formatDouble(5)).toBe("5.0");
    expect(formatDouble(-90)).toBe("-90.0");
  });
  it("renders fractional doubles in shortest round-trip form", () => {
    expect(formatDouble(2.843693)).toBe("2.843693");
    expect(formatDouble(52.376514)).toBe("52.376514");
  });
});

describe("toJson", () => {
  it("emits version", () => {
    expect(toJson({ version: "1.0" }, versionSchema)).toBe('{"version":"1.0"}');
  });
});

describe("toXml", () => {
  it("emits version with the fixed prologue", () => {
    expect(toXml({ version: "1.0" }, versionSchema)).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><version><version>1.0</version></version>',
    );
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npm test -- serialization`.

- [ ] **Step 3: Implement `src/serialization/types.ts`** — exactly the interface block above.

- [ ] **Step 4: Implement `src/serialization/format.ts`**

```ts
/**
 * Format a number the way Java's Double.toString / Jackson would: integer-valued
 * doubles keep a trailing ".0"; other values use JS shortest round-trip (which
 * matches Java for the value ranges this service emits). Tuned by the Task 13 sweep.
 */
export function formatDouble(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Cannot format non-finite double: ${n}`);
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}
```

- [ ] **Step 5: Implement `src/serialization/json.ts`**

```ts
import type { Field, Schema } from "./types.ts";
import { formatDouble } from "./format.ts";

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function fieldJson(value: unknown, field: Field): string | null {
  if (isEmpty(value)) return null;
  switch (field.type.kind) {
    case "string": return JSON.stringify(value);
    case "boolean": return value ? "true" : "false";
    case "int": return String(value);
    case "double": return formatDouble(value as number);
    case "object": return objectJson(value as Record<string, unknown>, field.type.schema);
    case "stringList":
      return `[${(value as string[]).map((s) => JSON.stringify(s)).join(",")}]`;
    case "objectList": {
      const schema = field.type.schema;
      return `[${(value as Record<string, unknown>[]).map((o) => objectJson(o, schema)).join(",")}]`;
    }
  }
}

function objectJson(value: Record<string, unknown>, schema: Schema): string {
  const parts: string[] = [];
  for (const field of schema.jsonOrder) {
    const rendered = fieldJson(value[field.name], field);
    if (rendered !== null) parts.push(`${JSON.stringify(field.name)}:${rendered}`);
  }
  return `{${parts.join(",")}}`;
}

/** Serialize a DTO object, or a bare top-level array (MapcodeListDTO), to JSON. */
export function toJson(value: Record<string, unknown> | unknown[], schema: Schema): string {
  if (Array.isArray(value)) {
    // Bare list DTO: schema.jsonOrder[0] describes the item objectList.
    const field = schema.jsonOrder[0];
    if (field?.type.kind !== "objectList") throw new Error("Array schema must be an objectList");
    const itemSchema = field.type.schema;
    return `[${value.map((o) => objectJson(o as Record<string, unknown>, itemSchema)).join(",")}]`;
  }
  return objectJson(value, schema);
}
```

- [ ] **Step 6: Implement `src/serialization/xml.ts`**

```ts
import type { Field, Schema } from "./types.ts";
import { formatDouble } from "./format.ts";

const PROLOGUE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function fieldXml(value: unknown, field: Field): string {
  const name = field.name;
  // Empty/absent list → self-closing wrapper (JAXB renders <name/>).
  if ((field.type.kind === "stringList" || field.type.kind === "objectList")) {
    const arr = (value as unknown[] | null | undefined) ?? [];
    if (arr.length === 0) return `<${name}/>`;
  }
  if (isNullish(value)) return "";
  switch (field.type.kind) {
    case "string": return `<${name}>${escapeXml(value as string)}</${name}>`;
    case "boolean": return `<${name}>${value ? "true" : "false"}</${name}>`;
    case "int": return `<${name}>${String(value)}</${name}>`;
    case "double": return `<${name}>${formatDouble(value as number)}</${name}>`;
    case "object": return `<${name}>${objectXmlBody(value as Record<string, unknown>, field.type.schema)}</${name}>`;
    case "stringList": {
      const items = (value as string[]).map((s) => `<${field.type.itemName}>${escapeXml(s)}</${field.type.itemName}>`).join("");
      return `<${name}>${items}</${name}>`;
    }
    case "objectList": {
      const t = field.type;
      const items = (value as Record<string, unknown>[])
        .map((o) => `<${t.itemName}>${objectXmlBody(o, t.schema)}</${t.itemName}>`).join("");
      return `<${name}>${items}</${name}>`;
    }
  }
}

function objectXmlBody(value: Record<string, unknown>, schema: Schema): string {
  return schema.xmlOrder.map((f) => fieldXml(value[f.name], f)).join("");
}

/** Serialize a DTO object to XML with the fixed prologue and root element. */
export function toXml(value: Record<string, unknown>, schema: Schema): string {
  return `${PROLOGUE}<${schema.rootName}>${objectXmlBody(value, schema)}</${schema.rootName}>`;
}
```

- [ ] **Step 7: Run, verify pass.** Run: `npm test -- serialization`.

- [ ] **Step 8: Commit.** `git commit -am "feat: schema-driven JSON/XML serializers + formatDouble"`

---

## Task 5: DTO schemas and builders

**Files:**
- Create: `src/dto/index.ts` (all DTO schemas + builder functions)
- Test: `test/dto.test.ts`

**Source of truth:** Java DTO classes in `../mapcode-rest-service/service/src/main/java/com/mapcode/services/dto/` and the exact expected strings in `ApiTerritoriesTest.java`, `ApiAlphabetsTest.java`, `ApiCodesTest.java`, `ApiOthersTest.java`, plus `dto/TerritoryCandidateDTOTest.java`, `dto/TerritoryCandidateListDTOTest.java`, `ApiDTOTest.java`.

**Builders** return plain objects whose keys are present only when the field has a value (builders set fields to `undefined`/omit when absent; serializer omission also applies). Each DTO exports `{ schema, build... }`.

**Field orders (derived from test bytes — JSON and XML differ for TerritoryDTO):**

- **VersionDTO** root `version`: `[version:string]` (both formats).
- **PointDTO** root `point`: `[latDeg:double, lonDeg:double]`.
- **RectangleDTO** root `rectangle`: `[southWest:object(point), northEast:object(point), center:object(point)]`. (XML element names `southWest`/`northEast`/`center`; nested point fields `latDeg`/`lonDeg`.)
- **MapcodeDTO** root `mapcode`: `[mapcode:string, mapcodeInAlphabet:string, territory:string, territoryInAlphabet:string, offsetMeters:double, rectangle:object(rectangle)]` (both formats, declaration order).
- **MapcodeListDTO** root `mapcodes` (bare JSON array; XML wrapper `mapcodes` + item `mapcode`): single objectList of MapcodeDTO.
- **MapcodesDTO** root `mapcodes`: `[local:object(mapcode), international:object(mapcode), mapcodes:objectList(item "mapcode", MapcodeDTO), territories:objectList(item "territory", TerritoryCandidateDTO)]` (both formats).
- **TerritoryCandidateDTO** root `territory` (when nested under territories) / `territoryCandidate` (standalone): `[alphaCode:string, parentAlphaCode:string]`.
- **TerritoryCandidatesDTO** root `territories`: `[territories:objectList(item "territory", TerritoryCandidateDTO)]` — JSON `{"territories":[...]}`; XML `<territories><territory>...`. (Confirm bare-vs-wrapped shape against `ApiCodesTerritoriesTest.java` in Task 10.)
- **AlphabetDTO** root `alphabet`: `[name:string]`.
- **TerritoryDTO** root `territory`:
  - **jsonOrder:** `[aliases:stringList, fullNameAliases:stringList, alphaCode:string, alphaCodeMinimalUnambiguous:string, alphaCodeMinimal:string, fullName:string, parentTerritory:string, alphabets:objectList(item "alphabet", AlphabetDTO)]`
  - **xmlOrder:** `[alphaCode, alphaCodeMinimalUnambiguous, alphaCodeMinimal, fullName, parentTerritory, aliases (item "alias"), fullNameAliases (item "fullNameAlias"), alphabets (item "alphabet")]`
  - Verify byte-for-byte against `ApiTerritoriesTest` expected strings (JSON puts non-empty `aliases`/`fullNameAliases` first; XML uses declaration order and renders `<aliases/>` when empty).
- **TerritoriesDTO** root `territories`: JSON `{total:int, territories:objectList(item "territory", TerritoryDTO)}`; xmlOrder `[total:int, territories:objectList(item "territory", TerritoryDTO)]`.
- **AlphabetsDTO** root `alphabets`: JSON `{total:int, alphabets:objectList(item "alphabet", AlphabetDTO)}`; xmlOrder `[total:int, alphabets:objectList(item "alphabet", AlphabetDTO)]`.

- [ ] **Step 1: Write failing tests `test/dto.test.ts`** — assert exact JSON & XML for, at minimum: VersionDTO, MapcodeDTO (with/without optional fields), MapcodesDTO (matching `ApiCodesTest.checkCodesJson`/`checkCodesXml` bytes), TerritoryDTO NLD + IN-PY + GBR (copy expected strings from `ApiTerritoriesTest`), TerritoriesDTO offset/count (copy `checkTerritories2Json`/`checkTerritories2Xml`), AlphabetDTO, TerritoryCandidateDTO. Use `toJson`/`toXml` with each schema.

Example (copy more from the Java tests):
```ts
import { describe, it, expect } from "vitest";
import { toJson, toXml } from "../src/serialization/json.ts"; // and xml.ts
import * as dto from "../src/dto/index.ts";

it("MapcodesDTO JSON matches ApiCodesTest.checkCodesJson", () => {
  const value = dto.buildMapcodes({
    local: { mapcode: "JL0.KP", territory: "LUX" },
    international: { mapcode: "VJ0L6.9PNQ" },
    mapcodes: [
      { mapcode: "JL0.KP", territory: "LUX" }, { mapcode: "R8RN.07Z", territory: "LUX" },
      { mapcode: "SQB.NR3", territory: "BEL" }, { mapcode: "R8RN.07Z", territory: "BEL" },
      { mapcode: "0L46.LG9", territory: "DEU" }, { mapcode: "R8RN.07Z", territory: "FRA" },
      { mapcode: "VJ0L6.9PNQ" },
    ],
  });
  expect(toJson(value, dto.mapcodesSchema)).toBe(
    '{"local":{"mapcode":"JL0.KP","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ"},"mapcodes":[{"mapcode":"JL0.KP","territory":"LUX"},{"mapcode":"R8RN.07Z","territory":"LUX"},{"mapcode":"SQB.NR3","territory":"BEL"},{"mapcode":"R8RN.07Z","territory":"BEL"},{"mapcode":"0L46.LG9","territory":"DEU"},{"mapcode":"R8RN.07Z","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ"}]}',
  );
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npm test -- dto`.

- [ ] **Step 3: Implement `src/dto/index.ts`** — define every `Schema` above and `build*` helpers that produce plain objects (omitting absent optional fields). Builders take typed inputs; e.g.:
```ts
export interface MapcodeFields {
  mapcode: string; mapcodeInAlphabet?: string; territory?: string;
  territoryInAlphabet?: string; offsetMeters?: number; rectangle?: RectangleFields;
}
export function buildMapcode(f: MapcodeFields): Record<string, unknown> { /* return f as-is, dropping undefined */ }
```
Keep it data-driven and DRY: one `compact(obj)` helper that strips `undefined`.

- [ ] **Step 4: Iterate until all DTO byte tests pass.** Run: `npm test -- dto`. Adjust `jsonOrder`/`xmlOrder` per DTO until exact-match. **Do not change the serializer; only the schemas/builders.**

- [ ] **Step 5: Commit.** `git commit -am "feat: DTO schemas and builders with byte-exact serialization tests"`

---

## Task 6: MapcodeService (mapcode-ts wrapper)

**Files:**
- Create: `src/domain/mapcode-service.ts`
- Test: `test/mapcode-service.test.ts`

**Source of truth:** `MapcodeResourceImpl.resolveTerritory`, `getTerritoryAlias` (already in the spec §3), and `mapcode-ts` API (signatures in the spec). `mapcode-ts` throws `UnknownMapcodeError`, `UnknownTerritoryError`, `IllegalArgumentError`, etc. (named exports).

**Interfaces:**
- Produces a `MapcodeService` object (plain functions or a class) exposing:
  ```ts
  resolveTerritory(territory: string, parent: string | null): Territory   // throws on unknown
  resolveAlphabet(name: string): Alphabet                                  // throws on unknown
  resolveCountry(code: string): string                                     // validates ISO2 then ISO3; returns the code; throws if neither
  encodeAll(lat: number, lon: number, territory: Territory | null): Mapcode[]
  encodeAllForCountry(lat: number, lon: number, country: string): Mapcode[]
  encodeShortest(lat: number, lon: number, territory: Territory): Mapcode | null  // null on UnknownMapcodeError
  encodeInternational(lat: number, lon: number): Mapcode
  decode(code: string, context: Territory | null): Point                   // throws UnknownMapcodeError
  decodeToRectangle(code: string, context: Territory | null): Rectangle
  isValidMapcodeFormat(code: string): boolean
  listTerritories(): Territory[]                                            // Territory.values()
  listAlphabets(): Alphabet[]                                              // Alphabet.values()
  ```
- Re-export `Territory`, `Alphabet`, `Mapcode`, `Point`, `Rectangle` types from `mapcode-ts` for handlers.

`resolveTerritory` must port the Java algorithm exactly: HTML-unescape is handled by the route layer (Task 8) before calling; here, uppercase, `-`↔`_` normalization, optional parent disambiguation via `Territory.fromString(code, parent)`, alias fallback (`getTerritoryAlias`). Provide an `htmlUnescape` util in this module (handles at least `&amp; &lt; &gt; &quot; &#39; &#NN;`) since Java uses `StringEscapeUtils.unescapeHtml4` on query params.

- [ ] **Step 1: Write failing tests** covering: `resolveTerritory("nld", null) → Territory.NLD`; `resolveTerritory("in", null) → US-IN` (matches `ApiTerritoriesTest.checkTerritoryStateJson`); `resolveTerritory("in", "ru") → RU-IN`; unknown throws; `resolveAlphabet("greek") → Alphabet.GREEK`; `resolveCountry("US")`/`("USA")` ok, `("xx")` throws; `encodeInternational(52.376514,4.908542).getCode()` non-empty; `decode("NLD 49.4V").getLatDeg()` ≈ 52.376514.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `src/domain/mapcode-service.ts`** wrapping `mapcode-ts`, porting `resolveTerritory`/`getTerritoryAlias` from `MapcodeResourceImpl`. Catch `mapcode-ts` errors and surface as `null` (encodeShortest) or rethrow as plain `Error`/let handler convert. Do **not** import Fastify or DTOs here.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat: MapcodeService wrapping mapcode-ts (encode/decode/resolve)"`

---

## Task 7: BoundaryService (in-memory typed-array polygon store)

**Files:**
- Create: `src/domain/boundary-service.ts`
- Create test fixture: copy `../mapcode-rest-service/service/src/test/resources/borders-test.fgb` → `test/resources/borders-test.fgb`
- Test: `test/boundary-service.test.ts`

**Source of truth:** Java `BoundaryService.java` (spec §7) and `BoundaryServiceTest.java`. Property names in the FGB: `alphaCode` (string, required), `parentAlphaCode` (string, nullable; empty→null), `adminLevel` (int, required), `area` (double, required). Ranking: `adminLevel` **descending**, then `area` **ascending**.

**Interfaces:**
- Produces:
  ```ts
  export interface TerritoryMatch { alphaCode: string; parentAlphaCode: string | null; adminLevel: number; area: number }
  export class BoundaryService {
    static async load(bordersPath: string): Promise<BoundaryService>;  // parse FGB → typed arrays + flatbush
    lookup(latDeg: number, lonDeg: number): TerritoryMatch[];          // ranked
  }
  ```

**Implementation notes:**
- Use `flatgeobuf` to read features from the file (`import { geojson } from "flatgeobuf"` or the generic deserialize that yields geometry + properties). Iterate once; for each feature read the four props and the geometry rings.
- Build flat arrays: `coords: Float64Array` (lon,lat interleaved), `ringOffsets: Uint32Array` (start vertex index of each ring; sentinel end), `polyRingStart: Uint32Array` (first ring index of each polygon), `featurePolyStart: Uint32Array` (first polygon index of each feature). Plus per-feature `alphaCode[]`, `parentAlphaCode[]`, `adminLevel: Uint8Array`, `area: Float64Array`, bbox `minX/minY/maxX/maxY: Float64Array`.
- Use the **first ring of each polygon as outer, subsequent rings as holes** (FGB/GeoJSON polygon convention).
- Build `flatbush` over feature bboxes (`new Flatbush(n)`, `add(minX,minY,maxX,maxY)` per feature, `finish()`).
- `lookup`: `index.search(lon, lat, lon, lat)` → candidate feature indices → ray-cast point-in-polygon over the flat coords honoring holes → collect `TerritoryMatch` → sort by `adminLevel` desc then `area` asc → return.
- Provide `pointInRing(coords, start, end, lon, lat): boolean` (standard even-odd ray casting) and `pointInPolygon` (in outer ring AND not in any hole).
- Loading is `async` (flatgeobuf reads a stream); `lookup` is sync.

- [ ] **Step 1: Copy the fixture.** `mkdir -p test/resources && cp ../mapcode-rest-service/service/src/test/resources/borders-test.fgb test/resources/borders-test.fgb`

- [ ] **Step 2: Write failing tests `test/boundary-service.test.ts`** — port assertions from `BoundaryServiceTest.java` (read it). At minimum: `load` succeeds; a point known to be in NLD returns a match with `alphaCode === "NLD"`; a sea point returns `[]`; ranking puts higher `adminLevel` first. Add unit tests for `pointInRing` with a hand-built square + hole.

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement `src/domain/boundary-service.ts`** per notes. Discard all `flatgeobuf` objects after transcoding (keep only typed arrays + metadata).

- [ ] **Step 5: Run, verify pass.** Check no per-vertex object allocation remains (review).

- [ ] **Step 6: Commit.** `git commit -am "feat: in-memory typed-array BoundaryService (FGB load + PIP + ranking)"`

---

## Task 8: Server factory, content negotiation, error handler, root routes

**Files:**
- Create: `src/serialization/respond.ts` (negotiation + send helper)
- Create: `src/routes/negotiation.ts`
- Create: `src/resources/root.ts`
- Create: `src/routes/root.routes.ts`
- Create: `src/server.ts`
- Test: `test/api-others.test.ts` (port of `ApiOthersTest.java`)

**Source of truth:** `RootResourceImpl.java` (help HTML text, version, status self-check — in the spec §3 and the file). `ApiOthersTest.java` (exact expected bytes, already captured: version JSON `{"version":"1.0"}`, version XML `<?xml ...?><version><version>1.0</version></version>`, help starts with `<html>`).

**Negotiation rules:**
- Output format = `xml` if path starts with `/mapcode/xml/`, `json` if `/mapcode/json/`, else from `Accept` header (`application/xml` → xml; else json default).
- The `/xml/` and `/json/` prefixes are stripped to resolve the underlying route. Register each `/mapcode/<x>` route also under `/mapcode/xml/<x>` and `/mapcode/json/<x>`.
- `respond(reply, format, dtoValue, schema)`: set `content-type` (`application/json` or `application/xml`) and send `toJson`/`toXml`. Help page is `text/html`.

**Interfaces:**
- Produces:
  ```ts
  export interface ServerDeps { mapcodeService: MapcodeService; boundaryService: BoundaryService; version: string }
  export function buildServer(deps: ServerDeps): FastifyInstance;  // registers all routes + error handler
  export type OutputFormat = "json" | "xml";
  export function resolveFormat(rawUrl: string, acceptHeader: string | undefined): { format: OutputFormat; pathPrefixStripped: boolean };
  ```
- Error handler: if error is `ApiError`, respond with its `httpStatus` and an error body in the negotiated format — JSON `{"message":<msg>,"status":<code>}`, XML `<?xml...?><exception><message>..</message><status>..</status></exception>`. Else 500.
- Non-GET/HEAD → 405. Unknown route → 404.

- [ ] **Step 1: Write failing test `test/api-others.test.ts`** — use `buildServer` with a stub/real `MapcodeService` + `BoundaryService.load(test fixture)` and `version:"1.0"`, then `app.inject({ method: "GET", url: "/mapcode/version" })` etc. Copy every assertion from `ApiOthersTest.java`: version JSON/XML, `/xml/version`, `/json/version`, `/status` + `/xml/status` + `/json/status` → 200, `/mapcode` help starts with `<html>`. Build helper `makeApp()` in the test.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `negotiation.ts` (`resolveFormat`), `respond.ts`, `resources/root.ts` (port `HELP_TEXT` and `getHelpHTML` verbatim from `RootResourceImpl`; `getVersion` → VersionDTO; `getStatus` → call codes+coords handlers like Java's self-check, return 200/500), `root.routes.ts`, and `server.ts` (`buildServer`: create Fastify, register a `notFound` + `errorHandler`, register root routes for `/mapcode`, `/mapcode/version`, `/mapcode/status` and their `/xml//json/` variants). Register a Fastify hook or wildcard to enforce 405 on non-GET/HEAD.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat: server factory, negotiation, error handler, root routes (version/status/help)"`

---

## Task 9: Coords endpoint (mapcode → lat/lon)

**Files:**
- Create: `src/resources/coords.ts`
- Create: `src/routes/coords.routes.ts` (register in `server.ts`)
- Modify: `src/server.ts` (register coords routes)
- Test: `test/api-coords.test.ts` (port of `ApiCoordsTest.java`)

**Source of truth:** `MapcodeResourceImpl.convertMapcodeToLatLon` (spec §3 / the file, lines 492–587) and `ApiCoordsTest.java`.

**Handler logic (`handleCoords`)**: params `{ code, context?, territory?, include, format }`.
- If `territory` param present → `ApiInvalidFormatError("territory", value, "null")` (400). (Route maps both `/coords/{code}` and the bare `/coords` → 403 via `ApiForbiddenError`.)
- Parse `include` (comma, uppercase); only `RECTANGLE` is meaningful; unknown token → `ApiInvalidFormatError`.
- Resolve `context` via `mapcodeService.resolveTerritory(htmlUnescape(context), null)`; invalid → 400.
- `isValidMapcodeFormat(code)` false → `ApiInvalidFormatError("mapcode", code, "[XXX] XX.XX[-XX]")`.
- If rectangle: `decodeToRectangle` → RectangleDTO; else `decode` → PointDTO. `UnknownMapcodeError` → `ApiNotFoundError`.
- Routes: `/mapcode/coords/{code}` (+ `/xml//json/`), plus `/mapcode/coords` → 403. The `{code}` may contain spaces (URL-encoded) and dots — register as a single path param and `decodeURIComponent` it.

- [ ] **Step 1: Write failing test `test/api-coords.test.ts`** — port all of `ApiCoordsTest.java` (read it): decode JSON/XML, `context`, `include=rectangle`, invalid format → 400, unknown → 404, `territory` present → 400, bare `/coords` → 403. Copy exact expected strings.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `coords.ts` + `coords.routes.ts`; register in `server.ts`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat: /coords endpoint (decode) with parity tests"`

---

## Task 10: Codes endpoint (lat/lon → mapcodes) incl. boundary re-ranking + /territories sub-route

**Files:**
- Create: `src/resources/codes.ts`
- Create: `src/routes/codes.routes.ts`
- Modify: `src/server.ts`
- Test: `test/api-codes.test.ts` (port of `ApiCodesTest.java`), `test/api-codes-territories.test.ts` (port of `ApiCodesTerritoriesTest.java`)

**Source of truth:** `MapcodeResourceImpl.convertLatLonToMapcode` (3 overloads) + `getTerritoriesForLatLon` + `createMapcodeDTO` + `offsetFromLatLonInMeters` (spec §3 and the file lines 98–490, 789–828). `ApiCodesTest.java` and `ApiCodesTerritoriesTest.java`.

**Handler logic (`handleCodes`)**: params `{ latStr, lonStr, type?, precision, territory?, country?, context?, alphabet?, include, format }`.
- `context` present → `ApiInvalidFormatError("context", value, "null")`.
- Parse lat (`[-90,90]` else 400), lon (`mapToLon`), precision (`[0,8]` else 400).
- Both `territory` & `country` → `ApiConflictError`.
- Resolve territory (htmlUnescape) or validate country (ISO2 then ISO3) → 400 on failure.
- Resolve alphabet if given → 400 on failure.
- Parse `type` (`MAPCODES|LOCAL|INTERNATIONAL`, case-insensitive) → 400 on bad value.
- Parse `include` flags (`OFFSET,TERRITORY,ALPHABET,RECTANGLE`) → 400 on bad token.
- Compute: `encodeAll` (country or territory or null), decode each to rectangle; `encodeInternational`; compute `local` per Java logic.
- Build `createMapcodeDTO` exactly (spec §3 bullet) using `formatDouble`-compatible numbers; `offsetMeters = Math.round(distanceInMeters(...) * 1e6) / 1e6`.
- **Default (no type)**: call `boundaryService.lookup` → territory candidates; if non-empty, re-sort `mapcodes` by territory rank and override `local`; build `MapcodesDTO` with `territories` (null when empty so the field is omitted). With type: `LOCAL` (404 if none), `INTERNATIONAL`, `MAPCODES` (bare list).
- `/codes/{lat},{lon}/territories` → `getTerritoriesForLatLon`: validate lat/lon, `boundaryService.lookup`, build `TerritoryCandidatesDTO`.
- Routes: `/mapcode/codes` → 403; `/mapcode/codes/{lat},{lon}`; `/mapcode/codes/{lat},{lon}/{type}` where `type ∈ {mapcodes,local,international}`; `/mapcode/codes/{lat},{lon}/territories`. Note `{lat},{lon}` is **one path segment** containing a comma — register the param as the whole `lat,lon` token and split on the **first** comma; reject (404) when the segment has no comma or empty parts per `ApiCodesTest.checkIncorrectParameters` (e.g. `/codes/1` → 404, `/codes/1,` → 404, `/codes/x,1` → 400). All variants also under `/xml//json/`.

- [ ] **Step 1: Write failing tests** — port **all** of `ApiCodesTest.java` (captured: `checkCodesJson`, `checkCodesXml`, precision 0/1/8 JSON+XML, `mapcodes`/`local`/`international` filters, `checkCodesInclude*` with `territories:[{alphaCode:NLD}]`, `checkCodesCheckLatLon`, `checkIncorrectParameters`, `checkCodesNoLatLon` → 403, `checkCodesUseOfContext` → 400, `checkCodesLocalDoesNotExist` → 404) and all of `ApiCodesTerritoriesTest.java`. Use the test fixture borders so the `territories`/re-ranking match.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `codes.ts` + `codes.routes.ts`; register in `server.ts`.

- [ ] **Step 4: Run, verify pass.** Iterate on `createMapcodeDTO` field gating and number formatting until exact-match.

- [ ] **Step 5: Commit.** `git commit -am "feat: /codes endpoint (encode) with boundary re-ranking and parity tests"`

---

## Task 11: Territories endpoints

**Files:**
- Create: `src/resources/territories.ts`, `src/routes/territories.routes.ts`
- Modify: `src/server.ts`
- Test: `test/api-territories.test.ts` (port of `ApiTerritoriesTest.java`)

**Source of truth:** `MapcodeResourceImpl.getTerritories` / `getTerritory` (spec §3) and `ApiTerritoriesTest.java` (captured exact strings, incl. `total:533`, offset/count paging with negative offset, `context` disambiguation, `count=-1` → 400, unknown territory → 400).

**Handler logic:**
- `getTerritories(offset=0, count=1000)`: `count < 0` → `ApiIntegerOutOfRangeError`. Build the full `TerritoryDTO[]` from `Territory.values()` once (cache as a module-level constant). Paging: `fromIndex = offset<0 ? max(0, n+offset) : min(n, offset)`; `toIndex = min(n, fromIndex+count)`. Return `TerritoriesDTO(total=n, slice)`.
- `getTerritory(territory, context?)`: `resolveTerritory(territory, htmlUnescape(context))`; invalid → 400. Build `TerritoryDTO` from `territory.toString()`, `toAlphaCode(MINIMAL_UNAMBIGUOUS)`, `toAlphaCode(MINIMAL)`, `getFullName()`, parent `toString()|null`, `getAliases()`, `getFullNameAliases()`, `getAlphabets()` (→ AlphabetDTO list).
- Routes `/mapcode/territories`, `/mapcode/territories/{territory}` (+ `/xml//json/`).

- [ ] **Step 1: Write failing test** — port all of `ApiTerritoriesTest.java`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** The `TerritoryDTO` builder must reproduce the JSON-vs-XML order from Task 5.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: /territories endpoints with parity tests"`

---

## Task 12: Alphabets endpoints

**Files:**
- Create: `src/resources/alphabets.ts`, `src/routes/alphabets.routes.ts`
- Modify: `src/server.ts`
- Test: `test/api-alphabets.test.ts` (port of `ApiAlphabetsTest.java`)

**Source of truth:** `MapcodeResourceImpl.getAlphabets` / `getAlphabet` and `ApiAlphabetsTest.java` (read it for exact expected strings + total count). Logic mirrors Task 11 but for `Alphabet.values()` and `AlphabetDTO`. `getAlphabet(name)`: `resolveAlphabet(name)` → `AlphabetDTO`; invalid → 400.

- [ ] **Step 1: Write failing test** — port all of `ApiAlphabetsTest.java`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: /alphabets endpoints with parity tests"`

---

## Task 13: Wire entrypoint, parity sweep, remaining unit ports, README, build, final verification

**Files:**
- Modify: `src/index.ts` (full wiring)
- Create: `test/parity-sweep.test.ts`
- Create: `test/dto-unit.test.ts` (ports of `ApiDTOTest.java`, `dto/TerritoryCandidateDTOTest.java`, `dto/TerritoryCandidateListDTOTest.java` if not already covered in Task 5)
- Create: `README.md`
- Modify: `package.json` (verify scripts), add `data/` note

**Source of truth:** any Java test not yet ported (`ApiDTOTest.java`, the two DTO unit tests). Confirm full coverage against the Java test inventory in the spec §10.

- [ ] **Step 1: Wire `src/index.ts`**

```ts
import { loadConfig } from "./config.ts";
import { BoundaryService } from "./domain/boundary-service.ts";
import { createMapcodeService } from "./domain/mapcode-service.ts";
import { buildServer } from "./server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const boundaryService = await BoundaryService.load(config.bordersPath);
  const mapcodeService = createMapcodeService();
  const app = buildServer({ mapcodeService, boundaryService, version: config.version });
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Port any remaining Java unit tests** (`ApiDTOTest`, `TerritoryCandidateDTOTest`, `TerritoryCandidateListDTOTest`) into `test/dto-unit.test.ts`. Run: `npm test -- dto-unit`.

- [ ] **Step 3: Write the parity sweep `test/parity-sweep.test.ts`** — build the app with the test fixture and assert exact JSON+XML for a grid of inputs: latitudes `[-90,-45,0,52.376514,90]` × longitudes `[-180,-1,4.908542,180,181]` × precisions `[0,2,8]` × `include` combinations × a couple of alphabets, against values computed independently via direct `mapcode-ts` calls (the sweep asserts internal consistency: the endpoint's `mapcode`/`territory`/`offsetMeters` equal what `mapcode-ts` + `formatDouble` produce). Where Java reference strings exist, assert those exact bytes. If `formatDouble` mismatches surface, fix `formatDouble` (only) and re-run.

- [ ] **Step 4: Run the full suite + typecheck.** Run: `npm test && npm run typecheck`. Expected: ALL PASS. If the boundary-dependent tests need the production borders file, document the data setup; tests themselves use `test/resources/borders-test.fgb`.

- [ ] **Step 5: Write `README.md`** — install (`npm install`, including the local `mapcode-ts`), the `borders.fgb` requirement and `MAPCODE_BORDERS_PATH`, `.env` usage, `npm run dev` / `build` / `start`, the full endpoint list (copy the API table from the spec), and a note that the borders file is obtained from the Java repo's `tools/` pipeline (out of scope here).

- [ ] **Step 6: Build check.** Run: `npm run build`. Expected: clean compile to `dist/`.

- [ ] **Step 7: Smoke run** (optional, needs a borders file): `MAPCODE_BORDERS_PATH=../mapcode-rest-service/resources/src/main/resources/borders.fgb node --env-file=.env dist/index.js` then `curl localhost:8080/mapcode/version` → `{"version":"1.0.0"}` (or configured version). Stop the server.

- [ ] **Step 8: Final commit.** `git commit -am "feat: wire entrypoint, parity sweep, README, build; complete superset suite"`

---

## Self-Review Notes (coverage map)

- **Spec §3 endpoints** → Tasks 8 (root), 9 (coords), 10 (codes + /territories), 11 (territories), 12 (alphabets). ✓
- **Spec §6 serialization parity** → Tasks 4 (engine) + 5 (schemas) + every endpoint's ported tests + Task 13 sweep. ✓
- **Spec §7 boundary** → Task 7; integration in Task 10. ✓
- **Spec §8 config/runtime** → Tasks 1 + 13. ✓
- **Spec §9 error handling** → Task 2 (types) + Task 8 (handler/405/404); per-endpoint error tests in 9–12. ✓
- **Spec §10 testing (superset)** → every Java test class ported (8–12, 13); additions: parity sweep, boundary PIP edge cases (Task 7), JSON+XML for all endpoints, config-failure (Task 1), 405/404 (Task 8). ✓
- **Type consistency:** `MapcodeService`, `BoundaryService`, `TerritoryMatch`, `Schema`/`Field`/`FieldType`, `buildServer`/`ServerDeps`, `resolveFormat`, `toJson`/`toXml`, `formatDouble` names are consistent across tasks. ✓
- **No placeholders:** infrastructure tasks carry full code; mechanical/port tasks reference exact Java source + test paths whose verbatim expected strings are the implementation target (the deliberate, correct strategy for a byte-parity port). ✓
