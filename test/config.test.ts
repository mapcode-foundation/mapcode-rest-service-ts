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
  it("parses port and version", () => {
    const cfg = loadConfig({ PORT: "9090", VERSION: "1.0" });
    expect(cfg).toEqual({
      port: 9090,
      version: "1.0",
      dbUrl: null,
      replayToken: null,
      dbCaCert: null,
    });
  });

  it("defaults port to 8080 and version to a non-empty string", () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(8080);
    expect(cfg.version.length).toBeGreaterThan(0);
  });

  it("ignores a stale MAPCODE_BORDERS_PATH", () => {
    const cfg = loadConfig({ MAPCODE_BORDERS_PATH: "./data/borders.fgb" });
    expect(cfg).not.toHaveProperty("bordersPath");
    expect(Object.keys(cfg).sort()).toEqual(["dbCaCert", "dbUrl", "port", "replayToken", "version"]);
  });

  it("rejects malformed PORT values", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: "123abc" })).toThrow(/PORT/);
  });

  it("rejects PORT values outside the listenable range", () => {
    expect(() => loadConfig({ PORT: "-1" })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: "65536" })).toThrow(/PORT/);
  });

  it("defaults dbUrl, replayToken and dbCaCert to null", () => {
    const cfg = loadConfig({});
    expect(cfg.dbUrl).toBeNull();
    expect(cfg.replayToken).toBeNull();
    expect(cfg.dbCaCert).toBeNull();
  });

  it("parses MAPCODE_DB_URL, MAPCODE_REPLAY_TOKEN and MAPCODE_DB_CA_CERT", () => {
    const cfg = loadConfig({
      MAPCODE_DB_URL: "postgres://u:p@h:5432/db?sslmode=require",
      MAPCODE_REPLAY_TOKEN: "secret-token",
      MAPCODE_DB_CA_CERT: "-----BEGIN CERTIFICATE-----",
    });
    expect(cfg.dbUrl).toBe("postgres://u:p@h:5432/db?sslmode=require");
    expect(cfg.replayToken).toBe("secret-token");
    expect(cfg.dbCaCert).toBe("-----BEGIN CERTIFICATE-----");
  });

  it("treats empty/whitespace MAPCODE_DB_URL as absent", () => {
    const cfg = loadConfig({ MAPCODE_DB_URL: "  " });
    expect(cfg.dbUrl).toBeNull();
  });

  it("fails closed: MAPCODE_DB_URL without MAPCODE_REPLAY_TOKEN throws", () => {
    expect(() =>
      loadConfig({
          MAPCODE_DB_URL: "postgres://u:p@h:5432/db",
      })
    ).toThrow(/MAPCODE_REPLAY_TOKEN/);
  });

  it("accepts MAPCODE_REPLAY_TOKEN without MAPCODE_DB_URL (recording simply disabled)", () => {
    const cfg = loadConfig({ MAPCODE_REPLAY_TOKEN: "t" });
    expect(cfg.dbUrl).toBeNull();
    expect(cfg.replayToken).toBe("t");
  });
});

describe("loadEnvFileIfExists", () => {
  it("loads values from an existing .env file", () => {
    const env: NodeJS.ProcessEnv = {};
    const envPath = writeEnvFile("VERSION=from-file\nPORT=8081\n");

    expect(loadEnvFileIfExists(envPath, env)).toBe(true);

    expect(env.VERSION).toBe("from-file");
    expect(env.PORT).toBe("8081");
  });

  it("keeps deployment-provided variables ahead of .env file values", () => {
    const env: NodeJS.ProcessEnv = { VERSION: "from-deployment", PORT: "0" };
    const envPath = writeEnvFile("VERSION=from-file\nPORT=8081\n");

    expect(loadEnvFileIfExists(envPath, env)).toBe(true);

    expect(env.VERSION).toBe("from-deployment");
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
