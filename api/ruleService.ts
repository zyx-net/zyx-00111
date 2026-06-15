import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { RuleConfig } from './types.js';

export async function getCurrentRules(): Promise<RuleConfig[]> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT * FROM rule_configs WHERE effective_to IS NULL ORDER BY config_key`
  );

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const config: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      config[key] = row[i];
    });
    return config as RuleConfig;
  });
}

export async function updateRules(configs: { key: string; value: string }[]): Promise<{ success: boolean; newVersion: number }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const versionResult = db.exec(`SELECT MAX(version) as max_version FROM rule_configs`);
  const currentMaxVersion = versionResult[0]?.values[0]?.[0] || 0;
  const newVersion = currentMaxVersion + 1;

  db.exec(`UPDATE rule_configs SET effective_to = ? WHERE effective_to IS NULL`, [now]);

  for (const config of configs) {
    const id = uuidv4();
    db.run(
      `INSERT INTO rule_configs (id, config_key, config_value, version, effective_from, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, config.key, config.value, newVersion, now, now]
    );
  }

  saveDatabase();
  return { success: true, newVersion };
}

export async function getRuleHistory(): Promise<RuleConfig[]> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT * FROM rule_configs ORDER BY version DESC, config_key`
  );

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const config: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      config[key] = row[i];
    });
    return config as RuleConfig;
  });
}

export async function rollbackToVersion(version: number): Promise<{ success: boolean; message: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const versionCheck = db.exec(`SELECT DISTINCT version FROM rule_configs WHERE version = ?`, [version]);
  if (versionCheck.length === 0 || versionCheck[0].values.length === 0) {
    return { success: false, message: '版本不存在' };
  }

  const currentRules = db.exec(`SELECT * FROM rule_configs WHERE effective_to IS NULL`);

  if (currentRules.length > 0) {
    db.exec(`UPDATE rule_configs SET effective_to = ? WHERE effective_to IS NULL`, [now]);
  }

  const targetRules = db.exec(`SELECT * FROM rule_configs WHERE version = ?`, [version]);

  if (targetRules.length > 0) {
    for (const row of targetRules[0].values) {
      const id = uuidv4();
      const configKey = targetRules[0].columns.indexOf('config_key');
      const configValue = targetRules[0].columns.indexOf('config_value');
      const effectiveFrom = targetRules[0].columns.indexOf('effective_from');

      db.run(
        `INSERT INTO rule_configs (id, config_key, config_value, version, effective_from, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, row[configKey], row[configValue], version + 1, now, now]
      );
    }
  }

  saveDatabase();
  return { success: true, message: '回滚成功' };
}

export async function getRuleByKey(key: string): Promise<string | null> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT config_value FROM rule_configs WHERE config_key = ? AND effective_to IS NULL ORDER BY version DESC LIMIT 1`,
    [key]
  );

  if (results.length === 0 || results[0].values.length === 0) return null;
  return String(results[0].values[0][0]);
}
