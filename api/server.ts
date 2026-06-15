import express from 'express';
import cors from 'cors';
import { initDatabase, closeDatabase } from './database.js';
import { importBatch, getBatches, getBatchById, getReadingsByBatchId, deleteBatch, checkDuplicateReadings, updateBatchAnomalyCount } from './batchService.js';
import { detectAnomalies, createAnomalyRecords, getAnomalies, getAnomalyById, ignoreAnomaly, revertAnomaly, createMissingAnomalies, detectMissingReadings } from './anomalyService.js';
import { correctAnomaly, getCorrectionHistory } from './correctionService.js';
import { getCurrentRules, updateRules, getRuleHistory, rollbackToVersion } from './ruleService.js';
import { exportDetail, exportSummary, getExportRecords, exportBatchCompare, exportReplay } from './exportService.js';
import { getUserByUsername, getAllUsers, canExportBatch, canRevertBatch, canViewAnomaly, canRevertAnomaly, createOperationLog, getOperationLogs } from './userService.js';
import { compareBatches, getMeterTrajectory, createBatchSnapshot, getBatchSnapshot } from './batchCompareService.js';
import { getAnomalyReplay, createRuleSnapshot } from './replayService.js';
import { getDatabase } from './database.js';
import { MeterReading, AnomalyWithReading, MeterType, BatchRevertResult } from './types.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/exports', express.static('./exports'));

app.post('/api/batches', async (req, res) => {
  try {
    const { readings, importedBy } = req.body as {
      readings: Array<{
        meterId: string;
        readingDate: string;
        rawValue: number;
        meterType: MeterType;
      }>;
      importedBy?: string;
    };

    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: '无效的导入数据' });
    }

    const duplicateCheck = await checkDuplicateReadings(readings);
    if (duplicateCheck.isDuplicate) {
      return res.status(400).json({
        error: '检测到重复数据',
        message: '数据中包含已存在的记录，请检查后重新导入'
      });
    }

    const batch = await importBatch(readings, importedBy);

    const readingsResult = await getReadingsByBatchId(batch.id);
    const detectionResults = await detectAnomalies(readingsResult);
    await createAnomalyRecords(detectionResults);
    await createMissingAnomalies(readingsResult);
    await updateBatchAnomalyCount(batch.id);

    const updatedBatch = await getBatchById(batch.id);
    const anomalies = await getAnomalies();

    const batchAnomalies = anomalies.filter(a => {
      const reading = readingsResult.find(r => r.id === a.readingId);
      return reading !== undefined;
    });

    res.json({
      batchId: batch.id,
      batchNo: batch.batchNo,
      importedCount: readings.length,
      anomalyCount: batchAnomalies.length,
      anomalies: batchAnomalies
    });
  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message || '导入失败' });
  }
});

app.get('/api/batches', async (req, res) => {
  try {
    const batches = await getBatches();
    res.json(batches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/batches/:id', async (req, res) => {
  try {
    const batch = await getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: '批次不存在' });
    }
    const readings = await getReadingsByBatchId(req.params.id);
    res.json({ ...batch, readings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    await deleteBatch(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/anomalies', async (req, res) => {
  try {
    const { status, type } = req.query as { status?: string; type?: string };
    const anomalies = await getAnomalies({
      status: status as any,
      type: type as any
    });
    res.json(anomalies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalies/detect-missing', async (req, res) => {
  try {
    const anomalies = await createMissingAnomalies();
    res.json({ 
      success: true, 
      count: anomalies.length,
      anomalies 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/anomalies/:id', async (req, res) => {
  try {
    const anomaly = await getAnomalyById(req.params.id);
    if (!anomaly) {
      return res.status(404).json({ error: '异常记录不存在' });
    }
    const history = await getCorrectionHistory(req.params.id);
    res.json({ ...anomaly, correctionHistory: history });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalies/:id/correct', async (req, res) => {
  try {
    const { newValue, operator, version } = req.body as {
      newValue: number;
      operator: string;
      version: number;
    };

    if (typeof newValue !== 'number' || typeof version !== 'number') {
      return res.status(400).json({ error: '参数格式错误' });
    }

    const result = await correctAnomaly(req.params.id, newValue, operator, version);

    if (!result.success && result.error) {
      return res.status(result.error.isConflict ? 409 : 400).json(result.error);
    }

    await updateBatchAnomalyCountForAnomaly(req.params.id);

    res.json({ success: true, correction: result.correction });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalies/:id/ignore', async (req, res) => {
  try {
    const { operator, remark } = req.body as { operator: string; remark?: string };
    await ignoreAnomaly(req.params.id, operator, remark);
    await updateBatchAnomalyCountForAnomaly(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalies/:id/revert', async (req, res) => {
  try {
    const result = await revertAnomaly(req.params.id);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    await updateBatchAnomalyCountForAnomaly(req.params.id);
    res.json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function updateBatchAnomalyCountForAnomaly(anomalyId: string) {
  const anomaly = await getAnomalyById(anomalyId);
  if (anomaly && anomaly.batchNo) {
    const db = (await import('./database.js')).getDatabase();
    const batchResult = db.exec(`SELECT id FROM batches WHERE batch_no = ?`, [anomaly.batchNo]);
    if (batchResult.length > 0 && batchResult[0].values.length > 0) {
      const batchId = batchResult[0].values[0][0];
      await updateBatchAnomalyCount(batchId as string);
    }
  }
}

app.get('/api/rules', async (req, res) => {
  try {
    const rules = await getCurrentRules();
    res.json(rules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/rules', async (req, res) => {
  try {
    const { configs } = req.body as {
      configs: Array<{ key: string; value: string }>
    };

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ error: '参数格式错误' });
    }

    const result = await updateRules(configs);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rules/history', async (req, res) => {
  try {
    const history = await getRuleHistory();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rules/:version/rollback', async (req, res) => {
  try {
    const version = parseInt(req.params.version);
    if (isNaN(version)) {
      return res.status(400).json({ error: '版本号格式错误' });
    }

    const result = await rollbackToVersion(version);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/detail', async (req, res) => {
  try {
    const params = req.body;
    const operator = params.operator || 'system';

    const user = await getUserByUsername(operator);
    if (!user) {
      console.warn(`User ${operator} not found, using system defaults for export`);
    }

    const result = await exportDetail(params, operator);

    if (result.recordCount === 0) {
      return res.status(200).json({
        success: false,
        error: '没有符合条件的数据',
        message: '当前筛选条件下没有可导出的数据，请调整筛选条件后重试',
        recordCount: 0
      });
    }

    if (user) {
      await createOperationLog(operator, 'EXPORT', 'detail', undefined, JSON.stringify(params));
    }

    res.json({
      filePath: result.filePath,
      record: result.record,
      recordCount: result.recordCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/summary', async (req, res) => {
  try {
    const params = req.body;
    const operator = params.operator || 'system';

    const user = await getUserByUsername(operator);
    if (!user) {
      console.warn(`User ${operator} not found, using system defaults for export`);
    }

    const result = await exportSummary(params, operator);

    if (result.summary.totalCount === 0) {
      return res.status(200).json({
        success: false,
        error: '没有符合条件的数据',
        message: '当前筛选条件下没有可导出的汇总数据，请调整筛选条件后重试',
        summary: result.summary,
        recordCount: 0
      });
    }

    if (user) {
      await createOperationLog(operator, 'EXPORT', 'summary', undefined, JSON.stringify(params));
    }

    res.json({
      filePath: result.filePath,
      record: result.record,
      summary: result.summary,
      recordCount: result.summary.totalCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exports', async (req, res) => {
  try {
    const records = await getExportRecords();
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const db = (await import('./database.js')).getDatabase();

    const today = new Date().toISOString().split('T')[0];

    const todayImport = db.exec(`SELECT COUNT(*) as count FROM batches WHERE DATE(imported_at) = DATE(?)`, [today]);
    const todayCount = todayImport[0]?.values[0]?.[0] || 0;

    const pendingAnomalies = db.exec(`SELECT COUNT(*) as count FROM anomalies WHERE status = 'PENDING'`);
    const pendingCount = pendingAnomalies[0]?.values[0]?.[0] || 0;

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const totalReadings = db.exec(`SELECT COUNT(*) as count FROM meter_readings WHERE DATE(reading_date) >= DATE(?)`, [monthStartStr]);
    const totalCount = totalReadings[0]?.values[0]?.[0] || 0;

    const totalAnomalies = db.exec(`SELECT COUNT(*) as count FROM anomalies WHERE status != 'PENDING' AND DATE(detected_at) >= DATE(?)`, [monthStartStr]);
    const anomalyCount = totalAnomalies[0]?.values[0]?.[0] || 0;

    const anomalyRate = totalCount > 0 ? ((anomalyCount / totalCount) * 100).toFixed(2) : '0.00';

    const recentAnomalies = db.exec(`
      SELECT 
        a.*,
        m.meter_id,
        m.meter_type,
        m.reading_date,
        m.raw_value
      FROM anomalies a
      JOIN meter_readings m ON a.reading_id = m.id
      WHERE a.status = 'PENDING'
      ORDER BY a.detected_at DESC
      LIMIT 5
    `);

    const recentList = recentAnomalies.length > 0 ? recentAnomalies[0].values.map(row => ({
      id: row[0],
      readingId: row[1],
      anomalyType: row[2],
      detectedAt: row[3],
      status: row[4],
      meterId: row[5],
      meterType: row[6],
      readingDate: row[7],
      rawValue: row[8]
    })) : [];

    const meterTypeStats = db.exec(`
      SELECT 
        meter_type,
        COUNT(*) as count,
        SUM(raw_value) as total
      FROM meter_readings
      GROUP BY meter_type
    `);

    const typeStats = meterTypeStats.length > 0 ? meterTypeStats[0].values.map(row => ({
      type: row[0],
      count: row[1],
      total: row[2]
    })) : [];

    res.json({
      todayImport: todayCount,
      pendingAnomalies: pendingCount,
      anomalyRate,
      recentAnomalies: recentList,
      typeStats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/operation-logs', async (req, res) => {
  try {
    const { operator, operationType, fromDate, toDate } = req.query as any;
    const logs = await getOperationLogs({
      operator,
      operationType,
      fromDate,
      toDate
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/batches/compare', async (req, res) => {
  try {
    const { batch1Id, batch2Id } = req.body;
    if (!batch1Id || !batch2Id) {
      return res.status(400).json({ error: '缺少批次ID参数' });
    }
    const comparison = await compareBatches(batch1Id, batch2Id);
    res.json(comparison);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/batches/:id/snapshot', async (req, res) => {
  try {
    let snapshot = await getBatchSnapshot(req.params.id);
    if (!snapshot) {
      snapshot = await createBatchSnapshot(req.params.id);
    }
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meters/:meterId/trajectory', async (req, res) => {
  try {
    const trajectory = await getMeterTrajectory(req.params.meterId);
    if (!trajectory) {
      return res.status(404).json({ error: '表计不存在' });
    }
    res.json(trajectory);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/anomalies/:id/replay', async (req, res) => {
  try {
    const replay = await getAnomalyReplay(req.params.id);
    if (!replay) {
      return res.status(404).json({ error: '异常记录不存在' });
    }
    res.json(replay);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/batches/:id/revert-all', async (req, res) => {
  try {
    const { operator } = req.body;
    const user = await getUserByUsername(operator);

    if (!user || !canRevertBatch(user)) {
      return res.status(403).json({ error: '权限不足，只有主管可以撤销整批操作' });
    }

    const db = getDatabase();
    const readings = await getReadingsByBatchId(req.params.id);

    const result: BatchRevertResult = {
      success: true,
      revertedCount: 0,
      failedCount: 0,
      details: []
    };

    for (const reading of readings) {
      const anomalyResults = db.exec(`
        SELECT id, status FROM anomalies WHERE reading_id = ? AND status IN ('CORRECTED', 'IGNORED')
      `, [reading.id]);

      if (anomalyResults.length > 0 && anomalyResults[0].values.length > 0) {
        for (const row of anomalyResults[0].values) {
          const anomalyId = row[0] as string;
          const revertResult = await revertAnomaly(anomalyId);
          if (revertResult.success) {
            result.revertedCount++;
            result.details.push({ anomalyId, success: true });
          } else {
            result.failedCount++;
            result.details.push({ anomalyId, success: false, message: revertResult.message });
          }
        }
      }
    }

    await createOperationLog(operator, 'BATCH_REVERT', 'batch', req.params.id, JSON.stringify({
      revertedCount: result.revertedCount,
      failedCount: result.failedCount
    }));

    await updateBatchAnomalyCount(req.params.id);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/batch-compare', async (req, res) => {
  try {
    const { batch1Id, batch2Id, operator } = req.body;

    const user = await getUserByUsername(operator);
    if (!user || !canExportBatch(user)) {
      return res.status(403).json({ error: '权限不足，只有主管可以导出批次对比' });
    }

    const comparison = await compareBatches(batch1Id, batch2Id);
    const exportResult = await exportBatchCompare(comparison, batch1Id, batch2Id, operator);

    await createOperationLog(operator, 'EXPORT', 'batch_compare', `${batch1Id}_${batch2Id}`, JSON.stringify({
      batch1Id,
      batch2Id,
      newAnomalies: comparison.newAnomalies.length,
      correctedAnomalies: comparison.correctedAnomalies.length
    }));

    res.json({
      filePath: exportResult.filePath,
      record: exportResult.record
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/replay', async (req, res) => {
  try {
    const { anomalyId, operator } = req.body;

    const user = await getUserByUsername(operator);
    if (!user || !canExportBatch(user)) {
      return res.status(403).json({ error: '权限不足，只有主管可以导出回放数据' });
    }

    const replay = await getAnomalyReplay(anomalyId);
    if (!replay) {
      return res.status(404).json({ error: '异常记录不存在' });
    }

    const exportResult = await exportReplay(replay, operator);

    await createOperationLog(operator, 'EXPORT', 'anomaly_replay', anomalyId);

    res.json({
      filePath: exportResult.filePath,
      record: exportResult.record
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/filtered', async (req, res) => {
  try {
    const { filters, operator } = req.body;

    const user = await getUserByUsername(operator);
    if (!user || !canExportBatch(user)) {
      return res.status(403).json({ error: '权限不足，只有主管可以导出筛选结果' });
    }

    const anomalies = await getAnomalies(filters);

    if (anomalies.length === 0) {
      return res.status(200).json({
        success: false,
        error: '没有符合条件的数据',
        message: '当前筛选条件下没有可导出的异常记录，请调整筛选条件后重试',
        recordCount: 0
      });
    }

    const exportResult = await exportDetail({ ...filters, exportType: 'FILTERED' }, operator);

    await createOperationLog(operator, 'EXPORT', 'filtered_anomalies', undefined, JSON.stringify(filters));

    res.json({
      filePath: exportResult.filePath,
      record: exportResult.record,
      recordCount: anomalies.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/anomalies/:id/check-conflict', async (req, res) => {
  try {
    const { currentVersion, operator } = req.query as any;

    const anomaly = await getAnomalyById(req.params.id);
    if (!anomaly) {
      return res.status(404).json({ error: '异常记录不存在' });
    }

    const user = await getUserByUsername(operator);
    if (!user || !canViewAnomaly(user, anomaly.resolvedBy)) {
      return res.status(403).json({ error: '您没有权限查看此异常记录' });
    }

    if (currentVersion && anomaly.currentVersion !== currentVersion) {
      const dbModule = await import('./database.js');
      const db = dbModule.getDatabase();
      const correctionResult = db.exec(`
        SELECT operator, operated_at FROM corrections
        WHERE anomaly_id = ? AND version >= ?
        ORDER BY operated_at DESC LIMIT 1
      `, [req.params.id, currentVersion]);

      let lastOperator = undefined;
      let lastOperatedAt = undefined;
      if (correctionResult.length > 0 && correctionResult[0].values.length > 0) {
        lastOperator = correctionResult[0].values[0][0];
        lastOperatedAt = correctionResult[0].values[0][1];
      }

      return res.status(409).json({
        isConflict: true,
        message: '数据已被其他用户修改，请刷新后重试',
        currentVersion: anomaly.currentVersion,
        previousValue: anomaly.correctedValue ?? anomaly.rawValue,
        lastOperator,
        lastOperatedAt
      });
    }

    res.json({ isConflict: false, currentVersion: anomaly.currentVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalies/:id/verify-revert', async (req, res) => {
  try {
    const { operator } = req.body;

    const anomaly = await getAnomalyById(req.params.id);
    if (!anomaly) {
      return res.status(404).json({ error: '异常记录不存在' });
    }

    const user = await getUserByUsername(operator);
    if (!user || !canRevertAnomaly(user, anomaly.resolvedBy)) {
      return res.status(403).json({
        error: '权限不足',
        message: '只有原始处理人或主管可以撤销此异常'
      });
    }

    res.json({ canRevert: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  closeDatabase();
  process.exit(0);
});

startServer();
