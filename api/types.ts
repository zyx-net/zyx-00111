export type MeterType = 'WATER' | 'ELECTRICITY' | 'GAS';
export type ReadingStatus = 'RAW' | 'ABNORMAL' | 'CORRECTED' | 'IGNORED';
export type AnomalyType = 'JUMP' | 'MISSING' | 'ROLLBACK';
export type AnomalyStatus = 'PENDING' | 'CORRECTED' | 'IGNORED' | 'REVERTED';
export type ExportType = 'DETAIL' | 'SUMMARY' | 'BATCH_COMPARE' | 'REPLAY' | 'FILTERED';
export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'REVIEWER';
export type OperationType = 'EXPORT' | 'REVERT' | 'CORRECT' | 'IGNORE' | 'BATCH_IMPORT' | 'BATCH_REVERT' | 'BATCH_EXPORT' | 'CONFLICT_BLOCK';

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

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface OperationLog {
  id: string;
  operator: string;
  operationType: OperationType;
  targetType: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
  operatedAt: string;
}

export interface BatchSnapshot {
  id: string;
  batchId: string;
  snapshotData: string;
  anomalyCount: number;
  statusSummary: string;
  createdAt: string;
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

export interface ImportResult {
  batchId: string;
  importedCount: number;
  anomalyCount: number;
  anomalies: AnomalyWithReading[];
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

export type ChangeOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PENDING_EXECUTION' | 'EXECUTING' | 'COMPLETED' | 'REJECTED' | 'WITHDRAWN' | 'ROLLED_BACK';
export type ChangeOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type FieldChangeType = 'ADD' | 'MODIFY' | 'DELETE';

export interface FieldChange {
  fieldName: string;
  fieldLabel: string;
  previousValue: string;
  newValue: string;
  changeType: FieldChangeType;
}

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

export interface ChangeOrderAuditLog {
  id: string;
  orderId: string;
  operation: string;
  operator: string;
  details?: string;
  ipAddress?: string;
  result: string;
  createdAt: string;
}

export interface ChangeOrderVersion {
  id: string;
  orderId: string;
  version: number;
  fieldChanges: string;
  createdBy: string;
  createdAt: string;
  changeSummary?: string;
  isActive: number;
}

export interface ChangeOrderConflict {
  id: string;
  orderId: string;
  conflictingOrderId: string;
  conflictType: string;
  conflictTimeWindow?: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ChangeOrderExecutionHistory {
  id: string;
  orderId: string;
  executionType: string;
  previousValue?: string;
  newValue: string;
  executionResult?: string;
  errorMessage?: string;
  executedBy: string;
  executedAt: string;
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

export interface ConflictCheckResult {
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

export interface RecoveryResult {
  recoveredCount: number;
  orders: string[];
  recoveredAt?: string;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetField {
  id: string;
  datasetId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}
