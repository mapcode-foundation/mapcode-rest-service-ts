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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bordersPath = (env.MAPCODE_BORDERS_PATH ?? "").trim();
  if (!bordersPath) {
    throw new Error("MAPCODE_BORDERS_PATH is required (path to the borders.fgb file).");
  }
  const port = parsePort(env.PORT?.trim());
  const version = (env.VERSION ?? "").trim() || packageVersion();
  return { port, bordersPath, version };
}
