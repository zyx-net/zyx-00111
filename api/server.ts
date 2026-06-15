import express from 'express';
import cors from 'cors';
import { initDatabase, closeDatabase } from './database.js';
import { importBatch, getBatches, getBatchById, getReadingsByBatchId, deleteBatch, checkDuplicateReadings, updateBatchAnomalyCount } from './batchService.js';
import { detectAnomalies, createAnomalyRecords, getAnomalies, getAnomalyById, ignoreAnomaly, revertAnomaly } from './anomalyService.js';
import { correctAnomaly, getCorrectionHistory } from './correctionService.js';
import { getCurrentRules, updateRules, getRuleHistory, rollbackToVersion } from './ruleService.js';
import { exportDetail, exportSummary, getExportRecords } from './exportService.js';
import { MeterReading, AnomalyWithReading, MeterType } from './types.js';
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
    const result = await exportDetail(params);
    res.json({
      filePath: result.filePath,
      record: result.record
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/summary', async (req, res) => {
  try {
    const params = req.body;
    const result = await exportSummary(params);
    res.json({
      filePath: result.filePath,
      record: result.record,
      summary: result.summary
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
