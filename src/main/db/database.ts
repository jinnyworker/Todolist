import fs from 'node:fs';
import path from 'node:path';

import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';

import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export type Params = SqlValue[];
export type Row = Record<string, SqlValue>;

/**
 * sql.js(WebAssembly SQLite) 래퍼.
 * 네이티브 빌드 없이 표준 SQLite 파일을 읽고 쓰기 위해 sql.js를 쓴다.
 * 메모리에서 작업하고 변경이 있을 때 파일로 원자적으로 저장한다.
 */
export class Database {
  private dirty = false;
  private txDepth = 0;

  private constructor(
    private readonly db: SqlJsDatabase,
    private readonly filePath: string | null,
  ) {
    db.run('PRAGMA foreign_keys = ON;');
  }

  /** filePath가 null이면 메모리 DB (테스트용). */
  static async open(filePath: string | null): Promise<Database> {
    const SQL = await initSqlJs();
    const data = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined;
    const database = new Database(new SQL.Database(data), filePath);
    database.migrate();
    return database;
  }

  all<T = Row>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows as T[];
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** INSERT/UPDATE/DELETE 실행. 마지막 삽입 ID와 변경 행 수를 돌려준다. */
  run(sql: string, params: Params = []): { lastId: number; changes: number } {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const lastId = Number(this.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0);
    if (changes > 0) this.dirty = true;
    return { lastId, changes };
  }

  /** 중첩 호출을 허용하는 트랜잭션. 바깥 트랜잭션에서만 COMMIT/ROLLBACK 한다. */
  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn();
    this.db.run('BEGIN');
    this.txDepth++;
    try {
      const result = fn();
      this.db.run('COMMIT');
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    } finally {
      this.txDepth--;
    }
  }

  /** 변경이 있었으면 파일에 저장한다. 임시 파일에 쓴 뒤 교체해 손상을 막는다. */
  save(): void {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, this.db.export());
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.save();
    this.db.close();
  }

  private migrate(): void {
    const current = Number(this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
    if (current >= SCHEMA_VERSION) return;
    this.db.exec(SCHEMA_SQL);
    this.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    this.dirty = true;
  }
}
