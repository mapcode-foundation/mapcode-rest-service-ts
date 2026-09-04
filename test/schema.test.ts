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
import { SCHEMA_DDL, BTREE_INDEX_DDL, ensureSchema, ensureBtreeIndex } from "../src/storage/schema.ts";

describe("schema DDL", () => {
  it("keeps the table + BRIN bootstrap transactional and separate from the btree build", () => {
    expect(SCHEMA_DDL).toContain("CREATE TABLE IF NOT EXISTS mapcode_request");
    expect(SCHEMA_DDL).toContain("USING brin (ts)");
    expect(SCHEMA_DDL).not.toContain("CONCURRENTLY");
  });

  it("builds the ts btree concurrently and idempotently", () => {
    expect(BTREE_INDEX_DDL).toBe(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS mapcode_request_ts_btree ON mapcode_request (ts)"
    );
  });

  it("ensureBtreeIndex issues exactly the single-statement DDL", async () => {
    const calls: string[] = [];
    const pool = { query: async (text: string) => { calls.push(text); return { rows: [] }; } };
    await ensureSchema(pool);
    await ensureBtreeIndex(pool);
    expect(calls).toEqual([SCHEMA_DDL, BTREE_INDEX_DDL]);
  });
});
