import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { getDatabase, saveDatabase } from './database.js';
import { ExportRecord, ExportType, BatchComparisonResult, AnomalyReplay } from './types.js';

export async function exportDetail(params: {
  dateFrom?: string;
  dateTo?: string;
  meterType?: string;
  batchId?: string;
}, downloadedBy?: string): Promise<{ filePath: string; record: ExportRecord }> {
  const db = getDatabase();
  const now = new Date().toISOString();

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
    LEFT JOIN batches b ON mr.batch_id = b.id
    LEFT JOIN anomalies a ON mr.id = a.reading_id
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
    const item: any = {};
    const meterTypeIdx = columns.indexOf('meter_type');
    const statusIdx = columns.indexOf('status');
    const anomalyTypeIdx = columns.indexOf('anomaly_type');
    const anomalyStatusIdx = columns.indexOf('anomaly_status');

    columns.forEach((col, i) => {
      if (col === 'meter_type' && row[i]) {
        item['能源类型'] = meterTypeMap[row[i]] || row[i];
      } else if (col === 'status' && row[i]) {
        item['读数状态'] = statusMap[row[i]] || row[i];
      } else if (col === 'anomaly_type' && row[i]) {
        item['异常类型'] = anomalyTypeMap[row[i]] || row[i];
      } else if (col === 'anomaly_status' && row[i]) {
        item['异常状态'] = statusMap[row[i]] || row[i];
      } else if (col === 'raw_value') {
        item['原始值'] = row[i];
      } else if (col === 'corrected_value') {
        item['修正值'] = row[i] ?? '-';
      } else if (col === 'reading_date') {
        item['读数日期'] = row[i];
      } else if (col === 'meter_id') {
        item['表计编号'] = row[i];
      } else if (col === 'batch_no') {
        item['批次号'] = row[i] ?? '-';
      } else if (col === 'remark') {
        item['备注'] = row[i] ?? '';
      }
    });
    return item;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '明细数据');

  const fileName = `energy_detail_${Date.now()}.xlsx`;
  const filePath = `./exports/${fileName}`;

  const exportDir = './exports';
  const fs = await import('fs');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);

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
        type: meterTypeNames[type],
        count,
        totalRaw,
        totalEffective,
        anomalyCount,
        anomalyRate: count > 0 ? ((Number(anomalyCount) / count) * 100).toFixed(2) + '%' : '0%'
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

  const worksheet = XLSX.utils.json_to_sheet([summary]);
  const detailSheet = XLSX.utils.json_to_sheet(summary.byType);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '汇总');
  XLSX.utils.book_append_sheet(workbook, detailSheet, '分类明细');

  const fileName = `energy_summary_${Date.now()}.xlsx`;
  const filePath = `./exports/${fileName}`;

  const exportDir = './exports';
  const fs = await import('fs');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);

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

  const workbook = XLSX.utils.book_new();

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
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, '对比汇总');

  const newAnomalyData = comparison.newAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '新增'
  }));
  const newAnomalySheet = XLSX.utils.json_to_sheet(newAnomalyData);
  XLSX.utils.book_append_sheet(workbook, newAnomalySheet, '新增异常');

  const correctedData = comparison.correctedAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '修正值': a.correctedValue ?? '-',
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已修正'
  }));
  const correctedSheet = XLSX.utils.json_to_sheet(correctedData);
  XLSX.utils.book_append_sheet(workbook, correctedSheet, '已修正异常');

  const ignoredData = comparison.ignoredAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '备注': a.remark || '',
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已忽略'
  }));
  const ignoredSheet = XLSX.utils.json_to_sheet(ignoredData);
  XLSX.utils.book_append_sheet(workbook, ignoredSheet, '已忽略异常');

  const revertedData = comparison.revertedAnomalies.map(a => ({
    '表计编号': a.meterId,
    '能源类型': a.meterType === 'WATER' ? '水' : a.meterType === 'ELECTRICITY' ? '电' : '气',
    '读数日期': a.readingDate,
    '原始值': a.rawValue,
    '异常类型': a.anomalyType === 'JUMP' ? '跳变' : a.anomalyType === 'MISSING' ? '缺失' : '回退',
    '状态': '已撤销'
  }));
  const revertedSheet = XLSX.utils.json_to_sheet(revertedData);
  XLSX.utils.book_append_sheet(workbook, revertedSheet, '已撤销异常');

  const trajectoryData = comparison.meterTrajectory.flatMap(t => {
    const rows: any[] = [];
    t.readings.forEach(r => {
      const anomaly = t.anomalies.find(a => a.readingId === r.id);
      const corrections = t.corrections.filter(c => c.readingId === r.id);
      rows.push({
        '表计编号': t.meterId,
        '能源类型': t.meterType === 'WATER' ? '水' : t.meterType === 'ELECTRICITY' ? '电' : '气',
        '读数日期': r.readingDate,
        '原始值': r.rawValue,
        '修正值': r.correctedValue ?? '-',
        '异常状态': anomaly?.status || '-',
        '修正次数': corrections.length,
        '处理人': corrections[0]?.operator || '-',
        '批次': r.batchId === batch1Id ? batch1Info[0] : batch2Info[0]
      });
    });
    return rows;
  });
  const trajectorySheet = XLSX.utils.json_to_sheet(trajectoryData);
  XLSX.utils.book_append_sheet(workbook, trajectorySheet, '表计轨迹');

  const fileName = `batch_compare_${Date.now()}.xlsx`;
  const filePath = `./exports/${fileName}`;

  const exportDir = './exports';
  const fs = await import('fs');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);

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

  const workbook = XLSX.utils.book_new();

  const anomalyInfo = [
    { '项目': '异常ID', '值': replay.anomalyId },
    { '项目': '表计编号', '值': replay.meterId },
    { '项目': '能源类型', '值': replay.meterType === 'WATER' ? '水' : replay.meterType === 'ELECTRICITY' ? '电' : '气' },
    { '项目': '读数日期', '值': replay.readingDate },
    { '项目': '原始值', '值': replay.rawValue },
    { '项目': '修正值', '值': replay.correctedValue ?? '-' },
    { '项目': '异常类型', '值': replay.anomalyType === 'JUMP' ? '跳变' : replay.anomalyType === 'MISSING' ? '缺失' : '回退' },
    { '项目': '初始状态', '值': '待复核' },
    { '项目': '最终状态', '值': replay.finalStatus === 'CORRECTED' ? '已修正' : replay.finalStatus === 'IGNORED' ? '已忽略' : replay.finalStatus === 'REVERTED' ? '已撤销' : '待复核' },
  ];
  const infoSheet = XLSX.utils.json_to_sheet(anomalyInfo);
  XLSX.utils.book_append_sheet(workbook, infoSheet, '异常信息');

  const correctionData = replay.corrections.map(c => ({
    '操作人': c.operator,
    '原值': c.originalValue,
    '新值': c.newValue,
    '操作时间': c.operatedAt,
    '版本': c.version
  }));
  const correctionSheet = XLSX.utils.json_to_sheet(correctionData);
  XLSX.utils.book_append_sheet(workbook, correctionSheet, '修正历史');

  const ruleData = replay.ruleSnapshot.map(r => ({
    '配置项': r.configKey === 'jumpThreshold' ? '跳变阈值' : r.configKey === 'missingDays' ? '缺失判定天数' : '回退检测开关',
    '配置值': r.configKey === 'rollbackEnabled' ? (r.configValue === 'true' ? '启用' : '禁用') : r.configValue,
    '版本': r.version,
    '生效时间': r.effectiveFrom
  }));
  const ruleSheet = XLSX.utils.json_to_sheet(ruleData);
  XLSX.utils.book_append_sheet(workbook, ruleSheet, '阈值配置');

  const timelineData = replay.processedAt.map((t, i) => ({
    '时间': t,
    '事件': i === 0 ? '检测到异常' : i === replay.processedAt.length - 1 ? '处理完成' : `第${i}次修正`
  }));
  const timelineSheet = XLSX.utils.json_to_sheet(timelineData);
  XLSX.utils.book_append_sheet(workbook, timelineSheet, '处理时间线');

  const fileName = `anomaly_replay_${replay.anomalyId}_${Date.now()}.xlsx`;
  const filePath = `./exports/${fileName}`;

  const exportDir = './exports';
  const fs = await import('fs');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);

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
