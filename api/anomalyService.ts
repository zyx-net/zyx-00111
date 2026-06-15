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

export async function detectMissingReadings(readings?: MeterReading[]): Promise<Array<{ meterId: string; meterType: string; readingId: string; gapDays: number }>> {
  const db = getDatabase();

  const missingDaysResult = db.exec(`SELECT config_value FROM rule_configs WHERE config_key = 'missingDays' AND effective_to IS NULL ORDER BY version DESC LIMIT 1`);
  const missingDays = missingDaysResult[0]?.values[0]?.[0] ? Number(missingDaysResult[0].values[0][0]) : 3;

  const missingMeters: Array<{ meterId: string; meterType: string; readingId: string; gapDays: number }> = [];

  if (readings && readings.length > 0) {
    const readingsByMeter = new Map<string, MeterReading[]>();
    for (const reading of readings) {
      const existing = readingsByMeter.get(reading.meterId) || [];
      existing.push(reading);
      readingsByMeter.set(reading.meterId, existing);
    }

    for (const [meterId, meterReadings] of readingsByMeter) {
      const sortedReadings = meterReadings.sort((a, b) => 
        new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime()
      );

      for (let i = 1; i < sortedReadings.length; i++) {
        const prevDate = new Date(sortedReadings[i - 1].readingDate);
        const currDate = new Date(sortedReadings[i].readingDate);
        const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff > missingDays) {
          missingMeters.push({
            meterId,
            meterType: sortedReadings[i].meterType,
            readingId: sortedReadings[i].id,
            gapDays: daysDiff
          });
        }
      }
    }
  } else {
    const metersResult = db.exec(`
      SELECT DISTINCT meter_id, meter_type 
      FROM meter_readings
      ORDER BY meter_id
    `);

    if (metersResult.length === 0) return [];

    for (const row of metersResult[0].values) {
      const meterId = row[0] as string;
      const meterType = row[1] as string;

      const readingsResult = db.exec(`
        SELECT id, reading_date FROM meter_readings
        WHERE meter_id = ?
        ORDER BY reading_date
      `, [meterId]);

      if (readingsResult.length > 0 && readingsResult[0].values.length >= 2) {
        for (let i = 1; i < readingsResult[0].values.length; i++) {
          const prevDate = new Date(readingsResult[0].values[i - 1][1] as string);
          const currDate = new Date(readingsResult[0].values[i][1] as string);
          const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff > missingDays) {
            missingMeters.push({
              meterId,
              meterType,
              readingId: readingsResult[0].values[i][0] as string,
              gapDays: daysDiff
            });
          }
        }
      }
    }
  }

  return missingMeters;
}

export async function createMissingAnomalies(readings?: MeterReading[]): Promise<Anomaly[]> {
  const db = getDatabase();
  const missingMeters = await detectMissingReadings(readings);
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const meter of missingMeters) {
    const existingMissingAnomaly = db.exec(`
      SELECT a.id FROM anomalies a
      WHERE a.reading_id = ? AND a.anomaly_type = 'MISSING' AND a.status = 'PENDING'
    `, [meter.readingId]);

    if (existingMissingAnomaly.length === 0 || existingMissingAnomaly[0].values.length === 0) {
      const anomalyId = uuidv4();
      db.run(
        `INSERT INTO anomalies (id, reading_id, anomaly_type, detected_at, status, remark) VALUES (?, ?, ?, ?, ?, ?)`,
        [anomalyId, meter.readingId, 'MISSING', now, 'PENDING', `与上次读数间隔 ${meter.gapDays} 天`]
      );

      db.run(
        `UPDATE meter_readings SET status = 'ABNORMAL', updated_at = ? WHERE id = ?`,
        [now, meter.readingId]
      );

      anomalies.push({
        id: anomalyId,
        readingId: meter.readingId,
        anomalyType: 'MISSING',
        detectedAt: now,
        status: 'PENDING',
        remark: `与上次读数间隔 ${meter.gapDays} 天`
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
