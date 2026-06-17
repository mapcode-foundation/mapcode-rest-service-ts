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

import type { Schema } from "../serialization/types.ts";

// ---------------------------------------------------------------------------
// DRY helper: strip keys whose value is undefined (allows JSON serializer's
// isEmpty check to handle the remaining null/empty-array cases naturally).
// ---------------------------------------------------------------------------

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ===========================================================================
// VersionDTO
// ===========================================================================

export const versionSchema: Schema = {
  rootName: "version",
  jsonOrder: [{ name: "version", type: { kind: "string" } }],
  xmlOrder: [{ name: "version", type: { kind: "string" } }],
};

export interface VersionFields {
  version: string;
}

export function buildVersion(f: VersionFields): Record<string, unknown> {
  return compact({ version: f.version });
}

// ===========================================================================
// AlphabetDTO
// ===========================================================================

export const alphabetSchema: Schema = {
  rootName: "alphabet",
  jsonOrder: [{ name: "name", type: { kind: "string" } }],
  xmlOrder: [{ name: "name", type: { kind: "string" } }],
};

export interface AlphabetFields {
  name: string;
}

export function buildAlphabet(f: AlphabetFields): Record<string, unknown> {
  return compact({ name: f.name });
}

// ===========================================================================
// AlphabetsDTO
//
// JSON: {"total":N,"alphabets":[...]}
// XML NOTE: Java uses @XmlElement without @XmlElementWrapper, so alphabet
// items appear directly inside the root <alphabets> element alongside <total>,
// with NO inner <alphabets> wrapper. This "unwrapped objectList" pattern is
// NOT currently supported by the serializer (which always wraps objectList
// items in a container element). Until the serializer gains an
// "objectListUnwrapped" field kind, AlphabetsDTO XML serialization is
// unavailable. JSON serialization is fully supported.
// ===========================================================================

export const alphabetsSchema: Schema = {
  rootName: "alphabets",
  jsonOrder: [
    { name: "total", type: { kind: "int" } },
    { name: "alphabets", type: { kind: "objectList", itemName: "alphabet", schema: alphabetSchema } },
  ],
  // XML: items directly inside root (JAXB @XmlElement without @XmlElementWrapper).
  xmlOrder: [
    { name: "total", type: { kind: "int" } },
    { name: "alphabets", type: { kind: "objectListUnwrapped", itemName: "alphabet", schema: alphabetSchema } },
  ],
};

export interface AlphabetsFields {
  total: number;
  alphabets: Record<string, unknown>[];
}

export function buildAlphabets(f: AlphabetsFields): Record<string, unknown> {
  return compact({ total: f.total, alphabets: f.alphabets });
}

// ===========================================================================
// PointDTO
// ===========================================================================

export const pointSchema: Schema = {
  rootName: "point",
  jsonOrder: [
    { name: "latDeg", type: { kind: "double" } },
    { name: "lonDeg", type: { kind: "double" } },
  ],
  xmlOrder: [
    { name: "latDeg", type: { kind: "double" } },
    { name: "lonDeg", type: { kind: "double" } },
  ],
};

export interface PointFields {
  latDeg: number;
  lonDeg: number;
}

export function buildPoint(f: PointFields): Record<string, unknown> {
  return compact({ latDeg: f.latDeg, lonDeg: f.lonDeg });
}

// ===========================================================================
// RectangleDTO
// ===========================================================================

export const rectangleSchema: Schema = {
  rootName: "rectangle",
  jsonOrder: [
    { name: "southWest", type: { kind: "object", schema: pointSchema } },
    { name: "northEast", type: { kind: "object", schema: pointSchema } },
    { name: "center", type: { kind: "object", schema: pointSchema } },
  ],
  xmlOrder: [
    { name: "southWest", type: { kind: "object", schema: pointSchema } },
    { name: "northEast", type: { kind: "object", schema: pointSchema } },
    { name: "center", type: { kind: "object", schema: pointSchema } },
  ],
};

export interface RectangleFields {
  southWest: PointFields;
  northEast: PointFields;
  center?: PointFields;
}

export function buildRectangle(f: RectangleFields): Record<string, unknown> {
  return compact({
    southWest: buildPoint(f.southWest),
    northEast: buildPoint(f.northEast),
    center: f.center !== undefined ? buildPoint(f.center) : undefined,
  });
}

// ===========================================================================
// MapcodeDTO
// ===========================================================================

export const mapcodeSchema: Schema = {
  rootName: "mapcode",
  jsonOrder: [
    { name: "mapcode", type: { kind: "string" } },
    { name: "mapcodeInAlphabet", type: { kind: "string" } },
    { name: "territory", type: { kind: "string" } },
    { name: "territoryInAlphabet", type: { kind: "string" } },
    { name: "offsetMeters", type: { kind: "double" } },
    { name: "rectangle", type: { kind: "object", schema: rectangleSchema } },
  ],
  xmlOrder: [
    { name: "mapcode", type: { kind: "string" } },
    { name: "mapcodeInAlphabet", type: { kind: "string" } },
    { name: "territory", type: { kind: "string" } },
    { name: "territoryInAlphabet", type: { kind: "string" } },
    { name: "offsetMeters", type: { kind: "double" } },
    { name: "rectangle", type: { kind: "object", schema: rectangleSchema } },
  ],
};

export interface MapcodeFields {
  mapcode: string;
  mapcodeInAlphabet?: string;
  territory?: string;
  territoryInAlphabet?: string;
  offsetMeters?: number;
  rectangle?: RectangleFields;
}

export function buildMapcode(f: MapcodeFields): Record<string, unknown> {
  return compact({
    mapcode: f.mapcode,
    mapcodeInAlphabet: f.mapcodeInAlphabet,
    territory: f.territory,
    territoryInAlphabet: f.territoryInAlphabet,
    offsetMeters: f.offsetMeters,
    rectangle: f.rectangle !== undefined ? buildRectangle(f.rectangle) : undefined,
  });
}

// ===========================================================================
// MapcodeListDTO
//
// JSON: bare array (no wrapper object) — toJson(array, schema) special case.
// XML NOTE: Java @XmlRootElement(name="mapcodes") with items directly inside
// root (same unwrapped pattern as AlphabetsDTO). Serializer gap for XML.
// The jsonOrder[0] objectList is used by toJson for the bare-array case.
// ===========================================================================

export const mapcodeListSchema: Schema = {
  rootName: "mapcodes",
  jsonOrder: [
    { name: "mapcodes", type: { kind: "objectList", itemName: "mapcode", schema: mapcodeSchema } },
  ],
  // XML: items directly inside root (JAXB @XmlElement without @XmlElementWrapper).
  xmlOrder: [
    { name: "mapcodes", type: { kind: "objectListUnwrapped", itemName: "mapcode", schema: mapcodeSchema } },
  ],
};

// ===========================================================================
// TerritoryCandidateDTO
//
// When nested under MapcodesDTO.territories the XML item tag is "territory"
// (set by the parent objectList); standalone root is "territoryCandidate".
// ===========================================================================

export const territoryCandidateSchema: Schema = {
  rootName: "territoryCandidate",
  jsonOrder: [
    { name: "alphaCode", type: { kind: "string" } },
    { name: "parentAlphaCode", type: { kind: "string" } },
  ],
  xmlOrder: [
    { name: "alphaCode", type: { kind: "string" } },
    { name: "parentAlphaCode", type: { kind: "string" } },
  ],
};

export interface TerritoryCandidateFields {
  alphaCode: string;
  parentAlphaCode?: string;
}

export function buildTerritoryCandidate(f: TerritoryCandidateFields): Record<string, unknown> {
  return compact({ alphaCode: f.alphaCode, parentAlphaCode: f.parentAlphaCode });
}

// ===========================================================================
// MapcodesDTO
//
// JSON: {local?, international, mapcodes:[], territories?:[]}
// XML:  <mapcodes>
//         <local>...</local>?
//         <international>...</international>
//         <mapcodes><mapcode>...</mapcode>...</mapcodes>  ← @XmlElementWrapper
//         <territories><territory>...</territory>...</territories>? ← @XmlElementWrapper
//       </mapcodes>
// ===========================================================================

export const mapcodesSchema: Schema = {
  rootName: "mapcodes",
  jsonOrder: [
    { name: "local", type: { kind: "object", schema: mapcodeSchema } },
    { name: "international", type: { kind: "object", schema: mapcodeSchema } },
    { name: "mapcodes", type: { kind: "objectList", itemName: "mapcode", schema: mapcodeSchema } },
    { name: "territories", type: { kind: "objectList", itemName: "territory", schema: territoryCandidateSchema } },
  ],
  xmlOrder: [
    { name: "local", type: { kind: "object", schema: mapcodeSchema } },
    { name: "international", type: { kind: "object", schema: mapcodeSchema } },
    { name: "mapcodes", type: { kind: "objectList", itemName: "mapcode", schema: mapcodeSchema } },
    { name: "territories", type: { kind: "objectList", itemName: "territory", schema: territoryCandidateSchema } },
  ],
};

export interface MapcodesFields {
  local?: Record<string, unknown>;
  international: Record<string, unknown>;
  mapcodes: Record<string, unknown>[];
  territories?: Record<string, unknown>[];
}

export function buildMapcodes(f: MapcodesFields): Record<string, unknown> {
  return compact({
    local: f.local,
    international: f.international,
    mapcodes: f.mapcodes,
    territories: f.territories,
  });
}

// ===========================================================================
// TerritoryDTO
//
// JSON order: aliases (only when non-empty), fullNameAliases (only when non-empty),
//             alphaCode, alphaCodeMinimalUnambiguous, alphaCodeMinimal, fullName,
//             parentTerritory (only when present), alphabets
//
// XML order:  alphaCode, alphaCodeMinimalUnambiguous, alphaCodeMinimal, fullName,
//             parentTerritory?, aliases (→ <aliases/> when empty),
//             fullNameAliases (→ <fullNameAliases/> when empty),
//             alphabets (wrapped objectList)
// ===========================================================================

export const territorySchema: Schema = {
  rootName: "territory",
  jsonOrder: [
    { name: "aliases", type: { kind: "stringList", itemName: "alias" } },
    { name: "fullNameAliases", type: { kind: "stringList", itemName: "fullNameAlias" } },
    { name: "alphaCode", type: { kind: "string" } },
    { name: "alphaCodeMinimalUnambiguous", type: { kind: "string" } },
    { name: "alphaCodeMinimal", type: { kind: "string" } },
    { name: "fullName", type: { kind: "string" } },
    { name: "parentTerritory", type: { kind: "string" } },
    { name: "alphabets", type: { kind: "objectList", itemName: "alphabet", schema: alphabetSchema } },
  ],
  xmlOrder: [
    { name: "alphaCode", type: { kind: "string" } },
    { name: "alphaCodeMinimalUnambiguous", type: { kind: "string" } },
    { name: "alphaCodeMinimal", type: { kind: "string" } },
    { name: "fullName", type: { kind: "string" } },
    { name: "parentTerritory", type: { kind: "string" } },
    { name: "aliases", type: { kind: "stringList", itemName: "alias" } },
    { name: "fullNameAliases", type: { kind: "stringList", itemName: "fullNameAlias" } },
    { name: "alphabets", type: { kind: "objectList", itemName: "alphabet", schema: alphabetSchema } },
  ],
};

export interface TerritoryFields {
  alphaCode: string;
  alphaCodeMinimalUnambiguous: string;
  alphaCodeMinimal: string;
  fullName: string;
  parentTerritory?: string;
  aliases?: string[];
  fullNameAliases?: string[];
  alphabets: Record<string, unknown>[];
}

export function buildTerritory(f: TerritoryFields): Record<string, unknown> {
  // aliases and fullNameAliases: keep empty array so XML renders <aliases/>/<fullNameAliases/>
  // but in JSON the isEmpty() check in the serializer will omit empty arrays.
  return compact({
    aliases: f.aliases ?? [],
    fullNameAliases: f.fullNameAliases ?? [],
    alphaCode: f.alphaCode,
    alphaCodeMinimalUnambiguous: f.alphaCodeMinimalUnambiguous,
    alphaCodeMinimal: f.alphaCodeMinimal,
    fullName: f.fullName,
    parentTerritory: f.parentTerritory,
    alphabets: f.alphabets,
  });
}

// ===========================================================================
// TerritoriesDTO
//
// JSON: {"total":N,"territories":[...]}
// XML NOTE: Same unwrapped pattern as AlphabetsDTO — territory items appear
// directly inside the root <territories> element alongside <total>, with no
// inner <territories> wrapper. Serializer gap for XML; JSON only.
// ===========================================================================

export const territoriesSchema: Schema = {
  rootName: "territories",
  jsonOrder: [
    { name: "total", type: { kind: "int" } },
    { name: "territories", type: { kind: "objectList", itemName: "territory", schema: territorySchema } },
  ],
  // XML: items directly inside root (JAXB @XmlElement without @XmlElementWrapper).
  xmlOrder: [
    { name: "total", type: { kind: "int" } },
    { name: "territories", type: { kind: "objectListUnwrapped", itemName: "territory", schema: territorySchema } },
  ],
};

export interface TerritoriesFields {
  total: number;
  territories: Record<string, unknown>[];
}

export function buildTerritories(f: TerritoriesFields): Record<string, unknown> {
  return compact({ total: f.total, territories: f.territories });
}

// ===========================================================================
// TerritoryCandidatesDTO
//
// JSON: {"territories":[...]}
// XML NOTE: Java uses @XmlElement(name="territoryCandidate") without
// @XmlElementWrapper, so items appear directly inside root <territories>.
// Same serializer gap as AlphabetsDTO/TerritoriesDTO for XML.
// ===========================================================================

export const territoryCandidatesSchema: Schema = {
  rootName: "territories",
  jsonOrder: [
    // emitEmpty: standalone TerritoryCandidatesDTO has no @JsonInclude(NON_EMPTY),
    // so an empty candidate list serialises as "territories":[] (not omitted).
    { name: "territories", type: { kind: "objectList", itemName: "territoryCandidate", schema: territoryCandidateSchema }, emitEmpty: true },
  ],
  // XML: items directly inside root as <territoryCandidate> (JAXB @XmlElement
  // without @XmlElementWrapper).
  xmlOrder: [
    { name: "territories", type: { kind: "objectListUnwrapped", itemName: "territoryCandidate", schema: territoryCandidateSchema } },
  ],
};

export interface TerritoryCandidatesFields {
  territories: Record<string, unknown>[];
}

export function buildTerritoryCandidates(f: TerritoryCandidatesFields): Record<string, unknown> {
  return compact({ territories: f.territories });
}
