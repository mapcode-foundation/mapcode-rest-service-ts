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

import { loadConfig, loadEnvFileIfExists } from "./config.ts";
import { BoundaryService } from "./domain/boundary-service.ts";
import { createMapcodeService } from "./domain/mapcode-service.ts";
import { createPool } from "./storage/pool.ts";
import { createRequestRecorder } from "./storage/request-recorder.ts";
import { queryReplay } from "./storage/replay-query.ts";
import { queryStats, queryStorage } from "./storage/stats-query.ts";
import { buildServer } from "./server.ts";

async function main(): Promise<void> {
  loadEnvFileIfExists();
  const config = loadConfig();
  const boundaryService = await BoundaryService.load(config.bordersPath);
  const mapcodeService = createMapcodeService();

  // config.dbUrl contains a password — it must never be logged.
  const pool = createPool(config);
  const recorder = createRequestRecorder(pool);
  const app = buildServer({
    mapcodeService,
    boundaryService,
    version: config.version,
    logger: { level: "info" },
    // The no-op recorder's close() is harmless, so it's still created
    // unconditionally above to keep shutdown code uniform — but only wired
    // into the server (installing the recording hook) when a pool exists.
    recorder: pool !== null ? recorder : undefined,
    replay:
      pool !== null && config.replayToken !== null
        ? {
            token: config.replayToken,
            query: (args) => queryReplay(pool, args),
            stats: (now) => queryStats(pool, now),
            storage: () => queryStorage(pool),
          }
        : undefined,
  });

  // A normal deploy stops the service with a signal: drain the recorder so
  // no recorded events are lost. (recorder.close() flushes before resolving.)
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      let failed = false;
      const step = async (name: string, run: () => Promise<unknown>): Promise<void> => {
        try {
          await run();
        } catch (err) {
          failed = true;
          // Log only the message — config values (the DB URL carries a password) must never reach logs.
          console.error(`shutdown: ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      await step("app.close", () => app.close());
      await step("recorder drain", () => recorder.close());
      await step("pool.end", async () => pool?.end());
      process.exit(failed ? 1 : 0);
    })();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`mapcode-rest-service-ts listening on :${config.port} (version ${config.version})`);
  if (pool !== null) {
    console.log("request recording enabled; /mapcode/replay and /mapcode/replay/stats registered");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
