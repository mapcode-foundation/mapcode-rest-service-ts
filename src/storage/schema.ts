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

// ---------------------------------------------------------------------------
// Postgres schema for recorded requests. src/storage/ is the only layer that
// talks to the database; domain/ and resources/ stay DB-free.
//
// The event log is APPEND-ONLY by decision (2026-09-04): no retention job,
// no DELETE, no TRUNCATE. The in-memory stats cache (stats-cache.ts) relies
// on rows never disappearing.
// ---------------------------------------------------------------------------

/**
 * The minimal pool surface the storage layer needs. pg.Pool satisfies this
 * structurally; tests supply fakes without mocking pg internals.
 */
export interface RecorderPool {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export const SCHEMA_DDL = `CREATE TABLE IF NOT EXISTS mapcode_request (
  -- Column order is load-bearing: Postgres lays out tuples in declaration
  -- order, and this exact sequence packs a geo row into 40 bytes of tuple
  -- (44 on disk incl. line pointer). Widening status/client to smallint,
  -- or moving mapcode ahead of kind, crosses the MAXALIGN boundary and
  -- costs 8 bytes per row.
  ts      integer  NOT NULL,   -- epoch seconds, UTC (int4; overflows 2038)
  lat     integer,             -- microdegrees; NULL for non-geo calls
  lon     integer,             -- microdegrees, wrapped [-180e6, 180e6]
  kind    smallint NOT NULL,   -- endpoint identity (see src/routes/recording.ts)
  status  "char"   NOT NULL,   -- HTTP status, 1st+3rd digit
  client  "char"   NOT NULL,   -- caller class (0 none, 1 web, 2 android, 3 ios, 4 other)
  mapcode text                 -- caller-provided mapcode; decode calls only
);
CREATE INDEX IF NOT EXISTS mapcode_request_ts_brin
  ON mapcode_request USING brin (ts);`;

/** Idempotent schema bootstrap (CREATE ... IF NOT EXISTS). */
export async function ensureSchema(pool: RecorderPool): Promise<void> {
  await pool.query(SCHEMA_DDL);
}

/**
 * The btree lets `ORDER BY ts LIMIT n` stop after n rows (BRIN cannot supply
 * ordering). CONCURRENTLY keeps INSERTs flowing during the build on a large
 * table, and cannot run inside a transaction block — hence a separate
 * single-statement query, not part of SCHEMA_DDL. An interrupted concurrent
 * build leaves an INVALID index that IF NOT EXISTS then skips: `ensureBtreeIndex`
 * detects an INVALID leftover and rebuilds it.
 */
export const BTREE_INDEX_DDL =
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS mapcode_request_ts_btree ON mapcode_request (ts)";

/** Validity of the ts btree, if it exists: an interrupted CONCURRENTLY build leaves it INVALID. */
export const BTREE_INDEX_VALIDITY_SQL =
  "SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid" +
  " WHERE c.relname = 'mapcode_request_ts_btree'";

/** CONCURRENTLY so dropping the dead index never blocks the recorder's INSERTs. */
export const BTREE_INDEX_DROP_DDL = "DROP INDEX CONCURRENTLY IF EXISTS mapcode_request_ts_btree";

/**
 * Idempotent btree bootstrap; call after ensureSchema, on the maintenance pool.
 * An INVALID leftover from an interrupted build is dropped and rebuilt, with a warning.
 */
export async function ensureBtreeIndex(
  pool: RecorderPool,
  warn: (message: string) => void = (message) => console.warn(message)
): Promise<void> {
  const result = (await pool.query(BTREE_INDEX_VALIDITY_SQL)) as { rows: { valid: boolean }[] };
  if (result.rows.length > 0 && result.rows[0].valid === false) {
    warn("btree index mapcode_request_ts_btree is INVALID (interrupted build); dropping and rebuilding");
    await pool.query(BTREE_INDEX_DROP_DDL);
  }
  await pool.query(BTREE_INDEX_DDL);
}
