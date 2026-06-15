import { getDatabase, saveDatabase } from './database.js';
import { getUserByUsername } from './userService.js';
import { UserRole } from './types.js';

export type ChangeOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PENDING_EXECUTION' | 'EXECUTING' | 'COMPLETED' | 'REJECTED' | 'WITHDRAWN' | 'ROLLED_BACK';
export type ChangeOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ConflictResolution = 'NONE' | 'PENDING' | 'RESOLVED' | 'CANCELLED';

export interface ChangeOrder {
  id: string;
  orderNo: string;
  title: string;
  description?: string;
  orderType: string;
  status: ChangeOrderStatus;
  priority: ChangeOrderPriority;
  datasetId: string;
  datasetName: string;
  fieldChanges: string;
  effectiveTime: string;
  approvalRole: string;
  approver?: string;
  approvedAt?: string;
  approvalComment?: string;
  rollbackDescription?: string;
  rollbackRetentionDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executedBy?: string;
  rollbackedAt?: string;
  rollbackedBy?: string;
  version: number;
}

export interface FieldChange {
  fieldName: string;
  fieldLabel: string;
  previousValue: string;
  newValue: string;
  changeType: 'ADD' | 'MODIFY' | 'DELETE';
}

export interface ChangeOrderConfig {
  id: string;
  configKey: string;
  configValue: string;
  configType: string;
  description?: string;
  defaultValue?: string;
  validValues?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface ConflictInfo {
  isConflict: boolean;
  conflicts: Array<{
    orderId: string;
    orderNo: string;
    title: string;
    effectiveTime: string;
    status: ChangeOrderStatus;
    conflictType: string;
  }>;
  message?: string;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateOrderNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `CO${year}${month}${day}${random}`;
}

export async function createChangeOrder(
  title: string,
  orderType: string,
  datasetId: string,
  datasetName: string,
  fieldChanges: FieldChange[],
  effectiveTime: string,
  createdBy: string,
  description?: string,
  priority: ChangeOrderPriority = 'NORMAL',
  rollbackDescription?: string,
  rollbackRetentionDays?: number
): Promise<ChangeOrder> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateUUID();
  const orderNo = generateOrderNo();
  
  const config = await getChangeOrderConfig('rollback_retention_days');
  const retentionDays = rollbackRetentionDays || parseInt(config?.configValue || '30');

  db.run(`
    INSERT INTO change_orders (
      id, order_no, title, description, order_type, status, priority,
      dataset_id, dataset_name, field_changes, effective_time, approval_role,
      rollback_description, rollback_retention_days, created_by, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, orderNo, title, description, orderType, 'DRAFT', priority,
    datasetId, datasetName, JSON.stringify(fieldChanges), effectiveTime, 'ADMIN',
    rollbackDescription, retentionDays, createdBy, now, now, 1
  ]);

  await createAuditLog(id, 'CREATE', createdBy, { title, orderType, datasetId }, 'SUCCESS');

  const order = await getChangeOrderById(id);
  return order!;
}

export async function updateChangeOrder(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    fieldChanges: FieldChange[];
    effectiveTime: string;
    priority: ChangeOrderPriority;
    rollbackDescription: string;
  }>,
  operator: string
): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'DRAFT') {
    throw new Error('只有草稿状态的变更单可以修改');
  }

  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }
  if (updates.fieldChanges !== undefined) {
    setClauses.push('field_changes = ?');
    values.push(JSON.stringify(updates.fieldChanges));
  }
  if (updates.effectiveTime !== undefined) {
    setClauses.push('effective_time = ?');
    values.push(updates.effectiveTime);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.rollbackDescription !== undefined) {
    setClauses.push('rollback_description = ?');
    values.push(updates.rollbackDescription);
  }

  values.push(id);
  db.run(`UPDATE change_orders SET ${setClauses.join(', ')} WHERE id = ?`, values);

  await createAuditLog(id, 'UPDATE', operator, updates, 'SUCCESS');

  const updatedOrder = await getChangeOrderById(id);
  return updatedOrder!;
}

export async function submitChangeOrder(id: string, operator: string): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'DRAFT') {
    throw new Error('只有草稿状态的变更单可以提交');
  }

  const conflictResult = await checkConflicts(id, order.datasetId, order.effectiveTime);
  if (conflictResult.isConflict) {
    await createAuditLog(id, 'SUBMIT', operator, { conflicts: conflictResult.conflicts }, 'BLOCKED_CONFLICT');
    throw new Error(`检测到冲突: ${conflictResult.message}`);
  }

  const now = new Date().toISOString();
  db.run(`
    UPDATE change_orders 
    SET status = 'PENDING_APPROVAL', submitted_at = ?, updated_at = ?
    WHERE id = ?
  `, [now, now, id]);

  await createAuditLog(id, 'SUBMIT', operator, { effectiveTime: order.effectiveTime }, 'SUCCESS');

  const submittedOrder = await getChangeOrderById(id);
  return submittedOrder!;
}

export async function approveChangeOrder(
  id: string,
  approver: string,
  comment?: string
): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'PENDING_APPROVAL') {
    throw new Error('只有待审批状态的变更单可以审批');
  }

  const user = await getUserByUsername(approver);
  if (!user) {
    throw new Error('审批人不存在');
  }

  const config = await getChangeOrderConfig('approval_roles');
  const allowedRoles = (config?.configValue || 'ADMIN,SUPERVISOR').split(',');
  if (!allowedRoles.includes(user.role)) {
    await createAuditLog(id, 'APPROVE', approver, { userRole: user.role }, 'FAILED');
    throw new Error(`您的角色(${user.role})没有审批权限`);
  }

  const now = new Date().toISOString();
  db.run(`
    UPDATE change_orders 
    SET status = 'APPROVED', approver = ?, approved_at = ?, approval_comment = ?, updated_at = ?
    WHERE id = ?
  `, [approver, now, comment || '', now, id]);

  await createAuditLog(id, 'APPROVE', approver, { comment }, 'SUCCESS');

  const approvedOrder = await getChangeOrderById(id);
  return approvedOrder!;
}

export async function rejectChangeOrder(
  id: string,
  approver: string,
  comment: string
): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'PENDING_APPROVAL') {
    throw new Error('只有待审批状态的变更单可以驳回');
  }

  const user = await getUserByUsername(approver);
  if (!user) {
    throw new Error('审批人不存在');
  }

  const config = await getChangeOrderConfig('approval_roles');
  const allowedRoles = (config?.configValue || 'ADMIN,SUPERVISOR').split(',');
  if (!allowedRoles.includes(user.role)) {
    await createAuditLog(id, 'REJECT', approver, { userRole: user.role }, 'FAILED');
    throw new Error(`您的角色(${user.role})没有审批权限`);
  }

  const now = new Date().toISOString();
  db.run(`
    UPDATE change_orders 
    SET status = 'REJECTED', approver = ?, approved_at = ?, approval_comment = ?, updated_at = ?
    WHERE id = ?
  `, [approver, now, comment, now, id]);

  await createAuditLog(id, 'REJECT', approver, { comment }, 'SUCCESS');

  const rejectedOrder = await getChangeOrderById(id);
  return rejectedOrder!;
}

export async function executeChangeOrder(id: string, executor: string): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'APPROVED' && order.status !== 'PENDING_EXECUTION') {
    throw new Error('只有已审批状态的变更单可以执行');
  }

  const now = new Date();
  const effectiveTime = new Date(order.effectiveTime);
  if (now < effectiveTime) {
    db.run(`
      UPDATE change_orders 
      SET status = 'PENDING_EXECUTION', updated_at = ?
      WHERE id = ?
    `, [now.toISOString(), id]);
    
    await createAuditLog(id, 'EXECUTE_SCHEDULED', executor, { scheduledTime: order.effectiveTime }, 'SUCCESS');
    
    const scheduledOrder = await getChangeOrderById(id);
    return scheduledOrder!;
  }

  const fieldChanges: FieldChange[] = JSON.parse(order.fieldChanges);
  
  for (const change of fieldChanges) {
    db.run(`
      INSERT INTO change_order_execution_history (
        id, order_id, execution_type, previous_value, new_value, execution_result, executed_by, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      generateUUID(), id, change.changeType, change.previousValue, change.newValue, 'SUCCESS', executor, now.toISOString()
    ]);
  }

  db.run(`
    UPDATE change_orders 
    SET status = 'COMPLETED', execution_started_at = ?, execution_completed_at = ?, executed_by = ?, updated_at = ?
    WHERE id = ?
  `, [now.toISOString(), now.toISOString(), executor, now.toISOString(), id]);

  await createAuditLog(id, 'EXECUTE', executor, { 
    fieldChanges: fieldChanges.map(f => ({ field: f.fieldName, type: f.changeType })) 
  }, 'SUCCESS');

  const executedOrder = await getChangeOrderById(id);
  return executedOrder!;
}

export async function withdrawChangeOrder(id: string, operator: string, reason?: string): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PENDING_EXECUTION'].includes(order.status)) {
    throw new Error('当前状态不允许撤回');
  }

  const now = new Date().toISOString();
  db.run(`
    UPDATE change_orders 
    SET status = 'WITHDRAWN', updated_at = ?
    WHERE id = ?
  `, [now, id]);

  await createAuditLog(id, 'WITHDRAW', operator, { reason }, 'SUCCESS');

  const withdrawnOrder = await getChangeOrderById(id);
  return withdrawnOrder!;
}

export async function rollbackChangeOrder(id: string, operator: string, reason?: string): Promise<ChangeOrder> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }
  
  if (order.status !== 'COMPLETED') {
    throw new Error('只有已完成状态的变更单可以回滚');
  }

  const fieldChanges: FieldChange[] = JSON.parse(order.fieldChanges);
  const now = new Date().toISOString();
  
  for (const change of fieldChanges) {
    if (change.changeType === 'ADD' || change.changeType === 'MODIFY') {
      db.run(`
        INSERT INTO change_order_execution_history (
          id, order_id, execution_type, previous_value, new_value, execution_result, executed_by, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        generateUUID(), id, 'ROLLBACK', change.newValue, change.previousValue, 'ROLLBACK_SUCCESS', operator, now
      ]);
    }
  }

  db.run(`
    UPDATE change_orders 
    SET status = 'ROLLED_BACK', rollbacked_at = ?, rollbacked_by = ?, updated_at = ?
    WHERE id = ?
  `, [now, operator, now, id]);

  await createAuditLog(id, 'ROLLBACK', operator, { 
    reason, 
    fieldChanges: fieldChanges.map(f => ({ field: f.fieldName, rolledBackValue: f.previousValue })) 
  }, 'SUCCESS');

  const rolledBackOrder = await getChangeOrderById(id);
  return rolledBackOrder!;
}

export async function checkConflicts(orderId: string, datasetId: string, effectiveTime: string): Promise<ConflictInfo> {
  const db = getDatabase();
  
  const config = await getChangeOrderConfig('conflict_time_window_hours');
  const windowHours = parseInt(config?.configValue || '24');
  
  const autoCheck = await getChangeOrderConfig('auto_conflict_check');
  if (autoCheck?.configValue !== 'true') {
    return { isConflict: false, conflicts: [] };
  }

  const effectiveDate = new Date(effectiveTime);
  const startWindow = new Date(effectiveDate.getTime() - windowHours * 60 * 60 * 1000);
  const endWindow = new Date(effectiveDate.getTime() + windowHours * 60 * 60 * 1000);

  const result = db.exec(`
    SELECT id, order_no, title, effective_time, status 
    FROM change_orders 
    WHERE dataset_id = ? 
      AND id != ?
      AND status IN ('APPROVED', 'PENDING_EXECUTION', 'EXECUTING', 'COMPLETED')
      AND effective_time BETWEEN ? AND ?
    ORDER BY effective_time ASC
  `, [datasetId, orderId, startWindow.toISOString(), endWindow.toISOString()]);

  if (result.length === 0 || result[0].values.length === 0) {
    return { isConflict: false, conflicts: [] };
  }

  const conflicts = result[0].values.map(row => ({
    orderId: row[0] as string,
    orderNo: row[1] as string,
    title: row[2] as string,
    effectiveTime: row[3] as string,
    status: row[4] as ChangeOrderStatus,
    conflictType: 'TIME_OVERLAP'
  }));

  return {
    isConflict: true,
    conflicts,
    message: `在${windowHours}小时时间窗口内检测到${conflicts.length}个冲突变更单`
  };
}

export async function getChangeOrders(filters: {
  status?: ChangeOrderStatus;
  datasetId?: string;
  createdBy?: string;
  priority?: ChangeOrderPriority;
  fromDate?: string;
  toDate?: string;
  operator?: string;
}): Promise<ChangeOrder[]> {
  const db = getDatabase();
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.status) {
    conditions.push('status = ?');
    values.push(filters.status);
  }
  if (filters.datasetId) {
    conditions.push('dataset_id = ?');
    values.push(filters.datasetId);
  }
  if (filters.createdBy) {
    conditions.push('created_by = ?');
    values.push(filters.createdBy);
  }
  if (filters.priority) {
    conditions.push('priority = ?');
    values.push(filters.priority);
  }
  if (filters.fromDate) {
    conditions.push('effective_time >= ?');
    values.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push('effective_time <= ?');
    values.push(filters.toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const result = db.exec(`
    SELECT * FROM change_orders ${whereClause} ORDER BY created_at DESC
  `, values);

  if (result.length === 0) return [];

  const columns = result[0].columns;
  return result[0].values.map(row => {
    const order: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      order[camelCol] = row[idx];
    });
    return order as ChangeOrder;
  });
}

export async function getChangeOrderById(id: string): Promise<ChangeOrder | null> {
  const db = getDatabase();
  
  const result = db.exec('SELECT * FROM change_orders WHERE id = ?', [id]);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const columns = result[0].columns;
  const row = result[0].values[0];
  const order: any = {};
  columns.forEach((col, idx) => {
    const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    order[camelCol] = row[idx];
  });

  return order as ChangeOrder;
}

export async function getChangeOrderByOrderNo(orderNo: string): Promise<ChangeOrder | null> {
  const db = getDatabase();
  
  const result = db.exec('SELECT * FROM change_orders WHERE order_no = ?', [orderNo]);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const columns = result[0].columns;
  const row = result[0].values[0];
  const order: any = {};
  columns.forEach((col, idx) => {
    const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    order[camelCol] = row[idx];
  });

  return order as ChangeOrder;
}

export async function getChangeOrderVersions(orderId: string): Promise<any[]> {
  const db = getDatabase();
  
  const result = db.exec(`
    SELECT * FROM change_order_versions WHERE order_id = ? ORDER BY version DESC
  `, [orderId]);

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const columns = result[0].columns;
    const version: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      version[camelCol] = row[idx];
    });
    return version;
  });
}

export async function getChangeOrderAuditLogs(orderId: string): Promise<any[]> {
  const db = getDatabase();
  
  const result = db.exec(`
    SELECT * FROM change_order_audit_logs WHERE order_id = ? ORDER BY created_at DESC
  `, [orderId]);

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const columns = result[0].columns;
    const log: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      log[camelCol] = row[idx];
    });
    return log;
  });
}

export async function getChangeOrderExecutionHistory(orderId: string): Promise<any[]> {
  const db = getDatabase();
  
  const result = db.exec(`
    SELECT * FROM change_order_execution_history WHERE order_id = ? ORDER BY executed_at DESC
  `, [orderId]);

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const columns = result[0].columns;
    const history: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      history[camelCol] = row[idx];
    });
    return history;
  });
}

export async function getChangeOrderConflicts(orderId: string): Promise<any[]> {
  const db = getDatabase();
  
  const result = db.exec(`
    SELECT c.*, co.order_no, co.title, co.effective_time, co.status
    FROM change_order_conflicts c
    JOIN change_orders co ON c.conflicting_order_id = co.id
    WHERE c.order_id = ? OR c.conflicting_order_id = ?
    ORDER BY c.created_at DESC
  `, [orderId, orderId]);

  if (result.length === 0) return [];

  return result[0].values.map(row => ({
    id: row[0],
    orderId: row[1],
    conflictingOrderId: row[2],
    conflictType: row[3],
    conflictTimeWindow: row[4],
    resolution: row[5],
    resolvedBy: row[6],
    resolvedAt: row[7],
    createdAt: row[8],
    orderNo: row[9],
    title: row[10],
    effectiveTime: row[11],
    status: row[12]
  }));
}

export async function getChangeOrderConfig(key: string): Promise<ChangeOrderConfig | null> {
  const db = getDatabase();
  
  const result = db.exec('SELECT * FROM change_order_config WHERE config_key = ?', [key]);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const columns = result[0].columns;
  const row = result[0].values[0];
  const config: any = {};
  columns.forEach((col, idx) => {
    const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    config[camelCol] = row[idx];
  });

  return config as ChangeOrderConfig;
}

export async function getAllChangeOrderConfigs(): Promise<ChangeOrderConfig[]> {
  const db = getDatabase();
  
  const result = db.exec('SELECT * FROM change_order_config ORDER BY config_key ASC');

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const columns = result[0].columns;
    const config: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      config[camelCol] = row[idx];
    });
    return config as ChangeOrderConfig;
  });
}

export async function updateChangeOrderConfig(
  key: string,
  value: string,
  operator: string
): Promise<ChangeOrderConfig> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const config = await getChangeOrderConfig(key);
  if (!config) {
    throw new Error('配置项不存在');
  }

  if (config.validValues) {
    const validValues = config.validValues.split(',');
    if (!validValues.includes(value)) {
      throw new Error(`无效的值，可选值: ${config.validValues}`);
    }
  }

  db.run(`
    UPDATE change_order_config 
    SET config_value = ?, updated_by = ?, updated_at = ?
    WHERE config_key = ?
  `, [value, operator, now, key]);

  await createAuditLog('SYSTEM', 'UPDATE_CONFIG', operator, { key, value }, 'SUCCESS');

  const updatedConfig = await getChangeOrderConfig(key);
  return updatedConfig!;
}

async function createAuditLog(
  orderId: string,
  operation: string,
  operator: string,
  details?: any,
  result: string = 'SUCCESS'
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateUUID();

  db.run(`
    INSERT INTO change_order_audit_logs (id, order_id, operation, operator, details, result, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, orderId, operation, operator, details ? JSON.stringify(details) : null, result, now]);
}

export function canViewChangeOrder(user: any, orderCreatedBy: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'SUPERVISOR') return true;
  return user.username === orderCreatedBy;
}

export function canModifyChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (order.status !== 'DRAFT') return false;
  if (user.role === 'ADMIN') return true;
  return user.username === order.createdBy;
}

export function canApproveChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (order.status !== 'PENDING_APPROVAL') return false;
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') return true;
  return false;
}

export function canExecuteChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (!['APPROVED', 'PENDING_EXECUTION'].includes(order.status)) return false;
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') return true;
  return false;
}

export function canWithdrawChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PENDING_EXECUTION'].includes(order.status)) return false;
  if (user.role === 'ADMIN') return true;
  return user.username === order.createdBy;
}

export function canRollbackChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (order.status !== 'COMPLETED') return false;
  if (user.role === 'ADMIN') return true;
  return false;
}

export function canDeleteChangeOrder(user: any, order: ChangeOrder): boolean {
  if (!user) return false;
  if (order.status !== 'DRAFT' && order.status !== 'REJECTED' && order.status !== 'WITHDRAWN') return false;
  if (user.role === 'ADMIN') return true;
  return user.username === order.createdBy;
}

export function canViewAuditLogs(user: any): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR';
}

export async function deleteChangeOrder(id: string, operator: string): Promise<void> {
  const db = getDatabase();
  const order = await getChangeOrderById(id);
  
  if (!order) {
    throw new Error('变更单不存在');
  }

  if (!canDeleteChangeOrder(await getUserByUsername(operator), order)) {
    throw new Error('您没有权限删除此变更单');
  }

  db.run('DELETE FROM change_orders WHERE id = ?', [id]);
  await createAuditLog(id, 'DELETE', operator, { title: order.title }, 'SUCCESS');
}

export async function recoverStaleChangeOrders(): Promise<{ recoveredCount: number; orders: string[] }> {
  const db = getDatabase();
  const now = new Date();
  
  const pendingExecution = db.exec(`
    SELECT id, effective_time FROM change_orders 
    WHERE status = 'PENDING_EXECUTION'
  `);

  const recoveredOrders: string[] = [];
  
  if (pendingExecution.length > 0 && pendingExecution[0].values.length > 0) {
    for (const row of pendingExecution[0].values) {
      const orderId = row[0] as string;
      const effectiveTime = new Date(row[1] as string);
      
      if (now >= effectiveTime) {
        db.run(`
          UPDATE change_orders 
          SET status = 'APPROVED', updated_at = ?
          WHERE id = ?
        `, [now.toISOString(), orderId]);
        
        recoveredOrders.push(orderId);
        await createAuditLog(orderId, 'AUTO_RECOVER', 'SYSTEM', { 
          previousStatus: 'PENDING_EXECUTION',
          currentStatus: 'APPROVED',
          reason: 'effective_time_reached'
        }, 'SUCCESS');
      }
    }
  }

  return {
    recoveredCount: recoveredOrders.length,
    orders: recoveredOrders
  };
}

export async function recoverExecutingChangeOrders(): Promise<{ recoveredCount: number; orders: string[] }> {
  const db = getDatabase();
  const now = new Date();
  
  const executing = db.exec(`
    SELECT id, execution_started_at FROM change_orders 
    WHERE status = 'EXECUTING'
  `);

  const recoveredOrders: string[] = [];
  
  if (executing.length > 0 && executing[0].values.length > 0) {
    for (const row of executing[0].values) {
      const orderId = row[0] as string;
      const startedAt = new Date(row[1] as string);
      const timeDiff = now.getTime() - startedAt.getTime();
      
      if (timeDiff > 5 * 60 * 1000) {
        db.run(`
          UPDATE change_orders 
          SET status = 'COMPLETED', execution_completed_at = ?, updated_at = ?
          WHERE id = ?
        `, [now.toISOString(), now.toISOString(), orderId]);
        
        recoveredOrders.push(orderId);
        await createAuditLog(orderId, 'AUTO_RECOVER', 'SYSTEM', { 
          previousStatus: 'EXECUTING',
          currentStatus: 'COMPLETED',
          reason: 'execution_timeout',
          executionDuration: timeDiff
        }, 'SUCCESS');
      }
    }
  }

  return {
    recoveredCount: recoveredOrders.length,
    orders: recoveredOrders
  };
}

export async function getPendingExecutionOrders(): Promise<ChangeOrder[]> {
  const db = getDatabase();
  
  const result = db.exec(`
    SELECT * FROM change_orders 
    WHERE status = 'PENDING_EXECUTION'
    ORDER BY effective_time ASC
  `);

  if (result.length === 0) return [];

  const columns = result[0].columns;
  return result[0].values.map(row => {
    const order: any = {};
    columns.forEach((col, idx) => {
      const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      order[camelCol] = row[idx];
    });
    return order as ChangeOrder;
  });
}

export async function exportChangeOrderSummary(operator: string): Promise<{ filePath: string; orderCount: number }> {
  const orders = await getChangeOrders({});
  
  const headers = [
    '变更单号', '标题', '数据集', '状态', '优先级', '生效时间', '创建人', '创建时间', '审批人', '审批时间', '执行人', '执行时间', '版本'
  ];
  
  const rows = orders.map(order => [
    order.orderNo,
    order.title,
    order.datasetName,
    order.status,
    order.priority,
    order.effectiveTime,
    order.createdBy,
    order.createdAt,
    order.approver || '',
    order.approvedAt || '',
    order.executedBy || '',
    order.executionCompletedAt || '',
    order.version.toString()
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const fs = await import('fs');
  const fileName = `change_order_summary_${Date.now()}.csv`;
  const filePath = `./exports/${fileName}`;
  
  fs.writeFileSync(filePath, csvContent, 'utf-8');

  return { filePath, orderCount: orders.length };
}
