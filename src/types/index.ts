export type MeterType = 'WATER' | 'ELECTRICITY' | 'GAS';
export type ReadingStatus = 'RAW' | 'ABNORMAL' | 'CORRECTED' | 'IGNORED';
export type AnomalyType = 'JUMP' | 'MISSING' | 'ROLLBACK';
export type AnomalyStatus = 'PENDING' | 'CORRECTED' | 'IGNORED' | 'REVERTED';
export type ExportType = 'DETAIL' | 'SUMMARY' | 'BATCH_COMPARE' | 'REPLAY';
export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'REVIEWER';

export interface Batch {
  id: string;
  batchNo: string;
  importedAt: string;
  totalCount: number;
  anomalyCount: number;
  importedBy?: string;
}

export interface MeterReading {
  id: string;
  meterId: string;
  readingDate: string;
  rawValue: number;
  correctedValue?: number;
  meterType: MeterType;
  batchId?: string;
  status: ReadingStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Anomaly {
  id: string;
  readingId: string;
  anomalyType: AnomalyType;
  detectedAt: string;
  status: AnomalyStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  remark?: string;
  ruleSnapshot?: string;
}

export interface Correction {
  id: string;
  anomalyId: string;
  originalValue: number;
  newValue: number;
  operator: string;
  operatedAt: string;
  version: number;
  readingId?: string;
  ruleSnapshot?: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface OperationLog {
  id: string;
  operator: string;
  operationType: string;
  targetType: string;
  targetId?: string;
  details?: string;
  operatedAt: string;
}

export interface RuleConfig {
  id: string;
  configKey: string;
  configValue: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  updatedAt: string;
}

export interface ExportRecord {
  id: string;
  exportType: ExportType;
  params?: string;
  downloadedAt: string;
  downloadedBy?: string;
}

export interface DashboardStats {
  todayImport: number;
  pendingAnomalies: number;
  anomalyRate: string;
  recentAnomalies: AnomalyWithReading[];
  typeStats: Array<{
    type: string;
    count: number;
    total: number;
  }>;
}

export interface BatchComparisonResult {
  batch1Id: string;
  batch2Id: string;
  newAnomalies: AnomalyWithReading[];
  correctedAnomalies: AnomalyWithReading[];
  ignoredAnomalies: AnomalyWithReading[];
  revertedAnomalies: AnomalyWithReading[];
  unchangedAnomalies: AnomalyWithReading[];
  meterTrajectory: MeterTrajectory[];
}

export interface MeterTrajectory {
  meterId: string;
  meterType: MeterType;
  readings: MeterReading[];
  anomalies: AnomalyWithReading[];
  corrections: Correction[];
}

export interface AnomalyReplay {
  anomalyId: string;
  meterId: string;
  meterType: MeterType;
  readingDate: string;
  rawValue: number;
  correctedValue?: number;
  anomalyType: AnomalyType;
  initialStatus: AnomalyStatus;
  finalStatus: AnomalyStatus;
  corrections: Correction[];
  ruleSnapshot: RuleConfig[];
  processedAt: string[];
}

export interface AnomalyWithReading extends Anomaly {
  meterId: string;
  meterType: MeterType;
  readingDate: string;
  rawValue: number;
  correctedValue?: number;
  batchNo?: string;
  currentVersion: number;
  correctionHistory?: Correction[];
}

export interface ConflictError {
  isConflict: boolean;
  message: string;
  currentVersion: number;
  previousValue?: number;
  lastOperator?: string;
  lastOperatedAt?: string;
}

export interface BatchRevertResult {
  success: boolean;
  revertedCount: number;
  failedCount: number;
  details: Array<{ anomalyId: string; success: boolean; message?: string }>;
}

export interface ImportResult {
  batchId: string;
  batchNo: string;
  importedCount: number;
  anomalyCount: number;
  anomalies: AnomalyWithReading[];
}

export const METER_TYPE_LABELS: Record<MeterType, string> = {
  WATER: '水',
  ELECTRICITY: '电',
  GAS: '气'
};

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  JUMP: '跳变',
  MISSING: '缺失',
  ROLLBACK: '回退'
};

export const STATUS_LABELS: Record<string, string> = {
  RAW: '原始',
  ABNORMAL: '异常',
  CORRECTED: '已修正',
  IGNORED: '已忽略',
  PENDING: '待复核',
  REVERTED: '已撤销'
};
