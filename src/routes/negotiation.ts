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

export type OutputFormat = "json" | "xml";

/**
 * Determine the output format for a request.
 *
 * Rules (in priority order):
 *   1. Path starts with /mapcode/xml/  → format "xml"
 *   2. Path starts with /mapcode/json/ → format "json"
 *   3. Accept header contains application/xml → format "xml"
 *   4. Default → "json"
 *
 * Also returns the `underlyingPath`: the path with the /xml/ or /json/ prefix
 * segment removed so the same handler can serve all three URL forms.
 * E.g., /mapcode/xml/version → underlyingPath = /mapcode/version
 */
export function resolveFormat(
  rawUrl: string,
  acceptHeader?: string
): { format: OutputFormat; underlyingPath: string } {
  // Strip query string for path matching
  const pathOnly = rawUrl.split("?")[0];

  if (pathOnly.startsWith("/mapcode/xml/")) {
    return {
      format: "xml",
      underlyingPath: "/mapcode/" + pathOnly.slice("/mapcode/xml/".length),
    };
  }

  if (pathOnly.startsWith("/mapcode/json/")) {
    return {
      format: "json",
      underlyingPath: "/mapcode/" + pathOnly.slice("/mapcode/json/".length),
    };
  }

  // No path prefix — fall back to Accept header
  const format: OutputFormat =
    acceptHeader?.includes("application/xml") ? "xml" : "json";

  return { format, underlyingPath: pathOnly };
}
