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
  it("renders signed zeros the way Java Double.toString does", () => {
    expect(formatDouble(0)).toBe("0.0");
    expect(formatDouble(-0)).toBe("-0.0");
  });

  // Double.toString on Temurin 17, the original service's runtime.
  const JAVA_DOUBLE_TO_STRING = [
    "2.0E-6", "7.3E-5", "1.23E-4", "-1.23E-4", "9.99E-4", "9.99999E-4",
    "1.0E-6", "1.0E-7", "1.234567E-5", "5.0E-10",
    "1.5000000000000001E-4", "3.3333333333333335E-5",
    "2.2250738585072014E-308", "4.9E-324",
    "0.001", "-0.001", "0.0012345", "0.30000000000000004",
    "9999999.0", "9999999.5", "1.0E7", "-1.0E7", "1.2345678E8",
    "1.0E21", "1.0E22", "1.7976931348623157E308",
  ];
  it.each(JAVA_DOUBLE_TO_STRING)("renders %s like Java", (java) => {
    expect(formatDouble(Number(java))).toBe(java);
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
