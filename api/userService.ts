import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from './database.js';
import { User, UserRole, OperationLog, OperationType } from './types.js';

export async function getUserByUsername(username: string): Promise<User | null> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM users WHERE username = ?`, [username]);

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const user: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    user[key] = row[i];
  });
  return user as User;
}

export async function getUserById(userId: string): Promise<User | null> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM users WHERE id = ?`, [userId]);

  if (results.length === 0 || results[0].values.length === 0) return null;

  const columns = results[0].columns;
  const row = results[0].values[0];
  const user: any = {};
  columns.forEach((col, i) => {
    const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    user[key] = row[i];
  });
  return user as User;
}

export async function getAllUsers(): Promise<User[]> {
  const db = getDatabase();
  const results = db.exec(`SELECT * FROM users ORDER BY created_at`);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const user: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      user[key] = row[i];
    });
    return user as User;
  });
}

export function canExportBatch(user: User): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR';
}

export function canRevertBatch(user: User): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPERVISOR';
}

export function canViewAnomaly(user: User, anomalyResolvedBy?: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    return true;
  }
  if (!anomalyResolvedBy) return true;
  return user.username === anomalyResolvedBy;
}

export function canRevertAnomaly(user: User, anomalyResolvedBy?: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    return true;
  }
  if (!anomalyResolvedBy) return false;
  return user.username === anomalyResolvedBy;
}

export async function createOperationLog(
  operator: string,
  operationType: OperationType,
  targetType: string,
  targetId?: string,
  details?: string,
  ipAddress?: string
): Promise<void> {
  const db = getDatabase();
  const logId = uuidv4();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO operation_logs (id, operator, operation_type, target_type, target_id, details, ip_address, operated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [logId, operator, operationType, targetType, targetId || null, details || null, ipAddress || null, now]
  );

  saveDatabase();
}

export async function getOperationLogs(filters?: {
  operator?: string;
  operationType?: OperationType;
  targetType?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<OperationLog[]> {
  const db = getDatabase();
  let query = `SELECT * FROM operation_logs WHERE 1=1`;
  const params: any[] = [];

  if (filters?.operator) {
    query += ` AND operator = ?`;
    params.push(filters.operator);
  }

  if (filters?.operationType) {
    query += ` AND operation_type = ?`;
    params.push(filters.operationType);
  }

  if (filters?.targetType) {
    query += ` AND target_type = ?`;
    params.push(filters.targetType);
  }

  if (filters?.fromDate) {
    query += ` AND operated_at >= ?`;
    params.push(filters.fromDate);
  }

  if (filters?.toDate) {
    query += ` AND operated_at <= ?`;
    params.push(filters.toDate);
  }

  query += ` ORDER BY operated_at DESC LIMIT 100`;

  const results = db.exec(query, params);

  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const log: any = {};
    columns.forEach((col, i) => {
      const key = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      log[key] = row[i];
    });
    return log as OperationLog;
  });
}
