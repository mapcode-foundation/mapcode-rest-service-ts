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

import { buildVersion, versionSchema } from "../dto/index.ts";
import type { MapcodeService, Territory } from "../domain/mapcode-service.ts";

// ---------------------------------------------------------------------------
// HELP_TEXT — ported verbatim from RootResourceImpl.java
// ---------------------------------------------------------------------------

const HELP_TEXT = `IMPORTANT NOTICE: The Mapcode Foundation provides an implementation of the Mapcode REST API at:
----------------- https://api.mapcode.com/mapcode

                  This free online service is provided for demonstration purposes only and the Mapcode
                  Foundation accepts no claims on its availability or reliability, although we'll try hard
                  to provide a stable and decent service. Note that usage or log data may be collected, only
                  to further improve service (never for commercial purposes). If you are interested in using
                  the service for professional purposes, or in high-availability or high-demands contexts,
                  you may wish to consider self-hosting this service. The source code is open-source and
                  available at: https://github.com/mapcode-foundation/mapcode-rest-service

The REST API Methods
--------------------

All REST services are able to return both JSON and XML. Use the HTTP
'Accept:' header to specify the expected format: application/json or application/xml
If the 'Accept:' header is omitted, JSON is assumed.

GET /mapcode         Returns this help page.
GET /mapcode/version Returns the software version.
GET /mapcode/status  Returns 200 if the service OK.

GET /mapcode/codes/{lat},{lon}[/[mapcodes|local|international]]
     [?precision=[0..8] & territory={restrictToTerritory} & country={restrictToCountry}
     alphabet={alphabet} & include={offset|territory|alphabet|rectangle}]

   Convert latitude/longitude to one or more mapcodes. The response always contains the 'international' mapcode and
   only contains a 'local' mapcode if there are any non-international mapcode AND they are all of the same territory.

   When no filter is specified (i.e. the response is the full mapcodes object), the response is also extended with a
   'territories' field listing the ranked OSM admin-boundary territories containing the lat/lon. This is the same
   data as returned by '/mapcode/codes/{lat},{lon}/territories' (most specific first; empty when no admin polygon
   contains the point, e.g. at sea). When 'territories' is non-empty, the 'mapcodes' array is sorted by the position
   of each mapcode's territory in 'territories' (codes whose territory is not in 'territories' are sorted last,
   in their original order). The 'local' mapcode is the first one whose territory matches the first entry in
   'territories'; if no mapcode matches, 'local' falls back to the shortest local code as before.

   The 'country' parameter always specifies a country, by a 2 or 3 character ISO-3166 code, like 'US' or 'USA'
   (for the USA), and 'NL' or 'NLD' (for the Netherlands). In a web environment, the country code is often available
   as a 2-character code. That code can be used for this parameter.

   The 'territory' parameter is a 2, 3 or 5 (XX-YY) character code. These code can be countries or states within countries.
   Some 2 character state codes are the same as country codes. In that case, the territory implies the state, not the country.
   For example, the territory code 'US' is unambiguous and means USA, but 'NL' means 'IN-NL' (Nagaland, India) rather than
   the Netherlands. You cannot use the standard 2-character country codes in web applications for this parameter.

   Path parameters:
     lat             : Latitude, range [-90, 90] (automatically limited to this range).
     lon             : Longitude, range [-180, 180] (automatically wrapped to this range).

   An additional filter can be specified to limit the results:
     mapcodes        : Same as without specifying a filter, returns all mapcodes.
     local           : Return the shortest local mapcode (not an international code). Note that multiple local
                       mapcodes may exist for a location, with different territories. This method returns the
                       shortest code. It does not check if the territory is the 'geographically correct' one
                       for the coordinates. To get the shortest code for a specific territory, you need to explicitly
                       specify the territory with 'territory=' parameter in the query.
     international   : Return the international mapcode.

   Query parameters:
     precision       : Precision, range [0..8] (default=0).
     territory       : Territory (country or state) to restrict results to (name or alphacode).
     country         : Country to restrict results to (name or alphacode).
     alphabet        : Alphabet to return results in.
     include         : Multiple options may be set, separated by comma's:
                         offset    = Include offset from mapcode center to lat/lon (in meters).
                         territory = Always include territory in result, also for territory 'AAA'.
                         alphabet  = Always the mapcodeInAlphabet, also if same as mapcode.
                         rectangle = Include the encompassing rectangle of a mapcode.

                       Note that you can use 'include=territory,alphabet' to ensure the territory code
                       is always present, as well as the translated territory and mapcode codes.
                       This can make processing the records easier in scripts, for example.

GET /mapcode/codes/{lat},{lon}/territories
   Look up the ranked list of mapcode territories containing a lat/lon. Backed by OSM
   admin-boundary data. Most specific territory first (subdivision before country),
   with smaller polygons ranked before larger ones at the same admin level.

   Path parameters:
     lat             : Latitude, range [-90, 90] (automatically limited to this range).
     lon             : Longitude, range [-180, 180] (automatically wrapped to this range).

   Returns: an object with a \`territories\` array of \`{alphaCode, parentAlphaCode?}\` entries.
   Empty list when no admin polygon contains the point (e.g., at sea).

GET /mapcode/coords/{code} [?context={territory} & include={include}]
   Convert a mapcode into a latitude/longitude pair.

   Path parameters:
     code            : Mapcode code (local or international). You can specify the territory in the code itself,
                       like 'NLD%20XX.XX' (note that the space is URL-encoded to '%20'), or you specifty the
                       territory separately in the 'context=' parameter, like 'XX.XX?context-NLD'.

   Query parameters:
     context         : Optional mapcode territory context (name or alphacode). The context is only used if the

                       code is ambiguous without it, otherwise it is ignored. For example, the context is ignored
                       when converting an international code (but it is not considered an error to provide it).
     include         : An additional option may be set:
                         rectangle = Include the encompassing rectangle of a mapcode.

GET /mapcode/territories [?offset={offset}&count={count}]
   Return a list of all territories.

GET /mapcode/territories/{territory} [?context={territory}]
   Return information for a single territory code.

   Path parameters:
     territory       : Territory to get info for (name or alphacode).

   Query parameters:
     context         : Territory context (optional, for disambiguation, name or alphacode).
                       The context can only be: USA IND CAN AUS MEX BRA RUS CHN ATA

GET /mapcode/alphabets [?offset={offset}&count={count}]
   Return a list of all alphabet codes.

GET /mapcode/alphabets/{alphabet}
   Return information for a specific alphabet.

   Path parameters:
     alphabet        : Alphabet to get info for.

General query parameters for methods which return a list of results:

   offset            : Return list from 'offset' (negative value start counting from end).
   count             : Return 'count' items at most.

JSON and XML Responses
----------------------

The REST API methods defined above obey the HTTP "Accept:" header. To retrieve JSON responses,
use "Accept:application/json", to retrieve XML responses, use "Accept:application/xml".

The default response type is JSON, if no "Accept:" header is specified.

Note that some browsers (such as FireFox) may silently insert an 'Accept:' header when using a
XMLHttpRequest in Javascript. This may lead to returning JSON in some browsers and XML in others.
It is advised to explicitly set the appropriate header in Javascript in such cases.

Alternatively, to retrieve XML or JSON responses if no "Accept:" header is specified, you can add
"/xml" or "/json" in the URL, directly after "/mapcode".

So, the following methods are supported as well and return XML or JSON by default:

    GET /mapcode/xml/version           GET /mapcode/json/version
    GET /mapcode/xml/status            GET /mapcode/json/status
    GET /mapcode/xml/codes             GET /mapcode/json/codes
    GET /mapcode/xml/coords            GET /mapcode/json/coords
    GET /mapcode/xml/territories       GET /mapcode/json/territories
    GET /mapcode/xml/alphabets         GET /mapcode/json/alphabets
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the HTML help page wrapping HELP_TEXT. */
export function getHelpHtml(version: string): string {
  return `<html><pre>\nMAPCODE API (${version}) (optimized version)\n-----------\n\n${HELP_TEXT}</pre></html>\n`;
}

/** Return a VersionDTO value for the given version string. */
export function getVersionDto(version: string): Record<string, unknown> {
  return buildVersion({ version });
}

export { versionSchema };

/**
 * Self-test: encode a known location and decode it back.
 * Returns true if the round-trip passes, false on any failure.
 */
export function getStatus(mapcodeService: MapcodeService): boolean {
  try {
    const territory: Territory = mapcodeService.resolveTerritory("NLD", null);
    const encoded = mapcodeService.encodeShortest(52.158974, 4.492479, territory);
    if (encoded === null || encoded.getCode() !== "QJM.1G") return false;
    const decoded = mapcodeService.decode("QJM.1G", territory);
    const latOk = Math.abs(decoded.getLatDeg() - 52.158974) < 1e-5;
    const lonOk = Math.abs(decoded.getLonDeg() - 4.492479) < 1e-5;
    return latOk && lonOk;
  } catch {
    return false;
  }
}
