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

const PROLOGUE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function fieldXml(value: unknown, field: Field): string {
  const name = field.name;
  const kind = field.type.kind;

  // objectListUnwrapped: items emitted directly at parent level, no wrapper element.
  // null/undefined/[] → render no item children. The list's root element is always
  // emitted by toXml(), so an empty unwrapped list serialises as the bare root with
  // no children, e.g. <territories></territories>. This is the chosen well-formed,
  // JSON-consistent at-sea response: JSON {"territories":[]} ↔ XML <territories></territories>.
  // emitEmpty (set on the JSON side to force "[]" instead of omission) needs no extra
  // handling here because the unwrapped root is never omitted — an empty list and an
  // emitEmpty empty list produce identical, well-formed XML.
  if (kind === "objectListUnwrapped") {
    if (value == null) return "";
    const arr = value as Record<string, unknown>[];
    if (arr.length === 0) return "";
    const t = field.type;
    return arr.map((o) => `<${t.itemName}>${objectXmlBody(o, t.schema)}</${t.itemName}>`).join("");
  }

  // stringList / objectList: distinguish null/undefined (omit) from [] (self-closing).
  if (kind === "stringList" || kind === "objectList") {
    if (value == null) return ""; // undefined or null → omit element entirely
    const arr = value as unknown[];
    if (arr.length === 0) return `<${name}/>`; // present but empty → <name/>
    if (kind === "stringList") {
      const t = field.type;
      const items = arr.map((s) => `<${t.itemName}>${escapeXml(s as string)}</${t.itemName}>`).join("");
      return `<${name}>${items}</${name}>`;
    }
    // objectList, non-empty
    const t = field.type;
    const items = arr.map((o) => `<${t.itemName}>${objectXmlBody(o as Record<string, unknown>, t.schema)}</${t.itemName}>`).join("");
    return `<${name}>${items}</${name}>`;
  }

  if (isNullish(value)) return "";
  switch (kind) {
    case "string": return `<${name}>${escapeXml(value as string)}</${name}>`;
    case "boolean": return `<${name}>${value ? "true" : "false"}</${name}>`;
    case "int": return `<${name}>${String(value)}</${name}>`;
    case "double": return `<${name}>${formatDouble(value as number)}</${name}>`;
    case "object": return `<${name}>${objectXmlBody(value as Record<string, unknown>, field.type.schema)}</${name}>`;
  }
}

function objectXmlBody(value: Record<string, unknown>, schema: Schema): string {
  return schema.xmlOrder.map((f) => fieldXml(value[f.name], f)).join("");
}

/** Serialize a DTO object to XML with the fixed prologue and root element. */
export function toXml(value: Record<string, unknown>, schema: Schema): string {
  return `${PROLOGUE}<${schema.rootName}>${objectXmlBody(value, schema)}</${schema.rootName}>`;
}
