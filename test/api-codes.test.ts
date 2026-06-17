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

import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../src/server.ts";
import { createMapcodeService } from "../src/domain/mapcode-service.ts";
import { BoundaryService } from "../src/domain/boundary-service.ts";
import type { FastifyInstance } from "fastify";

// Ported verbatim from ApiCodesTest.java.

const TEST_LAT1 = 50.141706;
const TEST_LON1 = 6.135864;
const TEST_LATLON1 = `${TEST_LAT1},${TEST_LON1}`;

const TEST_LAT2 = 52.159853;
const TEST_LON2 = 4.499790;
const TEST_LATLON2 = `${TEST_LAT2},${TEST_LON2}`;

const TEST_LAT_INTL = 53.80065082633023;
const TEST_LON_INTL = 4.504394531250001;
const TEST_LATLON_INTL = `${TEST_LAT_INTL},${TEST_LON_INTL}`;

let app: FastifyInstance;

beforeAll(async () => {
  const mapcodeService = createMapcodeService();
  const boundaryService = await BoundaryService.load("test/resources/borders-test.fgb");
  app = buildServer({ mapcodeService, boundaryService, version: "1.0" });
  await app.ready();
});

async function getJson(url: string) {
  return app.inject({ method: "GET", url, headers: { accept: "application/json" } });
}
async function getXml(url: string) {
  return app.inject({ method: "GET", url, headers: { accept: "application/xml" } });
}

describe("checkCodesNoLatLon", () => {
  it("/mapcode/codes → 403", async () => {
    const res = await getJson("/mapcode/codes");
    expect(res.statusCode).toBe(403);
  });
});

describe("checkCodesUseOfContext", () => {
  it("context param → 400", async () => {
    const res = await getJson("/mapcode/codes/52,5?context=NLD");
    expect(res.statusCode).toBe(400);
  });
});

describe("checkIncorrectParameters", () => {
  it("404/400 matrix", async () => {
    expect((await getJson("/mapcode/codes/1")).statusCode).toBe(404);
    expect((await getJson("/mapcode/codes/1,")).statusCode).toBe(404);
    expect((await getJson("/mapcode/codes/,1")).statusCode).toBe(404);
    expect((await getJson("/mapcode/codes/x,1")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,x")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?precision=x")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?precision=")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?precision=x")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?territory=")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?territory=x")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?alphabet=")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/1,1?alphabet=x")).statusCode).toBe(400);
  });

  it("returns 400 for repeated include query parameters", async () => {
    const res = await getJson("/mapcode/codes/52,5?include=offset&include=territory");
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("include");
  });

  it("does not double-decode the lat/lon path segment", async () => {
    const res = await getJson("/mapcode/codes/52%252C5");
    expect(res.statusCode).toBe(404);
  });
});

describe("checkCodesCheckLatLon", () => {
  it("range checks", async () => {
    expect((await getJson("/mapcode/codes/90,180")).statusCode).toBe(200);
    expect((await getJson("/mapcode/codes/-90,-180")).statusCode).toBe(200);
    expect((await getJson("/mapcode/codes/-91,0")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/91,0")).statusCode).toBe(400);
    expect((await getJson("/mapcode/codes/0,-181")).statusCode).toBe(200);
    expect((await getJson("/mapcode/codes/0,181")).statusCode).toBe(200);
  });
});

describe("checkCodesJson", () => {
  it("default + territory=LUX", async () => {
    let res = await getJson(`/mapcode/codes/${TEST_LATLON1}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"local":{"mapcode":"JL0.KP","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ"},"mapcodes":[{"mapcode":"JL0.KP","territory":"LUX"},{"mapcode":"R8RN.07Z","territory":"LUX"},{"mapcode":"SQB.NR3","territory":"BEL"},{"mapcode":"R8RN.07Z","territory":"BEL"},{"mapcode":"0L46.LG9","territory":"DEU"},{"mapcode":"R8RN.07Z","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ"}]}'
    );

    res = await getJson(`/mapcode/codes/${TEST_LATLON1}?territory=LUX`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"local":{"mapcode":"JL0.KP","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ"},"mapcodes":[{"mapcode":"JL0.KP","territory":"LUX"},{"mapcode":"R8RN.07Z","territory":"LUX"}]}'
    );
  });
});

describe("checkCodesXml", () => {
  it("default XML", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON1}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode></mapcodes></mapcodes>'
    );
  });
});

describe("checkCodesPrecision0XmlJson", () => {
  const expectedXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode></mapcodes></mapcodes>';
  const expectedJson =
    '{"local":{"mapcode":"JL0.KP","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ"},"mapcodes":[{"mapcode":"JL0.KP","territory":"LUX"},{"mapcode":"R8RN.07Z","territory":"LUX"},{"mapcode":"SQB.NR3","territory":"BEL"},{"mapcode":"R8RN.07Z","territory":"BEL"},{"mapcode":"0L46.LG9","territory":"DEU"},{"mapcode":"R8RN.07Z","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ"}]}';

  it("json (accept)", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON1}?precision=0`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedJson);
  });
  it("xml (/xml/ prefix)", async () => {
    const res = await app.inject({ method: "GET", url: `/mapcode/xml/codes/${TEST_LATLON1}?precision=0` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedXml);
  });
  it("json (/json/ prefix)", async () => {
    const res = await app.inject({ method: "GET", url: `/mapcode/json/codes/${TEST_LATLON1}?precision=0` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(expectedJson);
  });
});

describe("checkCodesPrecision0Xml", () => {
  it("xml (accept)", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON1}?precision=0`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode></mapcodes></mapcodes>'
    );
  });
});

describe("checkCodesPrecision1Json", () => {
  it("precision=1 json", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON1}?precision=1`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"local":{"mapcode":"JL0.KP-8","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ-0"},"mapcodes":[{"mapcode":"JL0.KP-8","territory":"LUX"},{"mapcode":"R8RN.07Z-M","territory":"LUX"},{"mapcode":"SQB.NR3-P","territory":"BEL"},{"mapcode":"R8RN.07Z-M","territory":"BEL"},{"mapcode":"0L46.LG9-Q","territory":"DEU"},{"mapcode":"R8RN.07Z-M","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ-0"}]}'
    );
  });
});

describe("checkCodesPrecision1Xml", () => {
  it("precision=1 xml", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON1}?precision=1`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP-8</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ-0</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP-8</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z-M</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3-P</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z-M</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9-Q</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z-M</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ-0</mapcode></mapcode></mapcodes></mapcodes>'
    );
  });
});

describe("checkCodesPrecision8Json", () => {
  it("precision=8 json", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON1}?precision=8`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"local":{"mapcode":"JL0.KP-81B34315","territory":"LUX"},"international":{"mapcode":"VJ0L6.9PNQ-03Q7CGV4"},"mapcodes":[{"mapcode":"JL0.KP-81B34315","territory":"LUX"},{"mapcode":"R8RN.07Z-MWPCRQBK","territory":"LUX"},{"mapcode":"SQB.NR3-P6880000","territory":"BEL"},{"mapcode":"R8RN.07Z-MWPCRQBK","territory":"BEL"},{"mapcode":"0L46.LG9-QWPVQVRW","territory":"DEU"},{"mapcode":"R8RN.07Z-MWPCRQBK","territory":"FRA"},{"mapcode":"VJ0L6.9PNQ-03Q7CGV4"}]}'
    );
  });
});

describe("checkCodesPrecision8Xml", () => {
  it("precision=8 xml", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON1}?precision=8`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>JL0.KP-81B34315</mapcode><territory>LUX</territory></local><international><mapcode>VJ0L6.9PNQ-03Q7CGV4</mapcode></international><mapcodes><mapcode><mapcode>JL0.KP-81B34315</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>R8RN.07Z-MWPCRQBK</mapcode><territory>LUX</territory></mapcode><mapcode><mapcode>SQB.NR3-P6880000</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>R8RN.07Z-MWPCRQBK</mapcode><territory>BEL</territory></mapcode><mapcode><mapcode>0L46.LG9-QWPVQVRW</mapcode><territory>DEU</territory></mapcode><mapcode><mapcode>R8RN.07Z-MWPCRQBK</mapcode><territory>FRA</territory></mapcode><mapcode><mapcode>VJ0L6.9PNQ-03Q7CGV4</mapcode></mapcode></mapcodes></mapcodes>'
    );
  });
});

describe("checkCodesLocalDoesNotExist", () => {
  it("intl location /local → 404", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON_INTL}/local`);
    expect(res.statusCode).toBe(404);
  });
});

describe("checkCodesMapcodesJson", () => {
  it("/mapcodes bare list", async () => {
    let res = await getJson(`/mapcode/codes/${TEST_LATLON2}/mapcodes`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '[{"mapcode":"QKM.N4","territory":"NLD"},{"mapcode":"CZQ.376","territory":"NLD"},{"mapcode":"N39J.QW0","territory":"NLD"},{"mapcode":"VHVN4.YZ74"}]'
    );

    res = await getJson(`/mapcode/codes/${TEST_LATLON_INTL}/mapcodes`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('[{"mapcode":"WHWZG.5Q6Q"}]');
  });
});

describe("checkCodesLocalJson", () => {
  it("/local various", async () => {
    let res = await getJson(`/mapcode/codes/${TEST_LATLON2}/local`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"mapcode":"QKM.N4","territory":"NLD"}');

    res = await getJson("/mapcode/codes/51.427804,5.488075125/local");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"mapcode":"XX.XV","territory":"NLD"}');

    res = await getJson("/mapcode/codes/51.427804,5.488075125/local?territory=NLD");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"mapcode":"XX.XV","territory":"NLD"}');

    res = await getJson("/mapcode/codes/51.427804,5.488075125/local?territory=BEL");
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"mapcode":"5S6.4G2","territory":"BEL"}');
  });
});

describe("checkCodesLocalXml", () => {
  it("/local xml", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON2}/local`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcode><mapcode>QKM.N4</mapcode><territory>NLD</territory></mapcode>'
    );
  });
});

describe("checkCodesInternationalJson", () => {
  it("/International json", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON1}/International`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"mapcode":"VJ0L6.9PNQ"}');
  });
});

describe("checkCodesInternationalXml", () => {
  it("/International xml", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON1}/International`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcode><mapcode>VJ0L6.9PNQ</mapcode></mapcode>'
    );
  });
});

describe("checkCodesIncludeJson", () => {
  it("include=offset,territory,alphabet json", async () => {
    const res = await getJson(`/mapcode/codes/${TEST_LATLON2}?include=offset,territory,alphabet`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '{"local":{"mapcode":"QKM.N4","mapcodeInAlphabet":"QKM.N4","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.843693},"international":{"mapcode":"VHVN4.YZ74","mapcodeInAlphabet":"VHVN4.YZ74","territory":"AAA","territoryInAlphabet":"AAA","offsetMeters":1.907245},"mapcodes":[{"mapcode":"QKM.N4","mapcodeInAlphabet":"QKM.N4","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.843693},{"mapcode":"CZQ.376","mapcodeInAlphabet":"CZQ.376","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":5.004936},{"mapcode":"N39J.QW0","mapcodeInAlphabet":"N39J.QW0","territory":"NLD","territoryInAlphabet":"NLD","offsetMeters":2.836538},{"mapcode":"VHVN4.YZ74","mapcodeInAlphabet":"VHVN4.YZ74","territory":"AAA","territoryInAlphabet":"AAA","offsetMeters":1.907245}],"territories":[{"alphaCode":"NLD"}]}'
    );
  });
});

describe("checkCodesIncludeXml", () => {
  it("include=offset,territory,alphabet xml", async () => {
    const res = await getXml(`/mapcode/codes/${TEST_LATLON2}?include=offset,territory,alphabet`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mapcodes><local><mapcode>QKM.N4</mapcode><mapcodeInAlphabet>QKM.N4</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.843693</offsetMeters></local><international><mapcode>VHVN4.YZ74</mapcode><mapcodeInAlphabet>VHVN4.YZ74</mapcodeInAlphabet><territory>AAA</territory><territoryInAlphabet>AAA</territoryInAlphabet><offsetMeters>1.907245</offsetMeters></international><mapcodes><mapcode><mapcode>QKM.N4</mapcode><mapcodeInAlphabet>QKM.N4</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.843693</offsetMeters></mapcode><mapcode><mapcode>CZQ.376</mapcode><mapcodeInAlphabet>CZQ.376</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>5.004936</offsetMeters></mapcode><mapcode><mapcode>N39J.QW0</mapcode><mapcodeInAlphabet>N39J.QW0</mapcodeInAlphabet><territory>NLD</territory><territoryInAlphabet>NLD</territoryInAlphabet><offsetMeters>2.836538</offsetMeters></mapcode><mapcode><mapcode>VHVN4.YZ74</mapcode><mapcodeInAlphabet>VHVN4.YZ74</mapcodeInAlphabet><territory>AAA</territory><territoryInAlphabet>AAA</territoryInAlphabet><offsetMeters>1.907245</offsetMeters></mapcode></mapcodes><territories><territory><alphaCode>NLD</alphaCode></territory></territories></mapcodes>'
    );
  });
});
