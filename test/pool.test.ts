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
import { poolConfig, API_POOL_TUNING, MAINTENANCE_POOL_TUNING } from "../src/storage/pool.ts";

describe("poolConfig", () => {
  it("returns null when dbUrl is null", () => {
    expect(poolConfig({ dbUrl: null, dbCaCert: null })).toBeNull();
  });

  it("passes the connection string through with the API statement timeout by default", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db?sslmode=require", dbCaCert: null });
    expect(cfg).toEqual({
      connectionString: "postgres://u:p@h:5432/db?sslmode=require",
      statement_timeout: 30_000,
      query_timeout: 35_000,
      connectionTimeoutMillis: 10_000,
    });
  });

  it("applies maintenance tuning: one connection, one-hour statement timeout", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db", dbCaCert: null }, MAINTENANCE_POOL_TUNING);
    expect(cfg).toEqual({
      connectionString: "postgres://u:p@h:5432/db",
      statement_timeout: 3_600_000,
      query_timeout: 3_605_000,
      connectionTimeoutMillis: 10_000,
      max: 1,
    });
  });

  it("exposes the tuning constants", () => {
    expect(API_POOL_TUNING).toEqual({ statementTimeoutMs: 30_000 });
    expect(MAINTENANCE_POOL_TUNING).toEqual({ statementTimeoutMs: 3_600_000, max: 1 });
  });

  it("enables verified TLS when a CA cert is configured", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db", dbCaCert: "PEM" });
    expect(cfg?.ssl).toEqual({ ca: "PEM", rejectUnauthorized: true });
  });
});
