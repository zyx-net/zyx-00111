import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database | null = null;
const DB_PATH = './data/energy_review.db';

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    createTables(db);
    insertDefaultRules(db);
    saveDatabase();
  }

  return db;
}

function createTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      batch_no TEXT UNIQUE NOT NULL,
      imported_at TEXT NOT NULL,
      total_count INTEGER DEFAULT 0,
      anomaly_count INTEGER DEFAULT 0,
      imported_by TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS meter_readings (
      id TEXT PRIMARY KEY,
      meter_id TEXT NOT NULL,
      reading_date TEXT NOT NULL,
      raw_value REAL NOT NULL,
      corrected_value REAL,
      meter_type TEXT NOT NULL,
      batch_id TEXT,
      status TEXT DEFAULT 'RAW',
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      reading_id TEXT NOT NULL,
      anomaly_type TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      resolved_at TEXT,
      resolved_by TEXT,
      remark TEXT,
      FOREIGN KEY (reading_id) REFERENCES meter_readings(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      anomaly_id TEXT NOT NULL,
      original_value REAL NOT NULL,
      new_value REAL NOT NULL,
      operator TEXT NOT NULL,
      operated_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      reading_id TEXT,
      FOREIGN KEY (anomaly_id) REFERENCES anomalies(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS rule_configs (
      id TEXT PRIMARY KEY,
      config_key TEXT NOT NULL,
      config_value TEXT NOT NULL,
      version INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS export_records (
      id TEXT PRIMARY KEY,
      export_type TEXT NOT NULL,
      params TEXT,
      downloaded_at TEXT NOT NULL,
      downloaded_by TEXT
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_meter_readings_batch ON meter_readings(batch_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_anomalies_reading ON anomalies(reading_id)`);
}

function insertDefaultRules(database: Database) {
  const now = new Date().toISOString();
  const defaultRules = [
    { key: 'jumpThreshold', value: '50', label: '跳变阈值', description: '跳变异常的判定阈值（百分比）' },
    { key: 'missingDays', value: '3', label: '缺失判定天数', description: '超过N天无读数则判定为缺失' },
    { key: 'rollbackEnabled', value: 'true', label: '回退检测开关', description: '是否启用回退检测' },
  ];

  defaultRules.forEach((rule, index) => {
    database.run(
      `INSERT INTO rule_configs (id, config_key, config_value, version, effective_from, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [`rule_${index + 1}`, rule.key, rule.value, 1, now, now]
    );
  });
}

export function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
