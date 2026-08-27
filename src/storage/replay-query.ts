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

import type { RecorderPool } from "./schema.ts";

// ---------------------------------------------------------------------------
// The replay SELECT. lat IS NOT NULL always applies: non-geo rows exist for
// usage stats and are never plottable. No status filter server-side — status
// is returned so the page can colour or hide failures without a round trip.
// ---------------------------------------------------------------------------

export interface ReplayQueryArgs {
  from: number; // epoch seconds, inclusive
  to: number; // epoch seconds, exclusive
  limit: number;
  kinds: number[] | null;
}

/** Columnar result — the shape a canvas/WebGL renderer iterates. */
export interface ReplayColumns {
  ts: number[];
  kind: number[];
  lat: number[];
  lon: number[];
  status: number[];
  client: number[];
  mapcode: (string | null)[];
}

export type ReplayQueryFn = (args: ReplayQueryArgs) => Promise<ReplayColumns>;

export function buildReplayQuery(args: ReplayQueryArgs): { text: string; values: unknown[] } {
  // status/client are "char" (1 byte) — cast back to int for numeric columns.
  const kindClause = args.kinds !== null ? " AND kind = ANY($4::int2[])" : "";
  const text =
    "SELECT ts, kind, lat, lon, status::int AS status, client::int AS client, mapcode" +
    " FROM mapcode_request WHERE ts >= $1 AND ts < $2 AND lat IS NOT NULL" +
    kindClause +
    " ORDER BY ts LIMIT $3";
  const values: unknown[] = [args.from, args.to, args.limit];
  if (args.kinds !== null) values.push(args.kinds);
  return { text, values };
}

interface ReplayRow {
  ts: number;
  kind: number;
  lat: number;
  lon: number;
  status: number;
  client: number;
  mapcode: string | null;
}

export async function queryReplay(pool: RecorderPool, args: ReplayQueryArgs): Promise<ReplayColumns> {
  const { text, values } = buildReplayQuery(args);
  const result = (await pool.query(text, values)) as { rows: ReplayRow[] };
  const cols: ReplayColumns = { ts: [], kind: [], lat: [], lon: [], status: [], client: [], mapcode: [] };
  for (const row of result.rows) {
    cols.ts.push(row.ts);
    cols.kind.push(row.kind);
    cols.lat.push(row.lat);
    cols.lon.push(row.lon);
    cols.status.push(row.status);
    cols.client.push(row.client);
    cols.mapcode.push(row.mapcode);
  }
  return cols;
}
