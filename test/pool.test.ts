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

import net from "node:net";
import { inspect } from "node:util";
import { describe, it, expect, vi } from "vitest";
import { createPool, poolConfig, API_POOL_TUNING, MAINTENANCE_POOL_TUNING } from "../src/storage/pool.ts";

const AUTH_OK_READY = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]);
const TERMINATE = 0x58;
const SELECT_DONE_READY = Buffer.concat([
  Buffer.from([0x43, 0, 0, 0, 13]),
  Buffer.from("SELECT 0\0"),
  Buffer.from([0x5a, 0, 0, 0, 5, 0x49]),
]);

async function fakePostgres(): Promise<{ port: number; dropConnections: () => void; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let started = false;
    socket.on("data", (d) => {
      if (d[0] === TERMINATE) return;
      socket.write(started ? SELECT_DONE_READY : AUTH_OK_READY);
      started = true;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    dropConnections: () => sockets.forEach((s) => s.destroy()),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe("createPool", () => {
  it("survives an idle client losing its connection and warns without the connection string", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = await fakePostgres();
    const pool = createPool({ dbUrl: `postgres://u:secretpw@127.0.0.1:${db.port}/db`, dbCaCert: null })!;
    try {
      (await pool.connect()).release();
      db.dropConnections();

      const idleLost = expect.stringContaining("idle connection lost: Connection terminated unexpectedly");
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(idleLost));
      const warnings = warn.mock.calls.map((args) => inspect(args, { depth: 10 })).join("\n");
      expect(warnings).not.toContain(String(db.port));

      await expect(pool.query("SELECT 1")).resolves.toMatchObject({ rows: [] });

      const lastClientClosed = new Promise((resolve) => pool.once("remove", resolve));
      await pool.end();
      await lastClientClosed;
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      if (!pool.ended) await pool.end();
      await db.close();
    }
  });
});

describe("poolConfig", () => {
  it("returns null when dbUrl is null", () => {
    expect(poolConfig({ dbUrl: null, dbCaCert: null })).toBeNull();
  });

  it("passes the connection string through with the API statement timeout by default", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db?sslmode=require", dbCaCert: null });
    expect(cfg).toEqual({
      connectionString: "postgres://u:p@h:5432/db?sslmode=require",
      statement_timeout: 30_000,
      query_timeout: 35_000,
      connectionTimeoutMillis: 10_000,
    });
  });

  it("applies maintenance tuning: one connection, one-hour statement timeout", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db", dbCaCert: null }, MAINTENANCE_POOL_TUNING);
    expect(cfg).toEqual({
      connectionString: "postgres://u:p@h:5432/db",
      statement_timeout: 3_600_000,
      query_timeout: 3_605_000,
      connectionTimeoutMillis: 10_000,
      max: 1,
    });
  });

  it("exposes the tuning constants", () => {
    expect(API_POOL_TUNING).toEqual({ statementTimeoutMs: 30_000 });
    expect(MAINTENANCE_POOL_TUNING).toEqual({ statementTimeoutMs: 3_600_000, max: 1 });
  });

  it("enables verified TLS when a CA cert is configured", () => {
    const cfg = poolConfig({ dbUrl: "postgres://u:p@h:5432/db", dbCaCert: "PEM" });
    expect(cfg?.ssl).toEqual({ ca: "PEM", rejectUnauthorized: true });
  });
});
