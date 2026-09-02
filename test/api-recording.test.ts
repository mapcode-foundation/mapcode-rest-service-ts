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

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.ts";
import { createMapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";
import type { RecordedRequest, RequestRecorder } from "../src/storage/request-recorder.ts";
import { KIND } from "../src/routes/recording.ts";

const events: RecordedRequest[] = [];
const captureRecorder: RequestRecorder = {
  record: (e) => {
    events.push(e);
  },
  flush: async () => {},
  close: async () => {},
};

let app: FastifyInstance;
let mapcodeService: ReturnType<typeof createMapcodeService>;

beforeAll(async () => {
  mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0", recorder: captureRecorder });
  await app.ready();
});

beforeEach(() => {
  events.length = 0;
});

async function inject(url: string, method = "GET"): Promise<RecordedRequest> {
  events.length = 0;
  await app.inject({ method: method as "GET", url });
  expect(events).toHaveLength(1);
  return events[0];
}

describe("recorded kinds and coordinates", () => {
  it("records an encode call with request-path microdegree coords", async () => {
    const e = await inject("/mapcode/codes/52.376514,4.908543");
    expect(e).toMatchObject({ kind: KIND.codes, lat: 52376514, lon: 4908543, status: 20, client: 0, mapcode: null });
    expect(Math.abs(e.ts - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(2);
  });

  it("wraps longitudes exactly like the encoder (mapToLon)", async () => {
    const e = await inject("/mapcode/codes/52.376514,364.908543");
    expect(e.lon).toBe(4908543);
  });

  it("records the type variants with their own kinds", async () => {
    expect((await inject("/mapcode/codes/52.376514,4.908543/local")).kind).toBe(KIND.codesLocal);
    expect((await inject("/mapcode/codes/52.376514,4.908543/international")).kind).toBe(KIND.codesInternational);
    expect((await inject("/mapcode/codes/52.376514,4.908543/mapcodes")).kind).toBe(KIND.codesMapcodes);
    expect((await inject("/mapcode/codes/52.376514,4.908543/territories")).kind).toBe(KIND.codesTerritories);
  });

  it("collapses /xml/ and /json/ prefixes to the same kind", async () => {
    expect((await inject("/mapcode/xml/codes/52.376514,4.908543")).kind).toBe(KIND.codes);
    expect((await inject("/mapcode/json/codes/52.376514,4.908543")).kind).toBe(KIND.codes);
  });

  it("records a failed encode with condensed status and NULL coords", async () => {
    const e = await inject("/mapcode/codes/91,0");
    expect(e).toMatchObject({ kind: KIND.codes, lat: null, lon: null, status: 40 });
  });

  it("records a decode with the decoded point and the raw mapcode", async () => {
    const e = await inject("/mapcode/coords/NLD%2049.4V");
    // The exact call handleCoords makes for this request (src/resources/coords.ts:124).
    const point = mapcodeService.decode("NLD 49.4V", null);
    expect(e.kind).toBe(KIND.coords);
    expect(e.mapcode).toBe("NLD 49.4V");
    expect(e.lat).toBe(Math.round(point.getLatDeg() * 1e6));
    expect(e.lon).toBe(Math.round(point.getLonDeg() * 1e6));
  });

  it("records a rectangle decode using the rectangle center", async () => {
    const e = await inject("/mapcode/coords/NLD%2049.4V?include=rectangle");
    // The exact call handleCoords makes for include=rectangle (src/resources/coords.ts:107).
    const rect = mapcodeService.decodeToRectangle("NLD 49.4V", null);
    expect(e.kind).toBe(KIND.coords);
    expect(e.lat).toBe(Math.round(rect.getCenter().getLatDeg() * 1e6));
    expect(e.lon).toBe(Math.round(rect.getCenter().getLonDeg() * 1e6));
  });

  it("records a failed decode with NULL coords but its kind", async () => {
    const e = await inject("/mapcode/coords/not-a-mapcode");
    expect(e).toMatchObject({ kind: KIND.coords, lat: null, lon: null, status: 40, mapcode: null });
  });

  it("records non-geo endpoints with NULL coords", async () => {
    expect(await inject("/mapcode")).toMatchObject({ kind: KIND.help, lat: null, lon: null, status: 20 });
    expect(await inject("/mapcode/version")).toMatchObject({ kind: KIND.version, lat: null });
    expect(await inject("/mapcode/status")).toMatchObject({ kind: KIND.status, lat: null });
    expect(await inject("/mapcode/territories")).toMatchObject({ kind: KIND.territories, lat: null });
    expect(await inject("/mapcode/territories/NLD")).toMatchObject({ kind: KIND.territory, lat: null });
    expect(await inject("/mapcode/alphabets")).toMatchObject({ kind: KIND.alphabets, lat: null });
    expect(await inject("/mapcode/alphabets/roman")).toMatchObject({ kind: KIND.alphabet, lat: null });
  });

  it("records the forbidden bare-path calls under their endpoint kind", async () => {
    expect(await inject("/mapcode/codes")).toMatchObject({ kind: KIND.codes, status: 43 });
    expect(await inject("/mapcode/coords")).toMatchObject({ kind: KIND.coords, status: 43 });
  });

  it("records unmatched routes and bad methods as kind 99", async () => {
    expect(await inject("/mapcode/no-such-route")).toMatchObject({ kind: KIND.unmatched, status: 44 });
    expect(await inject("/mapcode/version", "POST")).toMatchObject({ kind: KIND.unmatched, status: 45 });
  });
});

describe("replay endpoints are never recorded", () => {
  it("skips /mapcode/replay and everything below it, matched or not", async () => {
    const withReplay = buildServer({
      mapcodeService,
      boundaryService: await BoundaryService.load("test/resources/borders-test.fgb"),
      version: "1.0",
      recorder: captureRecorder,
      replay: {
        token: "t",
        query: async () => ({ ts: [], kind: [], lat: [], lon: [], status: [], client: [], mapcode: [] }),
        stats: async () => [],
      },
    });
    await withReplay.ready();
    events.length = 0;
    // 401s (no token), a 200 (with token), a trailing slash, and a 404 below the prefix.
    for (const url of [
      "/mapcode/replay?from=1000&to=2000",
      "/mapcode/replay/stats",
      "/mapcode/replay/",
      "/mapcode/replay/no-such-thing",
    ]) {
      await withReplay.inject({ method: "GET", url });
    }
    await withReplay.inject({
      method: "GET",
      url: "/mapcode/replay/stats",
      headers: { authorization: "Bearer t" },
    });
    expect(events).toHaveLength(0);
    // A lookalike prefix is normal unmatched traffic and still records.
    await withReplay.inject({ method: "GET", url: "/mapcode/replayground" });
    expect(events).toMatchObject([{ kind: KIND.unmatched }]);
    await withReplay.close();
  });

  it("skips /mapcode/replay 404s even when replay is not configured", async () => {
    await app.inject({ method: "GET", url: "/mapcode/replay?from=1" });
    expect(events).toHaveLength(0);
  });
});

describe("allowLog", () => {
  it("suppresses recording for false/0/no (case-insensitive)", async () => {
    for (const v of ["false", "FALSE", "0", "no", "No"]) {
      await app.inject({ method: "GET", url: `/mapcode/version?allowLog=${v}` });
    }
    expect(events).toHaveLength(0);
  });

  it("records for absent, true, or garbage values", async () => {
    await app.inject({ method: "GET", url: "/mapcode/version?allowLog=true" });
    await app.inject({ method: "GET", url: "/mapcode/version?allowLog=banana" });
    expect(events).toHaveLength(2);
  });
});

describe("client mapping", () => {
  it("maps the client query param and never stores the string", async () => {
    expect((await inject("/mapcode/version?client=web")).client).toBe(1);
    expect((await inject("/mapcode/version?client=Android")).client).toBe(2);
    expect((await inject("/mapcode/version?client=ios")).client).toBe(3);
    expect((await inject("/mapcode/version?client=curl")).client).toBe(4);
    expect((await inject("/mapcode/version")).client).toBe(0);
  });
});

describe("parity", () => {
  it("produces byte-identical responses with and without the recorder", async () => {
    const bare = buildServer({
      mapcodeService,
      boundaryService: await BoundaryService.load("test/resources/borders-test.fgb"),
      version: "1.0",
    });
    await bare.ready();
    for (const url of [
      "/mapcode/codes/52.376514,4.908543?include=territory,alphabet",
      "/mapcode/xml/codes/52.376514,4.908543/mapcodes",
      "/mapcode/coords/NLD%2049.4V",
      "/mapcode/version",
    ]) {
      const withRecorder = await app.inject({ method: "GET", url });
      const without = await bare.inject({ method: "GET", url });
      expect(withRecorder.body).toBe(without.body);
      expect(withRecorder.statusCode).toBe(without.statusCode);
    }
    await bare.close();
  });
});
