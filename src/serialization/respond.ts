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

import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import type { Schema } from "./types.ts";
import type { OutputFormat } from "../routes/negotiation.ts";
import { toJson } from "./json.ts";
import { toXml } from "./xml.ts";

const JSON_CT = "application/json;charset=UTF-8";
const XML_CT = "application/xml;charset=UTF-8";
const HTML_CT = "text/html;charset=UTF-8";

/**
 * Send a serialized DTO as JSON or XML depending on the negotiated format.
 */
export function respond(
  reply: FastifyReply,
  format: OutputFormat,
  value: Record<string, unknown>,
  schema: Schema
): FastifyReply {
  if (format === "xml") {
    return reply.code(200).header("content-type", XML_CT).send(toXml(value, schema));
  }
  return reply.code(200).header("content-type", JSON_CT).send(toJson(value, schema));
}

/**
 * Send a bare top-level list DTO (e.g. MapcodeListDTO). In JSON this is a bare
 * array `[...]`; in XML the items are wrapped in the schema's root element using
 * the (unwrapped) objectList described by schema.xmlOrder[0].
 */
export function respondList(
  reply: FastifyReply,
  format: OutputFormat,
  items: Record<string, unknown>[],
  schema: Schema
): FastifyReply {
  if (format === "xml") {
    // Re-use the object serializer with a wrapper holding the list under the
    // single (objectListUnwrapped) field declared in xmlOrder.
    const field = schema.xmlOrder[0];
    const wrapper = { [field.name]: items };
    return reply.code(200).header("content-type", XML_CT).send(toXml(wrapper, schema));
  }
  return reply.code(200).header("content-type", JSON_CT).send(toJson(items, schema));
}

/**
 * Send an error body in the negotiated format.
 * JSON: {"message":<msg>,"status":<code>}
 * XML:  <?xml version="1.0" encoding="UTF-8" standalone="yes"?><exception><message>..</message><status>..</status></exception>
 */
export function respondError(
  reply: FastifyReply,
  format: OutputFormat,
  httpStatus: number,
  message: string
): FastifyReply {
  if (format === "xml") {
    const body =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<exception><message>${escapeXml(message)}</message><status>${httpStatus}</status></exception>`;
    return reply.code(httpStatus).header("content-type", XML_CT).send(body);
  }
  if (httpStatus === 403) {
    const body = {
      message: `ApiForbiddenException; ${message}`,
      reference: `REF-${randomUUID().toUpperCase()}-X`,
      time: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      errors: null,
    };
    return reply.code(httpStatus).header("content-type", JSON_CT).send(JSON.stringify(body));
  }
  const body = `{"message":${JSON.stringify(message)},"status":${httpStatus}}`;
  return reply.code(httpStatus).header("content-type", JSON_CT).send(body);
}

/**
 * Send a raw HTML response.
 */
export function respondHtml(reply: FastifyReply, html: string): FastifyReply {
  return reply.code(200).header("content-type", HTML_CT).send(html);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
