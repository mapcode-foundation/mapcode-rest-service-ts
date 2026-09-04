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
import { createPool, MAINTENANCE_POOL_TUNING } from "./storage/pool.ts";
import { createRequestRecorder } from "./storage/request-recorder.ts";
import { queryReplay } from "./storage/replay-query.ts";
import { scanStats, querySizes } from "./storage/stats-query.ts";
import { createStatsService } from "./storage/stats-service.ts";
import { ensureSchema, ensureBtreeIndex } from "./storage/schema.ts";
import { buildServer } from "./server.ts";

async function main(): Promise<void> {
  loadEnvFileIfExists();
  const config = loadConfig();
  const boundaryService = await BoundaryService.load(config.bordersPath);
  const mapcodeService = createMapcodeService();

  // config.dbUrl contains a password — it must never be logged.
  // Two pools: API-path queries (30 s statement_timeout) and one maintenance
  // connection (1 h) for the hourly stats scan and the one-off btree build.
  const pool = createPool(config);
  const maintenancePool = createPool(config, MAINTENANCE_POOL_TUNING);
  const statsService = createStatsService((now) => scanStats(maintenancePool!, now), {
    sizes: () => querySizes(maintenancePool!),
  });
  const recorder = createRequestRecorder(pool, {
    onPersisted: (batch) => statsService.onPersisted(batch),
  });
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
            stats: async (now) => statsService.rows(now),
            storage: async () => statsService.storage(),
          }
        : undefined,
  });

  // Without a replay token nothing consumes the stats (loadConfig already
  // rejects a DB URL without a token, so this is belt-and-braces).
  if (maintenancePool !== null && config.replayToken !== null) {
    // Schema first (fast, transactional), then the concurrent btree build and
    // the warm-up scan — neither awaited: the API must not wait on a
    // potentially long index build or full-table scan. Message-only logging.
    // Separate try/catch per statement: a failed schema bootstrap (e.g. a
    // race with the recorder's own lazy ensureSchema) must not also skip the
    // btree build for the process lifetime.
    void (async () => {
      try {
        await ensureSchema(maintenancePool);
      } catch (err) {
        console.warn(`schema bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        await ensureBtreeIndex(maintenancePool);
      } catch (err) {
        console.warn(`btree index bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    void statsService.recalc();
  }

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
      statsService.close();
      // Not awaited: pool.end() waits for checked-out clients, and a scan in
      // flight may hold the maintenance connection for minutes. The scan is
      // idempotent and re-runs at the next start.
      void maintenancePool?.end().catch(() => {});
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
