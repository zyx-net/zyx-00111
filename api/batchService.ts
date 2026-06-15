import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { Batch, MeterReading, MeterType } from './types.js';

interface ImportReading {
  meterId: string;
  readingDate: string;
  rawValue: number;
  meterType: MeterType;
}

export async function importBatch(readings: ImportReading[], importedBy?: string): Promise<Batch> {
  const db = getDatabase();
  const batchId = uuidv4();
  const batchNo = `BATCH_${Date.now()}`;
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO batches (id, batch_no, imported_at, total_count, anomaly_count, imported_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [batchId, batchNo, now, readings.length, 0, importedBy || 'system']
  );

  readings.forEach(reading => {
    const readingId = uuidv4();
    db.run(
      `INSERT INTO meter_readings (id, meter_id, reading_date, raw_value, meter_type, batch_id, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [readingId, reading.meterId, reading.readingDate, reading.rawValue, reading.meterType, batchId, 'RAW', 1, now, now]
    );
  });

  saveDatabase();

  return {
    id: batchId,
    batchNo,
    importedAt: now,
    totalCount: readings.length,
    anomalyCount: 0,
    importedBy: importedBy || 'system'
  };
}

export async function getBatches(): Promise<Batch[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM batches ORDER BY imported_at DESC`);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const batch: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      batch[key] = row[i];
    });
    return batch as Batch;
  });
}

export async function getBatchById(batchId: string): Promise<Batch | null> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM batches WHERE id = ?`, [batchId]);

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const batch: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    batch[key] = row[i];
  });
  return batch as Batch;
}

export async function getReadingsByBatchId(batchId: string): Promise<MeterReading[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM meter_readings WHERE batch_id = ? ORDER BY reading_date`, [batchId]);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const reading: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      reading[key] = row[i];
    });
    return reading as MeterReading;
  });
}

export async function deleteBatch(batchId: string): Promise<void> {
  const db = getDatabase();

  db.run(`DELETE FROM corrections WHERE anomaly_id IN (SELECT id FROM anomalies WHERE reading_id IN (SELECT id FROM meter_readings WHERE batch_id = ?))`, [batchId]);
  db.run(`DELETE FROM anomalies WHERE reading_id IN (SELECT id FROM meter_readings WHERE batch_id = ?)`, [batchId]);
  db.run(`DELETE FROM meter_readings WHERE batch_id = ?`, [batchId]);
  db.run(`DELETE FROM batches WHERE id = ?`, [batchId]);

  saveDatabase();
}

export async function checkDuplicateReadings(readings: ImportReading[]): Promise<{ isDuplicate: boolean; count: number }> {
  const db = getDatabase();

  for (const reading of readings) {
    const results = db.exec(
      `SELECT COUNT(*) as count FROM meter_readings WHERE meter_id = ? AND reading_date = ? AND raw_value = ?`,
      [reading.meterId, reading.readingDate, reading.rawValue]
    );

    if (results.length > 0 && results[0].values[0][0] > 0) {
      return { isDuplicate: true, count: 1 };
    }
  }

  return { isDuplicate: false, count: 0 };
}

export async function updateBatchAnomalyCount(batchId: string): Promise<void> {
  const db = getDatabase();

  const results = db.exec(
    `SELECT COUNT(*) as count FROM anomalies WHERE reading_id IN (SELECT id FROM meter_readings WHERE batch_id = ?)`,
    [batchId]
  );

  const anomalyCount = results[0]?.values[0]?.[0] || 0;

  db.run(`UPDATE batches SET anomaly_count = ? WHERE id = ?`, [anomalyCount, batchId]);
  saveDatabase();
}
