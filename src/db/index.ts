import { createRequire } from "node:module";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { runMigrations } from "./migrations.js";

const require = createRequire(import.meta.url);

export interface SqlStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqlDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
  close(): void;
}

export interface DbOptions {
  path?: string;
}

export class LaelDb {
  readonly db: SqlDatabase;

  constructor(options: DbOptions = {}) {
    const dbPath = options.path ?? process.env.LAEL_DB_PATH ?? "./lael.db";
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = openSqliteDatabase(dbPath);
    runMigrations(this.db);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = fn();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

export function createDb(options: DbOptions = {}): LaelDb {
  return new LaelDb(options);
}

function openSqliteDatabase(dbPath: string): SqlDatabase {
  try {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    return new DatabaseSync(dbPath) as SqlDatabase;
  } catch (nodeSqliteError) {
    try {
      const BetterSqlite3 = require("better-sqlite3") as new (path: string) => SqlDatabase;
      return new BetterSqlite3(dbPath);
    } catch {
      throw new Error(
        `No SQLite driver available. Use Node with node:sqlite support or install better-sqlite3. Cause: ${
          nodeSqliteError instanceof Error ? nodeSqliteError.message : "node:sqlite unavailable"
        }`,
      );
    }
  }
}
