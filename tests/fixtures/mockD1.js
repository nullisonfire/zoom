const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class MockD1Database {
  constructor(dbPath = ':memory:') {
    this.pyProcess = spawn('python3', [path.join(__dirname, 'sqlite_bridge.py'), dbPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.pending = new Map();
    this.reqId = 0;
    this.buffer = '';

    this.pyProcess.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop(); // Keep unfinished line
      for (const line of lines) {
        if (!line.trim()) continue;
        const res = JSON.parse(line);
        const resolver = this.pending.get(res.id);
        if (resolver) {
          this.pending.delete(res.id);
          if (res.success) {
            resolver.resolve(res);
          } else {
            resolver.reject(new Error(res.error));
          }
        }
      }
    });
  }

  async send(sql, params = []) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.pending.set(id, { resolve, reject });
      this.pyProcess.stdin.write(JSON.stringify({ id, sql, params }) + '\n');
    });
  }

  async exec(sql) {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await this.send(stmt);
    }
  }

  prepare(sql) {
    const db = this;
    let boundParams = [];

    return {
      bind(...params) {
        boundParams = params;
        return this;
      },
      async run() {
        const res = await db.send(sql, boundParams);
        return {
          success: true,
          meta: { changes: res.changes },
          results: res.results || [],
        };
      },
      async first(col) {
        const res = await db.send(sql, boundParams);
        if (!res.results || res.results.length === 0) return null;
        const row = res.results[0];
        return col ? row[col] : row;
      },
      async all() {
        const res = await db.send(sql, boundParams);
        return {
          results: res.results || [],
          success: true,
        };
      },
    };
  }

  close() {
    this.pyProcess.kill();
  }
}

async function createMockD1() {
  const db = new MockD1Database();
  // Apply initial migration
  const migrationPath = path.resolve(__dirname, '../../migrations/0001_initial_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await db.exec(migrationSql);
  return db;
}

module.exports = { MockD1Database, createMockD1 };
