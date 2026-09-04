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

import { Pool, type PoolConfig } from "pg";
import type { Config } from "../config.ts";

/** Per-pool knobs. statement_timeout is per connection in pg, hence per pool. */
export interface PoolTuning {
  /** Server-side statement_timeout in ms; a runaway query is cancelled by Postgres. */
  statementTimeoutMs: number;
  /** Pool size cap (pg default 10 when omitted). */
  max?: number;
}

/** API-path queries: replay SELECT, recorder INSERT, storage-size lookup. */
export const API_POOL_TUNING: PoolTuning = { statementTimeoutMs: 30_000 };

/** Long-running maintenance: the 6-hourly stats scan and the one-off btree build. */
export const MAINTENANCE_POOL_TUNING: PoolTuning = { statementTimeoutMs: 3_600_000, max: 1 };

/**
 * Shape the pg pool options from config. TLS: sslmode in the URL governs
 * whether TLS is used; a configured CA cert upgrades it to full verification.
 * rejectUnauthorized is never silently disabled here.
 */
export function poolConfig(
  config: Pick<Config, "dbUrl" | "dbCaCert">,
  tuning: PoolTuning = API_POOL_TUNING
): PoolConfig | null {
  if (config.dbUrl === null) return null;
  const options: PoolConfig = { connectionString: config.dbUrl, statement_timeout: tuning.statementTimeoutMs };
  if (tuning.max !== undefined) options.max = tuning.max;
  if (config.dbCaCert !== null) {
    options.ssl = { ca: config.dbCaCert, rejectUnauthorized: true };
  }
  return options;
}

/** Create a pg pool, or null when no database is configured. */
export function createPool(config: Pick<Config, "dbUrl" | "dbCaCert">, tuning: PoolTuning = API_POOL_TUNING): Pool | null {
  const options = poolConfig(config, tuning);
  return options === null ? null : new Pool(options);
}
