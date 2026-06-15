import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { User, UserRole } from './types.js';

export interface DeliveryPackage {
  id: string;
  packageName: string;
  packageNo: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: PackageStatus;
  recordCount: number;
  fileCount: number;
  totalSize: number;
  filePath?: string;
  version: number;
  lockedBy?: string;
  lockedAt?: string;
  manifestSnapshot?: string;
}

export interface PackageRecord {
  id: string;
  packageId: string;
  readingId?: string;
  anomalyId?: string;
  batchId?: string;
  recordType: string;
  includedAt: string;
  includedBy: string;
}

export interface PackageTask {
  id: string;
  packageId: string;
  taskType: TaskType;
  status: TaskStatus;
  progress: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  configSnapshot?: string;
}

export interface PackageDownload {
  id: string;
  packageId: string;
  downloadedBy: string;
  downloadedAt: string;
  fileVersion?: string;
  filePath?: string;
  recordCount: number;
  ipAddress?: string;
}

export interface PackageAuditLog {
  id: string;
  packageId?: string;
  operation: string;
  operator: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
  result?: string;
  createdAt: string;
}

export interface PackageVersion {
  id: string;
  packageId: string;
  version: number;
  filePath?: string;
  recordCount: number;
  createdBy: string;
  createdAt: string;
  changeSummary?: string;
  isActive: boolean;
}

export type PackageStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskType = 'GENERATE' | 'VALIDATE' | 'ARCHIVE';
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

function generatePackageNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.getTime().toString().slice(-6);
  return `PKG${dateStr}${timeStr}`;
}

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

export function canCreatePackage(user: User): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'REVIEWER';
}

export function canViewPackage(user: User, packageCreatedBy: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    return true;
  }
  return user.username === packageCreatedBy;
}

export function canModifyPackage(user: User, packageCreatedBy: string, lockedBy?: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    if (lockedBy && lockedBy !== user.username) {
      return false;
    }
    return true;
  }
  if (lockedBy && lockedBy !== user.username) {
    return false;
  }
  return user.username === packageCreatedBy;
}

export function canDeletePackage(user: User, packageCreatedBy: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    return true;
  }
  return user.username === packageCreatedBy;
}

export function canDownloadPackage(user: User): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'REVIEWER';
}

export function canViewAuditLogs(user: User): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR';
}

export async function createDeliveryPackage(
  name: string,
  description: string,
  createdBy: string,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    meterType?: string;
    status?: string;
    batchId?: string;
  }
): Promise<{ package: DeliveryPackage; taskId: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const packageId = uuidv4();
  const packageNo = generatePackageNo();
  const taskId = uuidv4();

  db.run(
    `INSERT INTO delivery_packages (id, package_name, package_no, description, created_by, created_at, updated_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [packageId, name, packageNo, description, createdBy, now, now]
  );

  db.run(
    `INSERT INTO delivery_package_tasks (id, package_id, task_type, status, created_at, config_snapshot)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    [taskId, packageId, 'GENERATE', now, JSON.stringify(filters)]
  );

  await createAuditLog(packageId, 'CREATE_PACKAGE', createdBy, 'package', packageId, JSON.stringify({ name, filters }), 'SUCCESS');

  saveDatabase();

  return {
    package: {
      id: packageId,
      packageName: name,
      packageNo,
      description,
      createdBy,
      createdAt: now,
      updatedAt: now,
      status: 'PENDING',
      recordCount: 0,
      fileCount: 0,
      totalSize: 0,
      version: 1
    },
    taskId
  };
}

export async function addRecordsToPackage(
  packageId: string,
  records: Array<{
    readingId?: string;
    anomalyId?: string;
    batchId?: string;
    recordType: string;
  }>,
  operator: string
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  for (const record of records) {
    const recordId = uuidv4();
    db.run(
      `INSERT INTO delivery_package_records (id, package_id, reading_id, anomaly_id, batch_id, record_type, included_at, included_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recordId, packageId, record.readingId || null, record.anomalyId || null, record.batchId || null, record.recordType, now, operator]
    );
  }

  const countResult = db.exec(`SELECT COUNT(*) FROM delivery_package_records WHERE package_id = ?`, [packageId]);
  const recordCount = countResult[0]?.values[0]?.[0] || 0;

  db.run(`UPDATE delivery_packages SET record_count = ?, updated_at = ? WHERE id = ?`, [recordCount, now, packageId]);

  await createAuditLog(packageId, 'ADD_RECORDS', operator, 'record', undefined, JSON.stringify({ count: records.length }), 'SUCCESS');

  saveDatabase();
}

export async function getPackageById(packageId: string): Promise<DeliveryPackage | null> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM delivery_packages WHERE id = ?`, [packageId]);

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const pkg: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    pkg[key] = row[i];
  });
  return pkg as DeliveryPackage;
}

export async function getPackages(filters?: {
  status?: PackageStatus;
  createdBy?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<DeliveryPackage[]> {
  const db = getDatabase();
  let query = `SELECT * FROM delivery_packages WHERE 1=1`;
  const params: any[] = [];

  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  if (filters?.createdBy) {
    query += ` AND created_by = ?`;
    params.push(filters.createdBy);
  }

  if (filters?.fromDate) {
    query += ` AND created_at >= ?`;
    params.push(filters.fromDate);
  }

  if (filters?.toDate) {
    query += ` AND created_at <= ?`;
    params.push(filters.toDate);
  }

  query += ` ORDER BY created_at DESC`;

  const results = db.exec(query, params);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const pkg: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      pkg[key] = row[i];
    });
    return pkg as DeliveryPackage;
  });
}

export async function getPackageRecords(packageId: string): Promise<PackageRecord[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM delivery_package_records WHERE package_id = ?`, [packageId]);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const record: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      record[key] = row[i];
    });
    return record as PackageRecord;
  });
}

export async function getPackageTasks(packageId: string): Promise<PackageTask[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM delivery_package_tasks WHERE package_id = ? ORDER BY created_at DESC`, [packageId]);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const task: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      task[key] = row[i];
    });
    return task as PackageTask;
  });
}

export async function getPackageDownloads(packageId: string): Promise<PackageDownload[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM delivery_package_downloads WHERE package_id = ? ORDER BY downloaded_at DESC`, [packageId]);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const download: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      download[key] = row[i];
    });
    return download as PackageDownload;
  });
}

export async function getPackageVersions(packageId: string): Promise<PackageVersion[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM delivery_package_versions WHERE package_id = ? ORDER BY version DESC`, [packageId]);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const version: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      version[key] = row[i];
    });
    return version as PackageVersion;
  });
}

export async function getAuditLogs(packageId?: string, operator?: string): Promise<PackageAuditLog[]> {
  const db = getDatabase();
  let query = `SELECT * FROM delivery_package_audit_logs WHERE 1=1`;
  const params: any[] = [];

  if (packageId) {
    query += ` AND package_id = ?`;
    params.push(packageId);
  }

  if (operator) {
    query += ` AND operator = ?`;
    params.push(operator);
  }

  query += ` ORDER BY created_at DESC LIMIT 100`;

  const results = db.exec(query, params);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const log: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      log[key] = row[i];
    });
    return log as PackageAuditLog;
  });
}

export async function createAuditLog(
  packageId: string | undefined,
  operation: string,
  operator: string,
  targetType?: string,
  targetId?: string,
  details?: string,
  result?: string,
  ipAddress?: string
): Promise<void> {
  const db = getDatabase();
  const logId = uuidv4();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO delivery_package_audit_logs (id, package_id, operation, operator, target_type, target_id, details, ip_address, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [logId, packageId || null, operation, operator, targetType || null, targetId || null, details || null, ipAddress || null, result || null, now]
  );
}

export async function lockPackage(packageId: string, user: string): Promise<{ success: boolean; message?: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    return { success: false, message: '交付包不存在' };
  }

  if (pkg.lockedBy && pkg.lockedBy !== user) {
    return { success: false, message: `该交付包已被用户 ${pkg.lockedBy} 锁定` };
  }

  db.run(`UPDATE delivery_packages SET locked_by = ?, locked_at = ?, updated_at = ? WHERE id = ?`, [user, now, now, packageId]);

  await createAuditLog(packageId, 'LOCK', user, 'package', packageId, undefined, 'SUCCESS');

  saveDatabase();
  return { success: true };
}

export async function unlockPackage(packageId: string, user: string): Promise<{ success: boolean; message?: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    return { success: false, message: '交付包不存在' };
  }

  if (pkg.lockedBy && pkg.lockedBy !== user) {
    return { success: false, message: `该交付包已被用户 ${pkg.lockedBy} 锁定，无法解锁` };
  }

  db.run(`UPDATE delivery_packages SET locked_by = NULL, locked_at = NULL, updated_at = ? WHERE id = ?`, [now, packageId]);

  await createAuditLog(packageId, 'UNLOCK', user, 'package', packageId, undefined, 'SUCCESS');

  saveDatabase();
  return { success: true };
}

export async function updatePackageStatus(
  packageId: string,
  status: PackageStatus,
  errorMessage?: string,
  operator?: string
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.run(`UPDATE delivery_packages SET status = ?, updated_at = ? WHERE id = ?`, [status, now, packageId]);

  const taskResult = db.exec(
    `SELECT id FROM delivery_package_tasks WHERE package_id = ? AND task_type = 'GENERATE' ORDER BY created_at DESC LIMIT 1`,
    [packageId]
  );

  if (taskResult.length > 0 && taskResult[0].values.length > 0) {
    const taskId = taskResult[0].values[0][0];
    db.run(
      `UPDATE delivery_package_tasks SET status = ?, progress = ?, error_message = ?, completed_at = ? WHERE id = ?`,
      [status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PROCESSING', status === 'COMPLETED' ? 100 : status === 'PROCESSING' ? 50 : 0, errorMessage || null, status === 'COMPLETED' || status === 'FAILED' ? now : null, taskId]
    );
  }

  if (operator) {
    await createAuditLog(packageId, 'UPDATE_STATUS', operator, 'package', packageId, JSON.stringify({ status, errorMessage }), status === 'FAILED' ? 'FAILED' : 'SUCCESS');
  }

  saveDatabase();
}

export async function generatePackageFile(packageId: string, operator: string): Promise<{ filePath: string; fileName: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    throw new Error('交付包不存在');
  }

  await updatePackageStatus(packageId, 'PROCESSING', undefined, operator);

  const records = await getPackageRecords(packageId);
  const readings: any[] = [];
  const anomalies: any[] = [];

  for (const record of records) {
    if (record.readingId) {
      const readingResult = db.exec(
        `SELECT mr.*, b.batch_no 
         FROM meter_readings mr 
         LEFT JOIN batches b ON mr.batch_id = b.id 
         WHERE mr.id = ?`,
        [record.readingId]
      );
      if (readingResult.length > 0 && readingResult[0].values.length > 0) {
        const row = readingResult[0].values[0];
        readings.push({
          表计编号: row[1],
          读数日期: row[2],
          原始值: row[3],
          修正值: row[4],
          能源类型: row[5] === 'WATER' ? '水' : row[5] === 'ELECTRICITY' ? '电' : '气',
          批次号: row[12]
        });
      }
    }

    if (record.anomalyId) {
      const anomalyResult = db.exec(
        `SELECT a.*, mr.meter_id, mr.meter_type, mr.reading_date, mr.raw_value 
         FROM anomalies a 
         JOIN meter_readings mr ON a.reading_id = mr.id 
         WHERE a.id = ?`,
        [record.anomalyId]
      );
      if (anomalyResult.length > 0 && anomalyResult[0].values.length > 0) {
        const row = anomalyResult[0].values[0];
        anomalies.push({
          表计编号: row[8],
          读数日期: row[9],
          原始值: row[10],
          异常类型: row[2] === 'JUMP' ? '跳变' : row[2] === 'MISSING' ? '缺失' : '回退',
          异常状态: row[4]
        });
      }
    }
  }

  const meterTypeMap: Record<string, string> = { 'WATER': '水', 'ELECTRICITY': '电', 'GAS': '气' };
  const statusMap: Record<string, string> = { 'PENDING': '待复核', 'CORRECTED': '已修正', 'IGNORED': '已忽略', 'REVERTED': '已撤销' };
  const anomalyTypeMap: Record<string, string> = { 'JUMP': '跳变', 'MISSING': '缺失', 'ROLLBACK': '回退' };

  const manifestData = [
    { 项目: '交付包名称', 值: pkg.packageName },
    { 项目: '交付包编号', 值: pkg.packageNo },
    { 项目: '创建人', 值: pkg.createdBy },
    { 项目: '创建时间', 值: pkg.createdAt },
    { 项目: '状态', 值: statusMap[pkg.status] || pkg.status },
    { 项目: '记录总数', 值: readings.length + anomalies.length },
    { 项目: '读数记录数', 值: readings.length },
    { 项目: '异常记录数', 值: anomalies.length }
  ];

  const csvContent = [
    '【交付包清单】',
    toCSV(manifestData),
    '',
    '【读数明细】',
    readings.length > 0 ? toCSV(readings) : '（无读数记录）',
    '',
    '【异常明细】',
    anomalies.length > 0 ? toCSV(anomalies) : '（无异常记录）'
  ].join('\r\n');

  const timestamp = Date.now();
  const fileName = `delivery_package_${pkg.packageNo}_${timestamp}.csv`;
  const filePath = await saveCSVFile(fileName, csvContent);

  const versionId = uuidv4();
  db.run(
    `INSERT INTO delivery_package_versions (id, package_id, version, file_path, record_count, created_by, created_at, change_summary, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [versionId, packageId, pkg.version, fileName, records.length, operator, now, '初始版本']
  );

  db.run(`UPDATE delivery_packages SET file_path = ?, total_size = ?, status = 'COMPLETED', updated_at = ? WHERE id = ?`, [fileName, csvContent.length, now, packageId]);

  db.run(`UPDATE delivery_package_versions SET is_active = 0 WHERE package_id = ? AND id != ?`, [packageId, versionId]);

  const taskResult = db.exec(
    `SELECT id FROM delivery_package_tasks WHERE package_id = ? AND task_type = 'GENERATE' ORDER BY created_at DESC LIMIT 1`,
    [packageId]
  );
  if (taskResult.length > 0 && taskResult[0].values.length > 0) {
    const taskId = taskResult[0].values[0][0];
    db.run(`UPDATE delivery_package_tasks SET status = 'COMPLETED', progress = 100, completed_at = ? WHERE id = ?`, [now, taskId]);
  }

  await createAuditLog(packageId, 'GENERATE_FILE', operator, 'package', packageId, JSON.stringify({ fileName, recordCount: records.length }), 'SUCCESS');

  saveDatabase();

  return { filePath, fileName };
}

export async function downloadPackage(packageId: string, downloadedBy: string, ipAddress?: string): Promise<{ filePath: string; fileName: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    throw new Error('交付包不存在');
  }

  if (pkg.status !== 'COMPLETED' || !pkg.filePath) {
    throw new Error('交付包文件尚未生成');
  }

  const downloadId = uuidv4();
  db.run(
    `INSERT INTO delivery_package_downloads (id, package_id, downloaded_by, downloaded_at, file_version, file_path, record_count, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [downloadId, packageId, downloadedBy, now, `v${pkg.version}`, pkg.filePath, pkg.recordCount, ipAddress || null]
  );

  await createAuditLog(packageId, 'DOWNLOAD', downloadedBy, 'package', packageId, JSON.stringify({ version: pkg.version }), 'SUCCESS');

  saveDatabase();

  return { filePath: pkg.filePath, fileName: pkg.filePath };
}

export async function cancelPackage(packageId: string, operator: string, reason?: string): Promise<{ success: boolean; message?: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    return { success: false, message: '交付包不存在' };
  }

  if (pkg.status === 'COMPLETED') {
    return { success: false, message: '已完成的交付包不能取消' };
  }

  db.run(`UPDATE delivery_packages SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [now, packageId]);

  db.run(`UPDATE delivery_package_tasks SET status = 'CANCELLED', completed_at = ? WHERE package_id = ? AND status = 'PENDING'`, [now, packageId]);

  await createAuditLog(packageId, 'CANCEL', operator, 'package', packageId, JSON.stringify({ reason }), 'SUCCESS');

  saveDatabase();
  return { success: true };
}

export async function deletePackage(packageId: string, operator: string): Promise<{ success: boolean; message?: string }> {
  const db = getDatabase();

  const pkg = await getPackageById(packageId);
  if (!pkg) {
    return { success: false, message: '交付包不存在' };
  }

  await createAuditLog(packageId, 'DELETE', operator, 'package', packageId, JSON.stringify({ name: pkg.packageName, no: pkg.packageNo }), 'SUCCESS');

  db.run(`DELETE FROM delivery_package_versions WHERE package_id = ?`, [packageId]);
  db.run(`DELETE FROM delivery_package_downloads WHERE package_id = ?`, [packageId]);
  db.run(`DELETE FROM delivery_package_tasks WHERE package_id = ?`, [packageId]);
  db.run(`DELETE FROM delivery_package_records WHERE package_id = ?`, [packageId]);
  db.run(`DELETE FROM delivery_packages WHERE id = ?`, [packageId]);

  saveDatabase();
  return { success: true };
}

export async function rebuildPackage(packageId: string, operator: string): Promise<{ package: DeliveryPackage; taskId: string }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const oldPkg = await getPackageById(packageId);
  if (!oldPkg) {
    throw new Error('交付包不存在');
  }

  if (oldPkg.status !== 'CANCELLED' && oldPkg.status !== 'FAILED') {
    throw new Error('只能重建已取消或失败的交付包');
  }

  const newVersion = oldPkg.version + 1;
  db.run(
    `UPDATE delivery_packages SET status = 'PENDING', version = ?, locked_by = NULL, locked_at = NULL, updated_at = ? WHERE id = ?`,
    [newVersion, now, packageId]
  );

  const taskId = uuidv4();
  db.run(
    `INSERT INTO delivery_package_tasks (id, package_id, task_type, status, created_at, config_snapshot)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    [taskId, packageId, 'GENERATE', now, JSON.stringify({ rebuild: true, oldVersion: oldPkg.version })]
  );

  await createAuditLog(packageId, 'REBUILD', operator, 'package', packageId, JSON.stringify({ oldVersion: oldPkg.version, newVersion }), 'SUCCESS');

  saveDatabase();

  const newPkg = await getPackageById(packageId);
  return { package: newPkg!, taskId };
}

export async function getPendingTasks(): Promise<PackageTask[]> {
  const db = getDatabase();
  const results = db.exec(
    `SELECT t.* FROM delivery_package_tasks t 
     JOIN delivery_packages p ON t.package_id = p.id 
     WHERE t.status = 'PENDING' AND p.status = 'PENDING' 
     ORDER BY t.created_at ASC`
  );

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const task: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      task[key] = row[i];
    });
    return task as PackageTask;
  });
}

export async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
  const db = getDatabase();
  db.run(`UPDATE delivery_package_tasks SET progress = ? WHERE id = ?`, [progress, taskId]);
  saveDatabase();
}

export async function getAllDownloadRecords(filters?: {
  downloadedBy?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<PackageDownload[]> {
  const db = getDatabase();
  let query = `SELECT d.*, p.package_name, p.package_no 
               FROM delivery_package_downloads d 
               JOIN delivery_packages p ON d.package_id = p.id 
               WHERE 1=1`;
  const params: any[] = [];

  if (filters?.downloadedBy) {
    query += ` AND d.downloaded_by = ?`;
    params.push(filters.downloadedBy);
  }

  if (filters?.fromDate) {
    query += ` AND d.downloaded_at >= ?`;
    params.push(filters.fromDate);
  }

  if (filters?.toDate) {
    query += ` AND d.downloaded_at <= ?`;
    params.push(filters.toDate);
  }

  query += ` ORDER BY d.downloaded_at DESC`;

  const results = db.exec(query, params);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const download: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      download[key] = row[i];
    });
    return download as PackageDownload;
  });
}
