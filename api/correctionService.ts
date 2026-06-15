import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { Correction, ConflictError } from './types.js';

export async function correctAnomaly(
  anomalyId: string,
  newValue: number,
  operator: string,
  expectedVersion: number
): Promise<{ success: boolean; correction?: Correction; error?: ConflictError }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const readingResult = db.exec(
    `SELECT mr.*, a.anomaly_type FROM meter_readings mr JOIN anomalies a ON mr.id = a.reading_id WHERE a.id = ?`,
    [anomalyId]
  );

  if (readingResult.length === 0 || readingResult[0].values.length === 0) {
    return { success: false, error: { isConflict: false, message: '异常记录不存在', currentVersion: 0 } };
  }

  const columns = readingResult[0].columns;
  const row = readingResult[0].values[0];
  const reading: any = {};
  columns.forEach((col, i) => { reading[col] = row[i]; });

  if (reading.version !== expectedVersion) {
    return {
      success: false,
      error: {
        isConflict: true,
        message: '数据已被其他用户修改，请刷新后重试',
        currentVersion: reading.version
      }
    };
  }

  if (reading.anomaly_type === 'ROLLBACK' && newValue < reading.raw_value) {
    return {
      success: false,
      error: {
        isConflict: false,
        message: '回退异常不能将读数修正为低于原始值',
        currentVersion: reading.version
      }
    };
  }

  const correctionId = uuidv4();
  const originalValue = reading.corrected_value ?? reading.raw_value;

  db.run(
    `INSERT INTO corrections (id, anomaly_id, original_value, new_value, operator, operated_at, version, reading_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [correctionId, anomalyId, originalValue, newValue, operator, now, expectedVersion, reading.id]
  );

  db.run(
    `UPDATE meter_readings SET corrected_value = ?, version = ?, updated_at = ? WHERE id = ?`,
    [newValue, expectedVersion + 1, now, reading.id]
  );

  db.run(
    `UPDATE anomalies SET status = 'CORRECTED', resolved_at = ?, resolved_by = ? WHERE id = ?`,
    [now, operator, anomalyId]
  );

  saveDatabase();

  const correction: Correction = {
    id: correctionId,
    anomalyId,
    originalValue,
    newValue,
    operator,
    operatedAt: now,
    version: expectedVersion + 1,
    readingId: reading.id
  };

  return { success: true, correction };
}

export async function getCorrectionHistory(anomalyId: string): Promise<Correction[]> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT * FROM corrections WHERE anomaly_id = ? ORDER BY operated_at DESC`,
    [anomalyId]
  );

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const correction: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      correction[key] = row[i];
    });
    return correction as Correction;
  });
}

export async function getAllCorrections(): Promise<Correction[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM corrections ORDER BY operated_at DESC`);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const correction: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      correction[key] = row[i];
    });
    return correction as Correction;
  });
}
