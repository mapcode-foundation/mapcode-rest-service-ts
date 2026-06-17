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

export type FieldType =
  | { kind: "string" }
  | { kind: "double" }
  | { kind: "int" }
  | { kind: "boolean" }
  | { kind: "object"; schema: Schema }
  | { kind: "objectList"; itemName: string; schema: Schema }
  | { kind: "objectListUnwrapped"; itemName: string; schema: Schema }
  | { kind: "stringList"; itemName: string };

export interface Field {
  name: string;
  type: FieldType;
  /**
   * When true, an empty array value is emitted explicitly (JSON `[]`) instead of
   * being omitted. Mirrors a JAXB/Jackson list field WITHOUT @JsonInclude(NON_EMPTY),
   * e.g. TerritoryCandidatesDTO.territories.
   */
  emitEmpty?: boolean;
}

export interface Schema {
  rootName: string;
  jsonOrder: Field[];
  xmlOrder: Field[];
}
