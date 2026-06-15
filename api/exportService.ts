import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { ExportRecord, ExportType, BatchComparisonResult, AnomalyReplay } from './types.js';

function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvLines: string[] = [];

  csvLines.push(headers.map(h => escapeCSVValue(h)).join(','));

  for (const row of data) {
    const values = headers.map(h => escapeCSVValue(row[h]));
    csvLines.push(values.join(','));
  }

  return '\ufeff' + csvLines.join('\r\n');
}

function toCSVNoBOM(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvLines: string[] = [];

  csvLines.push(headers.map(h => escapeCSVValue(h)).join(','));

  for (const row of data) {
    const values = headers.map(h => escapeCSVValue(row[h]));
    csvLines.push(values.join(','));
  }

  return csvLines.join('\r\n');
}

async function ensureExportDir(): Promise<string> {
  const exportDir = './exports';
  const fs = await import('fs');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  return exportDir;
}

async function saveCSVFile(fileName: string, content: string): Promise<string> {
  const exportDir = await ensureExportDir();
  const filePath = `${exportDir}/${fileName}`;
  const fs = await import('fs');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export async function exportDetail(params: {
  dateFrom?: string;
  dateTo?: string;
  meterType?: string;
  batchId?: string;
  status?: string;
  type?: string;
}, downloadedBy?: string): Promise<{ filePath: string; record: ExportRecord }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const hasAnomalyFilter = params.status || params.type;

  let query = `
    SELECT
      mr.meter_id,
      mr.meter_type,
      mr.reading_date,
      mr.raw_value,
      mr.corrected_value,
      mr.status,
      b.batch_no,
      a.anomaly_type,
      a.status as anomaly_status,
      a.remark
    FROM meter_readings mr
  `;

  if (hasAnomalyFilter) {
    query += ` INNER JOIN anomalies a ON mr.id = a.reading_id`;
  } else {
    query += ` LEFT JOIN anomalies a ON mr.id = a.reading_id`;
  }

  query += `
    LEFT JOIN batches b ON mr.batch_id = b.id
    WHERE 1=1
  `;

  const queryParams: any[] = [];

  if (params.dateFrom) {
    query += ` AND mr.reading_date >= ?`;
    queryParams.push(params.dateFrom);
  }

  if (params.dateTo) {
    query += ` AND mr.reading_date <= ?`;
    queryParams.push(params.dateTo);
  }

  if (params.meterType) {
    query += ` AND mr.meter_type = ?`;
    queryParams.push(params.meterType);
  }

  if (params.batchId) {
    query += ` AND mr.batch_id = ?`;
    queryParams.push(params.batchId);
  }

  if (params.status) {
    query += ` AND a.status = ?`;
    queryParams.push(params.status);
  }

  if (params.type) {
    query += ` AND a.anomaly_type = ?`;
    queryParams.push(params.type);
  }

  query += ` ORDER BY mr.reading_date DESC, mr.meter_id`;

  const results = db.exec(query, queryParams);

  const data = results.length > 0 ? results[0].values : [];
  const columns = results.length > 0 ? results[0].columns : [
    'meter_id', 'meter_type', 'reading_date', 'raw_value', 'corrected_value',
    'status', 'batch_no', 'anomaly_type', 'anomaly_status', 'remark'
  ];

  const meterTypeMap: Record<string, string> = {
    'WATER': '水',
    'ELECTRICITY': '电',
    'GAS': '气'
  };

  const statusMap: Record<string, string> = {
    'RAW': '原始',
    'ABNORMAL': '异常',
    'CORRECTED': '已修正',
    'IGNORED': '已忽略'
  };

  const anomalyTypeMap: Record<string, string> = {
    'JUMP': '跳变',
    'MISSING': '缺失',
    'ROLLBACK': '回退'
  };

  const exportData = data.map((row: any[]) => {
    const item: Record<string, any> = {};

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const value = row[i];

      if (col === 'meter_type') {
        item['能源类型'] = value ? (meterTypeMap[value] || value) : '';
      } else if (col === 'status' && col === 'status') {
        item['读数状态'] = value ? (statusMap[value] || value) : '';
      } else if (col === 'anomaly_type') {
        item['异常类型'] = value ? (anomalyTypeMap[value] || value) : '';
      } else if (col === 'anomaly_status') {
        item['异常状态'] = value ? (statusMap[value] || value) : '';
      } else if (col === 'raw_value') {
        item['原始值'] = value ?? '';
      } else if (col === 'corrected_value') {
        item['修正值'] = value ?? '';
      } else if (col === 'reading_date') {
        item['读数日期'] = value ?? '';
      } else if (col === 'meter_id') {
        item['表计编号'] = value ?? '';
      } else if (col === 'batch_no') {
        item['批次号'] = value ?? '';
      } else if (col === 'remark') {
        item['备注'] = value ?? '';
      }
    }

    return item;
  });

  const csvContent = toCSV(exportData);
  const fileName = `energy_detail_${Date.now()}.csv`;
  const filePath = await saveCSVFile(fileName, csvContent);

  const recordId = uuidv4();
  db.run(
    `INSERT INTO export_records (id, export_type, params, downloaded_at, downloaded_by) VALUES (?, ?, ?, ?, ?)`,
    [recordId, 'DETAIL', JSON.stringify(params), now, downloadedBy || 'system']
  );
  saveDatabase();

  const record: ExportRecord = {
    id: recordId,
    exportType: 'DETAIL' as ExportType,
    params: JSON.stringify(params),
    downloadedAt: now,
    downloadedBy: downloadedBy || 'system'
  };

  return { filePath, record };
}

export async function exportSummary(params: {
  dateFrom?: string;
  dateTo?: string;
}, downloadedBy?: string): Promise<{ filePath: string; record: ExportRecord; summary: any }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const meterTypes = ['WATER', 'ELECTRICITY', 'GAS'];
  const meterTypeNames: Record<string, string> = {
    'WATER': '水',
    'ELECTRICITY': '电',
    'GAS': '气'
  };

  const summary: any = {
    totalCount: 0,
    totalRawValue: 0,
    byType: [] as any[]
  };

  for (const type of meterTypes) {
    let query = `
      SELECT
        COUNT(*) as count,
        SUM(mr.raw_value) as total_raw,
        SUM(
          CASE
            WHEN a.status = 'CORRECTED' AND mr.corrected_value IS NOT NULL THEN mr.corrected_value
            ELSE mr.raw_value
          END
        ) as total_effective
      FROM meter_readings mr
      LEFT JOIN anomalies a ON mr.id = a.reading_id
      WHERE mr.meter_type = ?
    `;
    const queryParams: any[] = [type];

    if (params.dateFrom) {
      query += ` AND reading_date >= ?`;
      queryParams.push(params.dateFrom);
    }

    if (params.dateTo) {
      query += ` AND reading_date <= ?`;
      queryParams.push(params.dateTo);
    }

    const results = db.exec(query, queryParams);
    if (results.length > 0 && results[0].values.length > 0) {
      const row = results[0].values[0];
      const count = Number(row[0]) || 0;
      const totalRaw = Number(row[1]) || 0;
      const totalEffective = Number(row[2]) || 0;

      summary.totalCount += count;
      summary.totalRawValue += totalRaw;

      let anomalyQuery = `
        SELECT COUNT(*) as anomaly_count
        FROM anomalies a
        JOIN meter_readings mr ON a.reading_id = mr.id
        WHERE mr.meter_type = ? AND a.status != 'PENDING'
      `;
      const anomalyParams: any[] = [type];

      if (params.dateFrom) {
        anomalyQuery += ` AND mr.reading_date >= ?`;
        anomalyParams.push(params.dateFrom);
      }

      if (params.dateTo) {
        anomalyQuery += ` AND mr.reading_date <= ?`;
        anomalyParams.push(params.dateTo);
      }

      const anomalyResults = db.exec(anomalyQuery, anomalyParams);
      const anomalyCount = anomalyResults[0]?.values[0]?.[0] || 0;

      summary.byType.push({
        能源类型: meterTypeNames[type],
        记录数: count,
        原始值合计: totalRaw,
        有效值合计: totalEffective,
        异常数: Number(anomalyCount),
        异常率: count > 0 ? ((Number(anomalyCount) / count) * 100).toFixed(2) + '%' : '0%'
      });
    }
  }

  const pendingAnomalyQuery = `
    SELECT COUNT(*) as pending_count
    FROM anomalies
    WHERE status = 'PENDING'
  `;
  const pendingResults = db.exec(pendingAnomalyQuery);
  summary.pendingAnomalyCount = pendingResults[0]?.values[0]?.[0] || 0;

  const csvContent = toCSV([summary, ...summary.byType]);
  const fileName = `energy_summary_${Date.now()}.csv`;
  const filePath = await saveCSVFile(fileName, csvContent);

  const recordId = uuidv4();
  db.run(
    `INSERT INTO export_records (id, export_type, params, downloaded_at, downloaded_by) VALUES (?, ?, ?, ?, ?)`,
    [recordId, 'SUMMARY', JSON.stringify(params), now, downloadedBy || 'system']
  );
  saveDatabase();

  const record: ExportRecord = {
    id: recordId,
    exportType: 'SUMMARY' as ExportType,
    params: JSON.stringify(params),
    downloadedAt: now,
    downloadedBy: downloadedBy || 'system'
  };

  return { filePath, record, summary };
}

export async function getExportRecords(): Promise<ExportRecord[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM export_records ORDER BY downloaded_at DESC`);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const record: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      record[key] = row[i];
    });
    return record as ExportRecord;
  });
}

export async function exportBatchCompare(
  comparison: BatchComparisonResult,
  batch1Id: string,
  batch2Id: string,
  downloadedBy?: string
): Promise<{ filePath: string; record: ExportRecord }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const batch1Result = db.exec(`SELECT batch_no, imported_at FROM batches WHERE id = ?`, [batch1Id]);
  const batch2Result = db.exec(`SELECT batch_no, imported_at FROM batches WHERE id = ?`, [batch2Id]);

  const batch1Info = batch1Result[0]?.values[0] || ['Batch 1', now];
  const batch2Info = batch2Result[0]?.values[0] || ['Batch 2', now];

  const summaryData = [
    { '对比项': '批次1', '值': batch1Info[0] },
    { '对比项': '批次1导入时间', '值': batch1Info[1] },
    { '对比项': '批次2', '值': batch2Info[0] },
    { '对比项': '批次2导入时间', '值': batch2Info[1] },
    { '对比项': '新增异常数', '值': comparison.newAnomalies.length },
    { '对比项': '已修正异常数', '值': comparison.correctedAnomalies.length },
    { '对比项': '已忽略异常数', '值': comparison.ignoredAnomalies.length },
    { '对比项': '已撤销异常数', '值': comparison.revertedAnomalies.length },
    { '对比项': '未变化异常数', '值': comparison.unchangedAnomalies.length },
  ];

  const newAnomalyData = comparison.newAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '新增'
  }));

  const correctedData = comparison.correctedAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '修正值': a.correctedValue ?? '',
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已修正'
  }));

  const ignoredData = comparison.ignoredAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '备注': a.remark || '',
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已忽略'
  }));

  const revertedData = comparison.revertedAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已撤销'
  }));

  const trajectoryData = comparison.meterTrajectory.flatMap(t =>
    t.readings.map(r => {
      const anomaly = t.anomalies.find(a => a.readingId === r.id);
      const corrections = t.corrections.filter(c => c.readingId === r.id);
      return {
        '表计编号': t.meterId,
        '能源类型': t.meterType === 'WATER' ? '水' : t.meterType === 'ELECTRICITY' ? '电' : '气',
        '读数日期': r.readingDate,
        '原始值': r.rawValue,
        '修正值': r.correctedValue ?? '',
        '异常状态': anomaly?.status || '',
        '修正次数': corrections.length,
        '处理人': corrections[0]?.operator || '',
        '批次': r.batchId === batch1Id ? batch1Info[0] : batch2Info[0]
      };
    })
  );

  const csvContent = [
    toCSVNoBOM(summaryData),
    '',
    '【新增异常】',
    newAnomalyData.length > 0 ? toCSVNoBOM(newAnomalyData) : '（无新增异常）',
    '',
    '【已修正异常】',
    correctedData.length > 0 ? toCSVNoBOM(correctedData) : '（无已修正异常）',
    '',
    '【已忽略异常】',
    ignoredData.length > 0 ? toCSVNoBOM(ignoredData) : '（无已忽略异常）',
    '',
    '【已撤销异常】',
    revertedData.length > 0 ? toCSVNoBOM(revertedData) : '（无已撤销异常）',
    '',
    '【表计轨迹】',
    trajectoryData.length > 0 ? toCSVNoBOM(trajectoryData) : '（无轨迹数据）'
  ].join('\r\n');

  const fileName = `batch_compare_${Date.now()}.csv`;
  const filePath = await saveCSVFile(fileName, csvContent);

  const recordId = uuidv4();
  db.run(
    `INSERT INTO export_records (id, export_type, params, downloaded_at, downloaded_by) VALUES (?, ?, ?, ?, ?)`,
    [recordId, 'BATCH_COMPARE', JSON.stringify({ batch1Id, batch2Id }), now, downloadedBy || 'system']
  );
  saveDatabase();

  const record: ExportRecord = {
    id: recordId,
    exportType: 'BATCH_COMPARE' as ExportType,
    params: JSON.stringify({ batch1Id, batch2Id }),
    downloadedAt: now,
    downloadedBy: downloadedBy || 'system'
  };

  return { filePath, record };
}

export async function exportReplay(
  replay: AnomalyReplay,
  downloadedBy?: string
): Promise<{ filePath: string; record: ExportRecord }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const anomalyInfo = [
    { '项目': '异常ID', '值': replay.anomalyId },
    { '项目': '表计编号', '值': replay.meterId },
    { '项目': '能源类型', '值': replay.meterType === 'WATER' ? '水' : replay.meterType === 'ELECTRICITY' ? '电' : '气' },
    { '项目': '读数日期', '值': replay.readingDate },
    { '项目': '原始值', '值': replay.rawValue },
    { '项目': '修正值', '值': replay.correctedValue ?? '' },
    { '项目': '异常类型', '值': replay.anomalyType === 'JUMP' ? '跳变' : replay.anomalyType === 'MISSING' ? '缺失' : '回退' },
    { '项目': '初始状态', '值': '待复核' },
    { '项目': '最终状态', '值': replay.finalStatus === 'CORRECTED' ? '已修正' : replay.finalStatus === 'IGNORED' ? '已忽略' : replay.finalStatus === 'REVERTED' ? '已撤销' : '待复核' },
  ];

  const correctionData = replay.corrections.map(c => ({
    '操作人': c.operator,
    '原值': c.originalValue,
    '新值': c.newValue,
    '操作时间': c.operatedAt,
    '版本': c.version
  }));

  const ruleData = replay.ruleSnapshot.map(r => ({
    '配置项': r.configKey === 'jumpThreshold' ? '跳变阈值' : r.configKey === 'missingDays' ? '缺失判定天数' : '回退检测',
    '配置值': r.configKey === 'rollbackEnabled' ? (r.configValue === 'true' ? '启用' : '禁用') : r.configValue,
    '版本': r.version,
    '生效时间': r.effectiveFrom
  }));

  const timelineData = replay.processedAt.map((t, i) => ({
    '时间': t,
    '事件': i === 0 ? '检测到异常' : i === replay.processedAt.length - 1 ? '处理完成' : `第${i}次修正`
  }));

  const csvContent = [
    '【异常信息】',
    toCSVNoBOM(anomalyInfo),
    '',
    '【修正历史】',
    correctionData.length > 0 ? toCSVNoBOM(correctionData) : '（无修正历史）',
    '',
    '【阈值配置】',
    ruleData.length > 0 ? toCSVNoBOM(ruleData) : '（无配置快照）',
    '',
    '【处理时间线】',
    toCSVNoBOM(timelineData)
  ].join('\r\n');

  const fileName = `anomaly_replay_${replay.anomalyId}_${Date.now()}.csv`;
  const filePath = await saveCSVFile(fileName, csvContent);

  const recordId = uuidv4();
  db.run(
    `INSERT INTO export_records (id, export_type, params, downloaded_at, downloaded_by) VALUES (?, ?, ?, ?, ?)`,
    [recordId, 'REPLAY', JSON.stringify({ anomalyId: replay.anomalyId }), now, downloadedBy || 'system']
  );
  saveDatabase();

  const record: ExportRecord = {
    id: recordId,
    exportType: 'REPLAY' as ExportType,
    params: JSON.stringify({ anomalyId: replay.anomalyId }),
    downloadedAt: now,
    downloadedBy: downloadedBy || 'system'
  };

  return { filePath, record };
}
