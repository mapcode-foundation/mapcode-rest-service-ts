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

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return 8080;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`PORT must be an integer between 0 and 65535: ${value}`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535: ${value}`);
  }
  return port;
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote === "\"" || quote === "'" || quote === "`") {
    const end = trimmed.indexOf(quote, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  const comment = trimmed.indexOf("#");
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trimEnd();
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const body = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
  const separator = body.indexOf("=");
  if (separator === -1) {
    return null;
  }
  const key = body.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  return [key, parseEnvValue(body.slice(separator + 1))];
}

export function loadEnvFileIfExists(path = ".env", env: NodeJS.ProcessEnv = process.env): boolean {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return false;
    }
    throw err;
  }

  for (const line of contents.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry === null) {
      continue;
    }
    const [key, value] = entry;
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return true;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bordersPath = (env.MAPCODE_BORDERS_PATH ?? "").trim();
  if (!bordersPath) {
    throw new Error("MAPCODE_BORDERS_PATH is required (path to the borders.fgb file).");
  }
  const port = parsePort(env.PORT?.trim());
  const version = (env.VERSION ?? "").trim() || packageVersion();
  return { port, bordersPath, version };
}
