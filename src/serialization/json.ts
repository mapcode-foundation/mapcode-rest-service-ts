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

import type { Field, Schema } from "./types.ts";
import { formatDouble } from "./format.ts";

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function fieldJson(value: unknown, field: Field): string | null {
  // Honor emitEmpty: an empty array is rendered as "[]" rather than omitted.
  if (field.emitEmpty && Array.isArray(value) && value.length === 0) {
    return "[]";
  }
  if (isEmpty(value)) return null;
  switch (field.type.kind) {
    case "string": return JSON.stringify(value);
    case "boolean": return value ? "true" : "false";
    case "int": return String(value);
    case "double": return formatDouble(value as number);
    case "object": return objectJson(value as Record<string, unknown>, field.type.schema);
    case "stringList":
      return `[${(value as string[]).map((s) => JSON.stringify(s)).join(",")}]`;
    case "objectList":
    case "objectListUnwrapped": {
      const schema = field.type.schema;
      return `[${(value as Record<string, unknown>[]).map((o) => objectJson(o, schema)).join(",")}]`;
    }
  }
}

function objectJson(value: Record<string, unknown>, schema: Schema): string {
  const parts: string[] = [];
  for (const field of schema.jsonOrder) {
    const rendered = fieldJson(value[field.name], field);
    if (rendered !== null) parts.push(`${JSON.stringify(field.name)}:${rendered}`);
  }
  return `{${parts.join(",")}}`;
}

/** Serialize a DTO object, or a bare top-level array (MapcodeListDTO), to JSON. */
export function toJson(value: Record<string, unknown> | unknown[], schema: Schema): string {
  if (Array.isArray(value)) {
    // Bare list DTO: schema.jsonOrder[0] describes the item objectList.
    const field = schema.jsonOrder[0];
    if (field?.type.kind !== "objectList") throw new Error("Array schema must be an objectList");
    const itemSchema = field.type.schema;
    return `[${value.map((o) => objectJson(o as Record<string, unknown>, itemSchema)).join(",")}]`;
  }
  return objectJson(value, schema);
}
