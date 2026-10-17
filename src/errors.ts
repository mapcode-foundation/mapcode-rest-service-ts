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

export class ApiError extends Error {
  readonly httpStatus: number;
  constructor(httpStatus: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
  }
}

// Connecting to a host with several addresses ("localhost" is ::1 and
// 127.0.0.1) fails with an AggregateError whose message is empty, which would
// leave the logged cause blank, so name each address's failure instead.
export function loggableCause(err: unknown): unknown {
  if (!(err instanceof AggregateError) || err.message !== "") return err;
  return new Error(err.errors.map((inner) => (inner instanceof Error ? inner.message : String(inner))).join("; "));
}

export class ApiInvalidFormatError extends ApiError {
  constructor(field: string, value: unknown, expected: string) {
    super(400, `Invalid format for '${field}': '${String(value)}', expected: ${expected}`);
  }
}

export class ApiNotFoundError extends ApiError {
  constructor(message: string) { super(404, message); }
}

export class ApiForbiddenError extends ApiError {
  constructor(message: string) { super(403, message); }
}

export class ApiConflictError extends ApiError {
  constructor(message: string) { super(409, message); }
}

export class ApiIntegerOutOfRangeError extends ApiError {
  constructor(field: string, value: number, min: number, max: number) {
    super(400, `Value out of range for '${field}': ${value}, expected: [${min}, ${max}]`);
  }
}

export class ApiUnauthorizedError extends ApiError {
  constructor(message: string) { super(401, message); }
}
