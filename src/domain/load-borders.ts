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

import { readFile } from "node:fs/promises";
import { Borders, BordersFormatError, bordersUrl } from "mapcode-ts-borders";

/**
 * Loads the borders: the file at {@code bordersPath}, or the data bundled with
 * mapcode-ts-borders when it is null.
 *
 * @throws If the file cannot be read, or is not a mapcode-ts-borders .mcb file.
 */
export async function loadBorders(bordersPath: string | null): Promise<Borders> {
  const location = bordersPath ?? bordersUrl;
  const label = bordersPath ?? fileLabel(bordersUrl);
  let bytes: Buffer;
  try {
    bytes = await readFile(location);
  } catch (e) {
    const hint = bordersPath === null
      ? ""
      : ". Unset MAPCODE_BORDERS_PATH to use the data bundled with mapcode-ts-borders (older setups point it at the removed ./data/borders.fgb)";
    throw new Error(`Borders file not readable: ${label}${hint}`, { cause: e });
  }
  try {
    return Borders.fromBytes(bytes);
  } catch (e) {
    if (e instanceof BordersFormatError) {
      throw new Error(
        `Borders file is not a valid mapcode-ts-borders .mcb file: ${label}. ` +
          "MAPCODE_BORDERS_PATH must point at a mapcode-ts-borders .mcb file, " +
          "or be unset to use the bundled data (old deployments point it at a .fgb file).",
        { cause: e },
      );
    }
    throw e;
  }
}

function fileLabel(url: URL): string {
  return url.protocol === "file:" ? decodeURIComponent(url.pathname) : url.href;
}
