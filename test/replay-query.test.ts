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
import { buildReplayQuery, queryReplay } from "../src/storage/replay-query.ts";

describe("buildReplayQuery", () => {
  it("builds the range query with limit", () => {
    const { text, values } = buildReplayQuery({ from: 100, to: 200, limit: 50, kinds: null });
    expect(text).toBe(
      "SELECT ts, kind, lat, lon, status::int AS status, client::int AS client, mapcode, country, anon" +
        " FROM mapcode_request WHERE ts >= $1 AND ts < $2 AND (lat IS NOT NULL OR anon) ORDER BY ts LIMIT $3"
    );
    expect(values).toEqual([100, 200, 50]);
  });

  it("adds the kind filter as an array parameter", () => {
    const { text, values } = buildReplayQuery({ from: 100, to: 200, limit: 50, kinds: [10, 20] });
    expect(text).toContain('AND kind = ANY($4::int2[])');
    expect(values).toEqual([100, 200, 50, [10, 20]]);
  });
});

describe("queryReplay", () => {
  it("transforms rows into columnar arrays, anon as 0/1 and anonymised rows with null coords", async () => {
    const rows = [
      { ts: 100, kind: 10, lat: 52376514, lon: 4908543, status: 20, client: 1, mapcode: null, country: null, anon: false },
      { ts: 105, kind: 20, lat: 48858370, lon: 2294481, status: 20, client: 3, mapcode: "NLD 49.4V", country: null, anon: false },
      { ts: 110, kind: 30, lat: null, lon: null, status: 20, client: 5, mapcode: null, country: null, anon: true },
      { ts: 115, kind: 10, lat: null, lon: null, status: 20, client: 5, mapcode: null, country: "NLD", anon: true },
    ];
    const pool = { query: async () => ({ rows }) };
    const cols = await queryReplay(pool, { from: 0, to: 1000, limit: 10, kinds: null });
    expect(cols).toEqual({
      ts: [100, 105, 110, 115],
      kind: [10, 20, 30, 10],
      lat: [52376514, 48858370, null, null],
      lon: [4908543, 2294481, null, null],
      status: [20, 20, 20, 20],
      client: [1, 3, 5, 5],
      mapcode: [null, "NLD 49.4V", null, null],
      country: [null, null, null, "NLD"],
      anon: [0, 0, 1, 1],
    });
  });

  it("returns empty columns for no rows", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const cols = await queryReplay(pool, { from: 0, to: 1, limit: 1, kinds: null });
    expect(cols.ts).toEqual([]);
    expect(cols.mapcode).toEqual([]);
    expect(cols.country).toEqual([]);
    expect(cols.anon).toEqual([]);
  });
});
