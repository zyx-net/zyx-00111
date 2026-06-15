import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { MeterReading, Anomaly, AnomalyWithReading, AnomalyType, AnomalyStatus } from './types.js';

export interface AnomalyDetectionResult {
  reading: MeterReading;
  anomalies: AnomalyType[];
}

export async function detectAnomalies(readings: MeterReading[]): Promise<AnomalyDetectionResult[]> {
  const db = getDatabase();
  const results: AnomalyDetectionResult[] = [];

  const rules = getDetectionRules();

  for (const reading of readings) {
    const previousReading = await getPreviousReading(reading.meterId, reading.readingDate);
    const detectedAnomalies: AnomalyType[] = [];

    for (const rule of rules) {
      if (rule.detect(reading, previousReading)) {
        detectedAnomalies.push(rule.type);
      }
    }

    if (detectedAnomalies.length > 0) {
      results.push({ reading, anomalies: detectedAnomalies });
    }
  }

  return results;
}

interface DetectionRule {
  type: AnomalyType;
  detect: (current: MeterReading, previous?: MeterReading) => boolean;
}

function getDetectionRules(): DetectionRule[] {
  const db = getDatabase();
  const rules: DetectionRule[] = [];

  const thresholdResult = db.exec(`SELECT config_value FROM rule_configs WHERE config_key = 'jumpThreshold' AND effective_to IS NULL ORDER BY version DESC LIMIT 1`);
  const jumpThreshold = thresholdResult[0]?.values[0]?.[0] ? Number(thresholdResult[0].values[0][0]) / 100 : 0.5;

  const rollbackResult = db.exec(`SELECT config_value FROM rule_configs WHERE config_key = 'rollbackEnabled' AND effective_to IS NULL ORDER BY version DESC LIMIT 1`);
  const rollbackEnabled = rollbackResult[0]?.values[0]?.[0] === 'true';

  rules.push({
    type: 'JUMP',
    detect: (current, previous) => {
      if (!previous) return false;
      const prevValue = previous.correctedValue ?? previous.rawValue;
      const diff = Math.abs(current.rawValue - prevValue);
      const avgValue = (current.rawValue + prevValue) / 2;
      if (avgValue === 0) return diff > 0;
      const changeRate = diff / avgValue;
      return changeRate > jumpThreshold;
    }
  });

  if (rollbackEnabled) {
    rules.push({
      type: 'ROLLBACK',
      detect: (current, previous) => {
        if (!previous) return false;
        const prevValue = previous.correctedValue ?? previous.rawValue;
        return current.rawValue < prevValue;
      }
    });
  }

  return rules;
}

export async function detectMissingReadings(): Promise<Array<{ meterId: string; meterType: string; lastReadingDate: string; daysMissing: number }>> {
  const db = getDatabase();

  const missingDaysResult = db.exec(`SELECT config_value FROM rule_configs WHERE config_key = 'missingDays' AND effective_to IS NULL ORDER BY version DESC LIMIT 1`);
  const missingDays = missingDaysResult[0]?.values[0]?.[0] ? Number(missingDaysResult[0].values[0][0]) : 3;

  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - missingDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const metersResult = db.exec(`
    SELECT DISTINCT meter_id, meter_type 
    FROM meter_readings
  `);

  if (metersResult.length === 0) return [];

  const missingMeters: Array<{ meterId: string; meterType: string; lastReadingDate: string; daysMissing: number }> = [];

  for (const row of metersResult[0].values) {
    const meterId = row[0] as string;
    const meterType = row[1] as string;

    const lastReadingResult = db.exec(`
      SELECT MAX(reading_date) as last_date
      FROM meter_readings
      WHERE meter_id = ?
    `, [meterId]);

    if (lastReadingResult.length > 0 && lastReadingResult[0].values.length > 0) {
      const lastDate = lastReadingResult[0].values[0][0] as string;
      const lastDateObj = new Date(lastDate);
      const daysDiff = Math.floor((today.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff >= missingDays) {
        const existingMissingAnomaly = db.exec(`
          SELECT a.id FROM anomalies a
          JOIN meter_readings mr ON a.reading_id = mr.id
          WHERE mr.meter_id = ? AND a.anomaly_type = 'MISSING' AND a.status = 'PENDING'
        `, [meterId]);

        if (existingMissingAnomaly.length === 0 || existingMissingAnomaly[0].values.length === 0) {
          missingMeters.push({
            meterId,
            meterType,
            lastReadingDate: lastDate,
            daysMissing: daysDiff
          });
        }
      }
    }
  }

  return missingMeters;
}

export async function createMissingAnomalies(): Promise<Anomaly[]> {
  const db = getDatabase();
  const missingMeters = await detectMissingReadings();
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const meter of missingMeters) {
    const lastReadingResult = db.exec(`
      SELECT id FROM meter_readings
      WHERE meter_id = ? AND reading_date = ?
    `, [meter.meterId, meter.lastReadingDate]);

    if (lastReadingResult.length > 0 && lastReadingResult[0].values.length > 0) {
      const readingId = lastReadingResult[0].values[0][0] as string;

      const anomalyId = uuidv4();
      db.run(
        `INSERT INTO anomalies (id, reading_id, anomaly_type, detected_at, status, remark) VALUES (?, ?, ?, ?, ?, ?)`,
        [anomalyId, readingId, 'MISSING', now, 'PENDING', `已超过 ${meter.daysMissing} 天无读数`]
      );

      anomalies.push({
        id: anomalyId,
        readingId,
        anomalyType: 'MISSING',
        detectedAt: now,
        status: 'PENDING',
        remark: `已超过 ${meter.daysMissing} 天无读数`
      });
    }
  }

  if (anomalies.length > 0) {
    saveDatabase();
  }

  return anomalies;
}

async function getPreviousReading(meterId: string, currentDate: string): Promise<MeterReading | undefined> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT * FROM meter_readings WHERE meter_id = ? AND reading_date < ? ORDER BY reading_date DESC LIMIT 1`,
    [meterId, currentDate]
  );

  if (results.length === 0 || results[0].values.length === 0) return undefined;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const reading: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    reading[key] = row[i];
  });
  return reading as MeterReading;
}

export async function createAnomalyRecords(detectionResults: AnomalyDetectionResult[]): Promise<Anomaly[]> {
  const db = getDatabase();
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const result of detectionResults) {
    for (const anomalyType of result.anomalies) {
      const anomalyId = uuidv4();
      db.run(
        `INSERT INTO anomalies (id, reading_id, anomaly_type, detected_at, status) VALUES (?, ?, ?, ?, ?)`,
        [anomalyId, result.reading.id, anomalyType, now, 'PENDING']
      );

      db.run(
        `UPDATE meter_readings SET status = 'ABNORMAL', updated_at = ? WHERE id = ?`,
        [now, result.reading.id]
      );

      anomalies.push({
        id: anomalyId,
        readingId: result.reading.id,
        anomalyType,
        detectedAt: now,
        status: 'PENDING'
      });
    }
  }

  saveDatabase();
  return anomalies;
}

export async function getAnomalies(filters?: { status?: AnomalyStatus; type?: AnomalyType }): Promise<AnomalyWithReading[]> {
  const db = getDatabase();

  let query = `
    SELECT 
      a.*,
      m.meter_id,
      m.meter_type,
      m.reading_date,
      m.raw_value,
      m.corrected_value,
      m.version as current_version,
      b.batch_no
    FROM anomalies a
    JOIN meter_readings m ON a.reading_id = m.id
    LEFT JOIN batches b ON m.batch_id = b.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (filters?.status) {
    query += ` AND a.status = ?`;
    params.push(filters.status);
  }

  if (filters?.type) {
    query += ` AND a.anomaly_type = ?`;
    params.push(filters.type);
  }

  query += ` ORDER BY a.detected_at DESC`;

  const results = db.exec(query, params);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const anomaly: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      anomaly[key] = row[i];
    });
    return anomaly as AnomalyWithReading;
  });
}

export async function getAnomalyById(anomalyId: string): Promise<AnomalyWithReading | null> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT 
      a.*,
      m.meter_id,
      m.meter_type,
      m.reading_date,
      m.raw_value,
      m.corrected_value,
      m.version as current_version,
      b.batch_no
    FROM anomalies a
    JOIN meter_readings m ON a.reading_id = m.id
    LEFT JOIN batches b ON m.batch_id = b.id
    WHERE a.id = ?`,
    [anomalyId]
  );

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const anomaly: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    anomaly[key] = row[i];
  });
  return anomaly as AnomalyWithReading;
}

export async function ignoreAnomaly(anomalyId: string, operator: string, remark?: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.run(
    `UPDATE anomalies SET status = 'IGNORED', resolved_at = ?, resolved_by = ?, remark = ? WHERE id = ?`,
    [now, operator, remark || '', anomalyId]
  );

  saveDatabase();
}

export async function revertAnomaly(anomalyId: string): Promise<{ success: boolean; message: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const anomalyResult = db.exec(`SELECT * FROM anomalies WHERE id = ?`, [anomalyId]);
  if (anomalyResult.length === 0 || anomalyResult[0].values.length === 0) {
    return { success: false, message: '异常记录不存在' };
  }

  const columns = anomalyResult[0].columns;
  const row = anomalyResult[0].values[0];
  const anomaly: any = {};
  columns.forEach((col, i) => { anomaly[col] = row[i]; });

  if (anomaly.status !== 'CORRECTED' && anomaly.status !== 'IGNORED') {
    return { success: false, message: '只有已修正或已忽略的异常可以撤销' };
  }

  const readingId = anomaly.reading_id;

  const correctionResult = db.exec(
    `SELECT * FROM corrections WHERE anomaly_id = ? ORDER BY operated_at DESC LIMIT 1`,
    [anomalyId]
  );

  let previousValue: number | null = null;
  if (correctionResult.length > 0 && correctionResult[0].values.length > 0) {
    const correctionRow = correctionResult[0].values[0];
    const correctionColumns = correctionResult[0].columns;
    const originalValueIdx = correctionColumns.indexOf('original_value');
    previousValue = correctionRow[originalValueIdx] as number;
  }

  db.run(
    `UPDATE anomalies SET status = 'PENDING', resolved_at = NULL, resolved_by = NULL, remark = NULL WHERE id = ?`,
    [anomalyId]
  );

  if (anomaly.status === 'CORRECTED') {
    db.run(
      `UPDATE meter_readings SET status = 'ABNORMAL', corrected_value = NULL, updated_at = ? WHERE id = ?`,
      [now, readingId]
    );
  } else {
    db.run(
      `UPDATE meter_readings SET status = 'ABNORMAL', updated_at = ? WHERE id = ?`,
      [now, readingId]
    );
  }

  saveDatabase();
  return { success: true, message: '撤销成功' };
}
