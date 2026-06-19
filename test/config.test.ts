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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { loadConfig, loadEnvFileIfExists } from "../src/config.ts";

const tempDirs: string[] = [];

function writeEnvFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mapcode-env-"));
  tempDirs.push(dir);
  const envPath = join(dir, ".env");
  writeFileSync(envPath, contents);
  return envPath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

  it("rejects malformed PORT values", () => {
    expect(() => loadConfig({ PORT: "abc", MAPCODE_BORDERS_PATH: "/x/b.fgb" })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: "123abc", MAPCODE_BORDERS_PATH: "/x/b.fgb" })).toThrow(/PORT/);
  });

  it("rejects PORT values outside the listenable range", () => {
    expect(() => loadConfig({ PORT: "-1", MAPCODE_BORDERS_PATH: "/x/b.fgb" })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: "65536", MAPCODE_BORDERS_PATH: "/x/b.fgb" })).toThrow(/PORT/);
  });
});

describe("loadEnvFileIfExists", () => {
  it("loads values from an existing .env file", () => {
    const env: NodeJS.ProcessEnv = {};
    const envPath = writeEnvFile("MAPCODE_BORDERS_PATH=/from-file\nPORT=8081\n");

    expect(loadEnvFileIfExists(envPath, env)).toBe(true);

    expect(env.MAPCODE_BORDERS_PATH).toBe("/from-file");
    expect(env.PORT).toBe("8081");
  });

  it("keeps deployment-provided variables ahead of .env file values", () => {
    const env: NodeJS.ProcessEnv = { MAPCODE_BORDERS_PATH: "/from-deployment", PORT: "0" };
    const envPath = writeEnvFile("MAPCODE_BORDERS_PATH=/from-file\nPORT=8081\n");

    expect(loadEnvFileIfExists(envPath, env)).toBe(true);

    expect(env.MAPCODE_BORDERS_PATH).toBe("/from-deployment");
    expect(env.PORT).toBe("0");
  });

  it("ignores a missing .env file", () => {
    const env: NodeJS.ProcessEnv = {};
    const dir = mkdtempSync(join(tmpdir(), "mapcode-env-"));
    tempDirs.push(dir);

    expect(loadEnvFileIfExists(join(dir, ".env"), env)).toBe(false);
    expect(env).toEqual({});
  });
});
