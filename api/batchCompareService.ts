import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { BatchSnapshot, BatchComparisonResult, MeterTrajectory, AnomalyWithReading, MeterReading, Correction, RuleConfig } from './types.js';

export async function createBatchSnapshot(batchId: string): Promise<BatchSnapshot> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const anomalyStats = db.exec(`
    SELECT status, COUNT(*) as count
    FROM anomalies
    WHERE reading_id IN (SELECT id FROM meter_readings WHERE batch_id = ?)
    GROUP BY status
  `, [batchId]);

  const statusSummary: Record<string, number> = {};
  if (anomalyStats.length > 0) {
    anomalyStats[0].values.forEach((row: any[]) => {
      statusSummary[row[0] as string] = Number(row[1]);
    });
  }

  const anomalies = db.exec(`
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
    WHERE m.batch_id = ?
  `, [batchId]);

  const snapshotData = JSON.stringify(anomalies);

  const snapshotId = uuidv4();
  db.run(
    `INSERT INTO batch_snapshots (id, batch_id, snapshot_data, anomaly_count, status_summary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [snapshotId, batchId, snapshotData, anomalies[0]?.values.length || 0, JSON.stringify(statusSummary), now]
  );

  saveDatabase();

  return {
    id: snapshotId,
    batchId,
    snapshotData,
    anomalyCount: anomalies[0]?.values.length || 0,
    statusSummary: JSON.stringify(statusSummary),
    createdAt: now
  };
}

export async function getBatchSnapshot(batchId: string): Promise<BatchSnapshot | null> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT * FROM batch_snapshots WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1`,
    [batchId]
  );

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const snapshot: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    snapshot[key] = row[i];
  });
  return snapshot as BatchSnapshot;
}

export async function compareBatches(batch1Id: string, batch2Id: string): Promise<BatchComparisonResult> {
  const db = getDatabase();

  const getBatchAnomalies = (batchId: string): AnomalyWithReading[] => {
    const results = db.exec(`
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
      WHERE m.batch_id = ?
      ORDER BY m.meter_id, m.reading_date
    `, [batchId]);

    if (results.length === 0 || results[0].values.length === 0) return [];

    const columns = results[0].columns;
    return results[0].values.map(row => {
      const anomaly: any = {};
      columns.forEach((col, i) => {
        const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        anomaly[key] = row[i];
      });
      return anomaly as AnomalyWithReading;
    });
  };

  const batch1Anomalies = getBatchAnomalies(batch1Id);
  const batch2Anomalies = getBatchAnomalies(batch2Id);

  const batch1MeterIds = new Set(batch1Anomalies.map(a => a.meterId));
  const batch2MeterIds = new Set(batch2Anomalies.map(a => a.meterId));

  const newAnomalies = batch2Anomalies.filter(a2 => {
    const existsInBatch1 = batch1Anomalies.some(a1 => a1.readingId === a2.readingId);
    return !existsInBatch1;
  });

  const correctedAnomalies = batch2Anomalies.filter(a2 => {
    const batch1Anomaly = batch1Anomalies.find(a1 => a1.meterId === a2.meterId && a1.readingId !== a2.readingId);
    return a2.status === 'CORRECTED' && (!batch1Anomaly || batch1Anomaly.status !== 'CORRECTED');
  });

  const ignoredAnomalies = batch2Anomalies.filter(a2 => {
    const batch1Anomaly = batch1Anomalies.find(a1 => a1.meterId === a2.meterId && a1.readingId !== a2.readingId);
    return a2.status === 'IGNORED' && (!batch1Anomaly || batch1Anomaly.status !== 'IGNORED');
  });

  const revertedAnomalies = batch1Anomalies.filter(a1 => {
    const batch2Anomaly = batch2Anomalies.find(a2 => a2.readingId === a1.readingId);
    return batch2Anomaly && batch2Anomaly.status === 'PENDING' && a1.status !== 'PENDING';
  });

  const unchangedAnomalies = batch2Anomalies.filter(a2 => {
    const batch1Anomaly = batch1Anomalies.find(a1 => a1.readingId === a2.readingId);
    return batch1Anomaly && batch1Anomaly.status === a2.status;
  });

  const allMeterIds = new Set([...batch1MeterIds, ...batch2MeterIds]);
  const meterTrajectory: MeterTrajectory[] = [];

  for (const meterId of allMeterIds) {
    const meterReadings = db.exec(`
      SELECT * FROM meter_readings
      WHERE meter_id = ? AND (batch_id = ? OR batch_id = ?)
      ORDER BY reading_date
    `, [meterId, batch1Id, batch2Id]);

    const meterAnomalies = [...batch1Anomalies, ...batch2Anomalies].filter(a => a.meterId === meterId);

    const corrections = db.exec(`
      SELECT * FROM corrections
      WHERE reading_id IN (SELECT id FROM meter_readings WHERE meter_id = ?)
      ORDER BY operated_at
    `, [meterId]);

    const readings: MeterReading[] = meterReadings[0]?.values.map(row => {
      const reading: any = {};
      meterReadings[0].columns.forEach((col, i) => {
        const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        reading[key] = row[i];
      });
      return reading as MeterReading;
    }) || [];

    const correctionsList: Correction[] = corrections[0]?.values.map(row => {
      const correction: any = {};
      corrections[0].columns.forEach((col, i) => {
        const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        correction[key] = row[i];
      });
      return correction as Correction;
    }) || [];

    if (readings.length > 0 || meterAnomalies.length > 0) {
      meterTrajectory.push({
        meterId,
        meterType: meterAnomalies[0]?.meterType || readings[0]?.meterType || 'WATER',
        readings,
        anomalies: meterAnomalies,
        corrections: correctionsList
      });
    }
  }

  return {
    batch1Id,
    batch2Id,
    newAnomalies,
    correctedAnomalies,
    ignoredAnomalies,
    revertedAnomalies,
    unchangedAnomalies,
    meterTrajectory
  };
}

export async function getMeterTrajectory(meterId: string): Promise<MeterTrajectory | null> {
  const db = getDatabase();

  const readingsResult = db.exec(`
    SELECT * FROM meter_readings
    WHERE meter_id = ?
    ORDER BY reading_date
  `, [meterId]);

  const anomaliesResult = db.exec(`
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
    WHERE m.meter_id = ?
    ORDER BY m.reading_date
  `, [meterId]);

  const correctionsResult = db.exec(`
    SELECT * FROM corrections
    WHERE reading_id IN (SELECT id FROM meter_readings WHERE meter_id = ?)
    ORDER BY operated_at
  `, [meterId]);

  if (readingsResult.length === 0 || readingsResult[0].values.length === 0) {
    return null;
  }

  const readings: MeterReading[] = readingsResult[0].values.map(row => {
    const reading: any = {};
    readingsResult[0].columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      reading[key] = row[i];
    });
    return reading as MeterReading;
  });

  const anomalies: AnomalyWithReading[] = anomaliesResult[0]?.values.map(row => {
    const anomaly: any = {};
    anomaliesResult[0].columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      anomaly[key] = row[i];
    });
    return anomaly as AnomalyWithReading;
  }) || [];

  const corrections: Correction[] = correctionsResult[0]?.values.map(row => {
    const correction: any = {};
    correctionsResult[0].columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      correction[key] = row[i];
    });
    return correction as Correction;
  }) || [];

  return {
    meterId,
    meterType: readings[0].meterType,
    readings,
    anomalies,
    corrections
  };
}
