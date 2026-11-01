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
import { afterEach, describe, expect, it } from "vitest";
import { loadBorders } from "../src/domain/load-borders.ts";
import { TEST_BORDERS_PATH } from "./borders-fixture.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadBorders", () => {
  it("loads the bundled data when no path is given", async () => {
    const borders = await loadBorders(null);
    expect(borders.getSource().name).toBe("OpenStreetMap");
    expect(borders.getCountry(51.4436, 4.9326)?.toString()).toBe("NLD");
  });

  it("loads the .mcb file at the given path", async () => {
    const borders = await loadBorders(TEST_BORDERS_PATH);
    expect(borders.getSource().name).toBe("mapcode-rest-service-ts test fixture");
  });

  it("fails fast naming the path when the file is not readable", async () => {
    await expect(loadBorders("/no/such/borders.mcb")).rejects.toThrow("Borders file not readable: /no/such/borders.mcb");
  });

  it("tells the operator to unset MAPCODE_BORDERS_PATH when the configured file is missing", async () => {
    await expect(loadBorders("./data/borders.fgb")).rejects.toThrow("Unset MAPCODE_BORDERS_PATH");
  });

  it("fails fast naming the path and MAPCODE_BORDERS_PATH when the file is not an .mcb file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "borders-"));
    tempDirs.push(dir);
    const path = join(dir, "borders.fgb");
    writeFileSync(path, "fgb\x03not a mapcode-ts-borders file");
    const failure = loadBorders(path);
    await expect(failure).rejects.toThrow(path);
    await expect(failure).rejects.toThrow(/MAPCODE_BORDERS_PATH must point at a mapcode-ts-borders \.mcb file, or be unset/);
  });
});
