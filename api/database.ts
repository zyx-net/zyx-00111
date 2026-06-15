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
    db.run('PRAGMA foreign_keys = ON');
    
    migrateDatabaseSchema(db);
  } else {
    db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    createTables(db);
    insertDefaultRules(db);
    saveDatabase();
  }

  return db;
}

function migrateDatabaseSchema(database: Database) {
  const tableInfo = database.exec("PRAGMA table_info(export_records)");
  if (tableInfo.length === 0) return;
  
  const columns = tableInfo[0].values.map(row => row[1]);
  
  if (!columns.includes('file_name')) {
    database.run("ALTER TABLE export_records ADD COLUMN file_name TEXT");
  }
  
  if (!columns.includes('record_count')) {
    database.run("ALTER TABLE export_records ADD COLUMN record_count INTEGER DEFAULT 0");
  }
  
  migrateDeliveryPackageTables(database);
  migrateChangeCenterTables(database);
}

function migrateDeliveryPackageTables(database: Database) {
  const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'delivery_%'");
  
  if (tables.length === 0) {
    createDeliveryPackageTables(database);
  } else {
    const existingTables = tables[0].values.map(row => row[0]);
    
    if (!existingTables.includes('delivery_packages')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_packages (
          id TEXT PRIMARY KEY,
          package_name TEXT NOT NULL,
          package_no TEXT UNIQUE NOT NULL,
          description TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          record_count INTEGER DEFAULT 0,
          file_count INTEGER DEFAULT 0,
          total_size INTEGER DEFAULT 0,
          file_path TEXT,
          version INTEGER DEFAULT 1,
          locked_by TEXT,
          locked_at TEXT,
          manifest_snapshot TEXT
        )
      `);
    }
    
    if (!existingTables.includes('delivery_package_records')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_package_records (
          id TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          reading_id TEXT,
          anomaly_id TEXT,
          batch_id TEXT,
          record_type TEXT NOT NULL,
          included_at TEXT NOT NULL,
          included_by TEXT NOT NULL,
          FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('delivery_package_tasks')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_package_tasks (
          id TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          task_type TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          config_snapshot TEXT,
          FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('delivery_package_downloads')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_package_downloads (
          id TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          downloaded_by TEXT NOT NULL,
          downloaded_at TEXT NOT NULL,
          file_version TEXT,
          file_path TEXT,
          record_count INTEGER DEFAULT 0,
          ip_address TEXT,
          FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('delivery_package_audit_logs')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_package_audit_logs (
          id TEXT PRIMARY KEY,
          package_id TEXT,
          operation TEXT NOT NULL,
          operator TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details TEXT,
          ip_address TEXT,
          result TEXT,
          created_at TEXT NOT NULL
        )
      `);
    }
    
    if (!existingTables.includes('delivery_package_versions')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS delivery_package_versions (
          id TEXT PRIMARY KEY,
          package_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          file_path TEXT,
          record_count INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          change_summary TEXT,
          is_active INTEGER DEFAULT 0,
          FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
        )
      `);
    }
    
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_packages_status ON delivery_packages(status)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_packages_created_by ON delivery_packages(created_by)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_records_package ON delivery_package_records(package_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_tasks_package ON delivery_package_tasks(package_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_downloads_package ON delivery_package_downloads(package_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_audit_package ON delivery_package_audit_logs(package_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_versions_package ON delivery_package_versions(package_id)`);
    
    saveDatabase();
  }
}

function createDeliveryPackageTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_packages (
      id TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      package_no TEXT UNIQUE NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      record_count INTEGER DEFAULT 0,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      file_path TEXT,
      version INTEGER DEFAULT 1,
      locked_by TEXT,
      locked_at TEXT,
      manifest_snapshot TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_package_records (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      reading_id TEXT,
      anomaly_id TEXT,
      batch_id TEXT,
      record_type TEXT NOT NULL,
      included_at TEXT NOT NULL,
      included_by TEXT NOT NULL,
      FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_package_tasks (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      progress INTEGER DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      config_snapshot TEXT,
      FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_package_downloads (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      downloaded_by TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      file_version TEXT,
      file_path TEXT,
      record_count INTEGER DEFAULT 0,
      ip_address TEXT,
      FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_package_audit_logs (
      id TEXT PRIMARY KEY,
      package_id TEXT,
      operation TEXT NOT NULL,
      operator TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      result TEXT,
      created_at TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS delivery_package_versions (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      file_path TEXT,
      record_count INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      change_summary TEXT,
      is_active INTEGER DEFAULT 0,
      FOREIGN KEY (package_id) REFERENCES delivery_packages(id) ON DELETE CASCADE
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_packages_status ON delivery_packages(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_packages_created_by ON delivery_packages(created_by)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_records_package ON delivery_package_records(package_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_tasks_package ON delivery_package_tasks(package_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_downloads_package ON delivery_package_downloads(package_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_audit_package ON delivery_package_audit_logs(package_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_delivery_package_versions_package ON delivery_package_versions(package_id)`);
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
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
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
      rule_snapshot TEXT,
      FOREIGN KEY (reading_id) REFERENCES meter_readings(id) ON DELETE CASCADE
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
      rule_snapshot TEXT,
      FOREIGN KEY (anomaly_id) REFERENCES anomalies(id) ON DELETE CASCADE
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
      downloaded_by TEXT,
      file_name TEXT,
      record_count INTEGER DEFAULT 0
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'REVIEWER',
      created_at TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      operator TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      operated_at TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS batch_snapshots (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      anomaly_count INTEGER DEFAULT 0,
      status_summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    )
  `);

  createDeliveryPackageTables(database);

  migrateChangeCenterTables(database);

  database.run(`CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_meter_readings_batch ON meter_readings(batch_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_anomalies_reading ON anomalies(reading_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_operation_logs_operator ON operation_logs(operator)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_operation_logs_type ON operation_logs(operation_type)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_corrections_anomaly ON corrections(anomaly_id)`);
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

  const defaultUsers = [
    { id: 'user_admin', username: 'admin', role: 'ADMIN' },
    { id: 'user_supervisor', username: 'supervisor', role: 'SUPERVISOR' },
    { id: 'user_reviewer1', username: 'reviewer_1', role: 'REVIEWER' },
    { id: 'user_reviewer2', username: 'reviewer_2', role: 'REVIEWER' },
  ];

  defaultUsers.forEach((user) => {
    database.run(
      `INSERT INTO users (id, username, role, created_at) VALUES (?, ?, ?, ?)`,
      [user.id, user.username, user.role, now]
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

function migrateChangeCenterTables(database: Database) {
  const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'change_%'");
  
  if (tables.length === 0) {
    createChangeCenterTables(database);
  } else {
    const existingTables = tables[0].values.map(row => row[0]);
    
    if (!existingTables.includes('change_orders')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_orders (
          id TEXT PRIMARY KEY,
          order_no TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          order_type TEXT NOT NULL,
          status TEXT DEFAULT 'DRAFT',
          priority TEXT DEFAULT 'NORMAL',
          dataset_id TEXT NOT NULL,
          dataset_name TEXT NOT NULL,
          field_changes TEXT NOT NULL,
          effective_time TEXT NOT NULL,
          approval_role TEXT DEFAULT 'ADMIN',
          approver TEXT,
          approved_at TEXT,
          approval_comment TEXT,
          rollback_description TEXT,
          rollback_retention_days INTEGER DEFAULT 30,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          submitted_at TEXT,
          execution_started_at TEXT,
          execution_completed_at TEXT,
          executed_by TEXT,
          rollbacked_at TEXT,
          rollbacked_by TEXT,
          version INTEGER DEFAULT 1
        )
      `);
    }
    
    if (!existingTables.includes('change_order_audit_logs')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_order_audit_logs (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          operator TEXT NOT NULL,
          details TEXT,
          ip_address TEXT,
          result TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('change_order_versions')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_order_versions (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          field_changes TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          change_summary TEXT,
          is_active INTEGER DEFAULT 0,
          FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('change_order_conflicts')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_order_conflicts (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          conflicting_order_id TEXT NOT NULL,
          conflict_type TEXT NOT NULL,
          conflict_time_window TEXT,
          resolution TEXT,
          resolved_by TEXT,
          resolved_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (conflicting_order_id) REFERENCES change_orders(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('change_order_execution_history')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_order_execution_history (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          execution_type TEXT NOT NULL,
          previous_value TEXT,
          new_value TEXT NOT NULL,
          execution_result TEXT,
          error_message TEXT,
          executed_by TEXT NOT NULL,
          executed_at TEXT NOT NULL,
          FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
        )
      `);
    }
    
    if (!existingTables.includes('change_order_config')) {
      database.run(`
        CREATE TABLE IF NOT EXISTS change_order_config (
          id TEXT PRIMARY KEY,
          config_key TEXT UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          config_type TEXT DEFAULT 'STRING',
          description TEXT,
          default_value TEXT,
          valid_values TEXT,
          updated_by TEXT,
          updated_at TEXT NOT NULL
        )
      `);
    }
    
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_dataset ON change_orders(dataset_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_created_by ON change_orders(created_by)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_effective_time ON change_orders(effective_time)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_audit_order ON change_order_audit_logs(order_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_versions_order ON change_order_versions(order_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_conflicts_order ON change_order_conflicts(order_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_execution_order ON change_order_execution_history(order_id)`);
    
    insertDefaultChangeOrderConfig(database);
    
    saveDatabase();
  }
}

function createChangeCenterTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS change_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      order_type TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      priority TEXT DEFAULT 'NORMAL',
      dataset_id TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      field_changes TEXT NOT NULL,
      effective_time TEXT NOT NULL,
      approval_role TEXT DEFAULT 'ADMIN',
      approver TEXT,
      approved_at TEXT,
      approval_comment TEXT,
      rollback_description TEXT,
      rollback_retention_days INTEGER DEFAULT 30,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      execution_started_at TEXT,
      execution_completed_at TEXT,
      executed_by TEXT,
      rollbacked_at TEXT,
      rollbacked_by TEXT,
      version INTEGER DEFAULT 1
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS change_order_audit_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      operator TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      result TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS change_order_versions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      field_changes TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      change_summary TEXT,
      is_active INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS change_order_conflicts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      conflicting_order_id TEXT NOT NULL,
      conflict_type TEXT NOT NULL,
      conflict_time_window TEXT,
      resolution TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (conflicting_order_id) REFERENCES change_orders(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS change_order_execution_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      execution_type TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT NOT NULL,
      execution_result TEXT,
      error_message TEXT,
      executed_by TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES change_orders(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS change_order_config (
      id TEXT PRIMARY KEY,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT DEFAULT 'STRING',
      description TEXT,
      default_value TEXT,
      valid_values TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_dataset ON change_orders(dataset_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_created_by ON change_orders(created_by)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_orders_effective_time ON change_orders(effective_time)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_audit_order ON change_order_audit_logs(order_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_versions_order ON change_order_versions(order_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_conflicts_order ON change_order_conflicts(order_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_change_order_execution_order ON change_order_execution_history(order_id)`);

  insertDefaultChangeOrderConfig(database);
}

function insertDefaultChangeOrderConfig(database: Database) {
  const now = new Date().toISOString();
  const defaultConfigs = [
    { key: 'approval_roles', value: 'ADMIN,SUPERVISOR', description: '可审批变更单的角色列表', defaultValue: 'ADMIN,SUPERVISOR', validValues: 'ADMIN,SUPERVISOR,REVIEWER' },
    { key: 'conflict_time_window_hours', value: '24', description: '冲突检测时间窗口(小时)', defaultValue: '24', validValues: null },
    { key: 'rollback_retention_days', value: '30', description: '回滚数据保留天数', defaultValue: '30', validValues: null },
    { key: 'auto_conflict_check', value: 'true', description: '是否自动检测冲突', defaultValue: 'true', validValues: 'true,false' },
    { key: 'require_rollback_description', value: 'true', description: '是否必须填写回滚说明', defaultValue: 'true', validValues: 'true,false' },
    { key: 'max_effective_delay_hours', value: '168', description: '最大生效延迟时间(小时)', defaultValue: '168', validValues: null },
  ];

  defaultConfigs.forEach((config, index) => {
    database.run(
      `INSERT OR IGNORE INTO change_order_config (id, config_key, config_value, config_type, description, default_value, valid_values, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`config_${index + 1}`, config.key, config.value, 'STRING', config.description, config.defaultValue, config.validValues, now]
    );
  });
}
