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

// Isolated test file: mocks `mapcode-ts` so that `encodeToShortest` throws a
// NON-UnknownMapcodeError. This proves encodeShortest rethrows anything that is
// not an UnknownMapcodeError (matching the Java service, which only swallows
// UnknownMapcodeException). It lives in its own file because vi.mock is hoisted
// and module-scoped, so it must not affect the real-library tests.

import { describe, it, expect, vi } from "vitest";

// Mock mapcode-ts: keep the real module but override encodeToShortest to throw
// a generic (non-UnknownMapcodeError) error.
vi.mock("mapcode-ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mapcode-ts")>();
  return {
    ...actual,
    encodeToShortest: () => {
      throw new actual.IllegalArgumentError("boom: not an UnknownMapcodeError");
    },
  };
});

const { createMapcodeService, Territory } = await import("../src/domain/mapcode-service.ts");

describe("encodeShortest rethrow", () => {
  it("rethrows a non-UnknownMapcodeError instead of returning null", () => {
    const svc = createMapcodeService();
    expect(() => svc.encodeShortest(52.376514, 4.908542, Territory.NLD)).toThrow(
      /boom: not an UnknownMapcodeError/
    );
  });
});
