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
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

describe("package dependency configuration", () => {
  it("keeps package metadata at the release version", () => {
    expect(packageJson.version).toBe("2.5.1");
    expect(packageLock.version).toBe("2.5.1");
    expect(packageLock.packages[""].version).toBe("2.5.1");
  });

  it("uses a registry-resolvable mapcode-ts dependency", () => {
    expect(packageJson.dependencies["mapcode-ts"]).not.toMatch(/^file:/);
    expect(packageLock.packages[""].dependencies["mapcode-ts"]).not.toMatch(/^file:/);
    expect(packageLock.packages["node_modules/mapcode-ts"].resolved).not.toMatch(/^\.\./);
  });

  it("does not require Node's --env-file flag for runtime startup", () => {
    expect(packageJson.scripts.start).toBe("node dist/index.js");
    expect(packageJson.scripts.dev).not.toContain("--env-file");
  });
});
