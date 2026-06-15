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

  const anomaly = anomalyResult[0].values[0];
  const anomalyStatus = anomalyResult[0].columns.indexOf('status');
  const readingIdIndex = anomalyResult[0].columns.indexOf('reading_id');

  if (anomaly[anomalyStatus] !== 'CORRECTED' && anomaly[anomalyStatus] !== 'IGNORED') {
    return { success: false, message: '只有已修正或已忽略的异常可以撤销' };
  }

  db.run(
    `UPDATE anomalies SET status = 'PENDING', resolved_at = NULL, resolved_by = NULL, remark = NULL WHERE id = ?`,
    [anomalyId]
  );

  db.run(
    `UPDATE meter_readings SET status = 'ABNORMAL', updated_at = ? WHERE id = ?`,
    [now, anomaly[readingIdIndex]]
  );

  saveDatabase();
  return { success: true, message: '撤销成功' };
}
