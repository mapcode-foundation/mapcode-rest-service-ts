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
