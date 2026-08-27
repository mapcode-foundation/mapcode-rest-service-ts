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
import { poolConfig } from "../src/storage/pool.ts";

describe("poolConfig", () => {
  it("returns null when dbUrl is null", () => {
    expect(poolConfig({ dbUrl: null, dbCaCert: null })).toBeNull();
  });

  it("passes the connection string through", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db?sslmode=require", dbCaCert: null });
    expect(cfg).toEqual({ connectionString: "postgres://u:p@h:5432/db?sslmode=require" });
  });

  it("enables verified TLS when a CA cert is configured", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db", dbCaCert: "PEM" });
    expect(cfg?.ssl).toEqual({ ca: "PEM", rejectUnauthorized: true });
  });
});
