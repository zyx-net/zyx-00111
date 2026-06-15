export type MeterType = 'WATER' | 'ELECTRICITY' | 'GAS';
export type ReadingStatus = 'RAW' | 'ABNORMAL' | 'CORRECTED' | 'IGNORED';
export type AnomalyType = 'JUMP' | 'MISSING' | 'ROLLBACK';
export type AnomalyStatus = 'PENDING' | 'CORRECTED' | 'IGNORED' | 'REVERTED';
export type ExportType = 'DETAIL' | 'SUMMARY';

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

export interface Correction {
  id: string;
  anomalyId: string;
  originalValue: number;
  newValue: number;
  operator: string;
  operatedAt: string;
  version: number;
  readingId?: string;
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
