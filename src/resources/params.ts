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

/**
 * The maximum value of a Java 32-bit signed integer.
 * Used as the upper bound when validating count/offset parameters that Java
 * declares as `int` — values above this would fail Java's Integer.valueOf()
 * with a NumberFormatException and result in a 400 response.
 */
export const INTEGER_MAX = 2147483647;

/**
 * The minimum value of a Java 32-bit signed integer.
 * Values below this would likewise fail Java's Integer.valueOf().
 */
export const INTEGER_MIN = -2147483648;

/**
 * Strict integer parse mirroring Java's Integer.valueOf(StringUtils.nullToEmpty(s)):
 * - Returns null for empty string.
 * - Returns null for any non-integer text (decimals like "1.0", whitespace, etc.).
 * - Returns null for integers outside the 32-bit signed range [INTEGER_MIN, INTEGER_MAX]
 *   (Java declares count/offset as `int`, so out-of-range values fail param conversion
 *   resulting in a 400, not a 200).
 * A leading sign and pure digits are accepted; anything else returns null.
 */
export function parseIntStrict(s: string): number | null {
  if (s === "") return null;
  if (!/^[+-]?\d+$/.test(s)) return null;
  // Use BigInt to detect overflow before converting to Number, since JavaScript's
  // parseInt silently truncates large values via floating-point precision loss.
  let n: bigint;
  try {
    n = BigInt(s);
  } catch {
    return null;
  }
  if (n < BigInt(INTEGER_MIN) || n > BigInt(INTEGER_MAX)) return null;
  return Number(n);
}
