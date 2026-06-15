import { getDatabase } from './database.js';
import { AnomalyReplay, RuleConfig, Correction } from './types.js';

export async function getAnomalyReplay(anomalyId: string): Promise<AnomalyReplay | null> {
  const db = getDatabase();

  const anomalyResult = db.exec(`
    SELECT
      a.*,
      m.meter_id,
      m.meter_type,
      m.reading_date,
      m.raw_value,
      m.corrected_value,
      b.batch_no
    FROM anomalies a
    JOIN meter_readings m ON a.reading_id = m.id
    LEFT JOIN batches b ON m.batch_id = b.id
    WHERE a.id = ?
  `, [anomalyId]);

  if (anomalyResult.length === 0 || anomalyResult[0].values.length === 0) {
    return null;
  }

  const columns = anomalyResult[0].columns;
  const row = anomalyResult[0].values[0];
  const anomaly: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    anomaly[key] = row[i];
  });

  const correctionsResult = db.exec(`
    SELECT * FROM corrections WHERE anomaly_id = ? ORDER BY operated_at
  `, [anomalyId]);

  const corrections: Correction[] = correctionsResult[0]?.values.map(row => {
    const correction: any = {};
    correctionsResult[0].columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      correction[key] = row[i];
    });
    return correction as Correction;
  }) || [];

  let ruleSnapshot: RuleConfig[] = [];
  if (anomaly.ruleSnapshot) {
    try {
      ruleSnapshot = JSON.parse(anomaly.ruleSnapshot);
    } catch {
      ruleSnapshot = [];
    }
  } else if (corrections.length > 0 && corrections[0].ruleSnapshot) {
    try {
      ruleSnapshot = JSON.parse(corrections[0].ruleSnapshot);
    } catch {
      ruleSnapshot = [];
    }
  }

  if (ruleSnapshot.length === 0) {
    const currentRules = db.exec(`
      SELECT * FROM rule_configs WHERE effective_to IS NULL
    `);
    if (currentRules.length > 0) {
      ruleSnapshot = currentRules[0].values.map(row => {
        const rule: any = {};
        currentRules[0].columns.forEach((col, i) => {
          const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          rule[key] = row[i];
        });
        return rule as RuleConfig;
      });
    }
  }

  const processedAt: string[] = [anomaly.detectedAt];
  if (anomaly.resolvedAt) {
    processedAt.push(anomaly.resolvedAt);
  }
  corrections.forEach(c => processedAt.push(c.operatedAt));

  return {
    anomalyId: anomaly.id,
    meterId: anomaly.meterId,
    meterType: anomaly.meterType,
    readingDate: anomaly.readingDate,
    rawValue: anomaly.rawValue,
    correctedValue: anomaly.correctedValue,
    anomalyType: anomaly.anomalyType,
    initialStatus: 'PENDING',
    finalStatus: anomaly.status,
    corrections,
    ruleSnapshot,
    processedAt
  };
}

export async function getRuleSnapshotAtVersion(version: number): Promise<RuleConfig[]> {
  const db = getDatabase();

  const results = db.exec(`
    SELECT * FROM rule_configs WHERE version <= ? AND (effective_to IS NULL OR effective_to = '')
    GROUP BY config_key
    HAVING version = MAX(version)
  `, [version]);

  if (results.length === 0 || results[0].values.length === 0) {
    return [];
  }

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const rule: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      rule[key] = row[i];
    });
    return rule as RuleConfig;
  });
}

export function createRuleSnapshot(): RuleConfig[] {
  const db = getDatabase();

  const results = db.exec(`
    SELECT * FROM rule_configs WHERE effective_to IS NULL
  `);

  if (results.length === 0 || results[0].values.length === 0) {
    return [];
  }

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const rule: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      rule[key] = row[i];
    });
    return rule as RuleConfig;
  });
}
