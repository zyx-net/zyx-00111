import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { getDatabase, saveDatabase } from './database.js';
import { ExportRecord, ExportType } from './types.js';

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
        SUM(raw_value) as total_raw,
        SUM(corrected_value) as total_corrected
      FROM meter_readings
      WHERE meter_type = ?
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
      const totalCorrected = Number(row[2]) || 0;

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
        totalCorrected,
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
