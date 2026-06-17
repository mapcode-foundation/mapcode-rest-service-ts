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
