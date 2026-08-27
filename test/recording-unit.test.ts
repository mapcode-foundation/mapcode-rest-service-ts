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
import {
  KIND,
  condenseStatus,
  clientToCode,
  allowLogDenies,
  latToMicro,
  lonToMicro,
  kindFromRoute,
  rawQueryValue,
} from "../src/routes/recording.ts";

describe("condenseStatus", () => {
  it("keeps the 1st and 3rd digit", () => {
    expect(condenseStatus(200)).toBe(20);
    expect(condenseStatus(400)).toBe(40);
    expect(condenseStatus(401)).toBe(41);
    expect(condenseStatus(403)).toBe(43);
    expect(condenseStatus(404)).toBe(44);
    expect(condenseStatus(405)).toBe(45);
    expect(condenseStatus(409)).toBe(49);
    expect(condenseStatus(500)).toBe(50);
  });
});

describe("clientToCode", () => {
  it("maps known clients case-insensitively", () => {
    expect(clientToCode("web")).toBe(1);
    expect(clientToCode("WEB")).toBe(1);
    expect(clientToCode("Android")).toBe(2);
    expect(clientToCode("ios")).toBe(3);
  });
  it("maps absent/empty to 0 and unknown to 4", () => {
    expect(clientToCode(undefined)).toBe(0);
    expect(clientToCode("")).toBe(0);
    expect(clientToCode("curl")).toBe(4);
  });
});

describe("allowLogDenies", () => {
  it("suppresses on false/0/no, case-insensitive", () => {
    expect(allowLogDenies("false")).toBe(true);
    expect(allowLogDenies("FALSE")).toBe(true);
    expect(allowLogDenies("0")).toBe(true);
    expect(allowLogDenies("no")).toBe(true);
    expect(allowLogDenies("No")).toBe(true);
  });
  it("records on absent, true, or garbage", () => {
    expect(allowLogDenies(undefined)).toBe(false);
    expect(allowLogDenies("true")).toBe(false);
    expect(allowLogDenies("1")).toBe(false);
    expect(allowLogDenies("banana")).toBe(false);
    expect(allowLogDenies("")).toBe(false);
  });
});

describe("microdegree conversion", () => {
  it("rounds to microdegrees", () => {
    expect(latToMicro(52.376514)).toBe(52376514);
    expect(lonToMicro(4.908543)).toBe(4908543);
    expect(latToMicro(-33.86882)).toBe(-33868820);
    expect(lonToMicro(0.0000004)).toBe(0);
    expect(lonToMicro(0.0000005)).toBe(1);
  });
  it("clamps at the poles and antimeridian", () => {
    expect(latToMicro(90.0000009)).toBe(90000000);
    expect(latToMicro(-90.0000009)).toBe(-90000000);
    expect(lonToMicro(180.0000009)).toBe(180000000);
    expect(lonToMicro(-180.0000009)).toBe(-180000000);
  });
});

describe("kindFromRoute", () => {
  it("maps plain route patterns", () => {
    expect(kindFromRoute("/mapcode", undefined)).toBe(KIND.help);
    expect(kindFromRoute("/mapcode/version", undefined)).toBe(KIND.version);
    expect(kindFromRoute("/mapcode/status", undefined)).toBe(KIND.status);
    expect(kindFromRoute("/mapcode/codes", undefined)).toBe(KIND.codes);
    expect(kindFromRoute("/mapcode/codes/:latlon", undefined)).toBe(KIND.codes);
    expect(kindFromRoute("/mapcode/codes/:latlon/territories", undefined)).toBe(KIND.codesTerritories);
    expect(kindFromRoute("/mapcode/coords", undefined)).toBe(KIND.coords);
    expect(kindFromRoute("/mapcode/coords/:code", undefined)).toBe(KIND.coords);
    expect(kindFromRoute("/mapcode/territories", undefined)).toBe(KIND.territories);
    expect(kindFromRoute("/mapcode/territories/:territory", undefined)).toBe(KIND.territory);
    expect(kindFromRoute("/mapcode/alphabets", undefined)).toBe(KIND.alphabets);
    expect(kindFromRoute("/mapcode/alphabets/:alphabet", undefined)).toBe(KIND.alphabet);
    expect(kindFromRoute("/mapcode/replay", undefined)).toBe(KIND.replay);
  });
  it("collapses /xml/ and /json/ prefixes", () => {
    expect(kindFromRoute("/mapcode/xml/codes/:latlon", undefined)).toBe(KIND.codes);
    expect(kindFromRoute("/mapcode/json/version", undefined)).toBe(KIND.version);
  });
  it("distinguishes the :type route by the type param", () => {
    expect(kindFromRoute("/mapcode/codes/:latlon/:type", "local")).toBe(KIND.codesLocal);
    expect(kindFromRoute("/mapcode/codes/:latlon/:type", "INTERNATIONAL")).toBe(KIND.codesInternational);
    expect(kindFromRoute("/mapcode/codes/:latlon/:type", "mapcodes")).toBe(KIND.codesMapcodes);
    expect(kindFromRoute("/mapcode/codes/:latlon/:type", "bogus")).toBe(KIND.codes);
    expect(kindFromRoute("/mapcode/xml/codes/:latlon/:type", "local")).toBe(KIND.codesLocal);
  });
  it("maps unmatched (no route) and unknown patterns to 99", () => {
    expect(kindFromRoute(undefined, undefined)).toBe(KIND.unmatched);
    expect(kindFromRoute("/something/else", undefined)).toBe(KIND.unmatched);
  });
});

describe("rawQueryValue", () => {
  it("returns strings, first element of arrays, undefined otherwise — never throws", () => {
    expect(rawQueryValue({ client: "web" }, "client")).toBe("web");
    expect(rawQueryValue({ client: ["ios", "web"] }, "client")).toBe("ios");
    expect(rawQueryValue({ client: 5 }, "client")).toBeUndefined();
    expect(rawQueryValue({}, "client")).toBeUndefined();
    expect(rawQueryValue(null, "client")).toBeUndefined();
    expect(rawQueryValue(undefined, "client")).toBeUndefined();
  });
});
