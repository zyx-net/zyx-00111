import { Batch, AnomalyWithReading, RuleConfig, ExportRecord, DashboardStats, ImportResult, MeterType, User, BatchComparisonResult, MeterTrajectory, AnomalyReplay, ConflictError, BatchRevertResult, OperationLog } from '../types';

const API_BASE = '/api';
const API_SERVER = 'http://localhost:3001';

export function getApiServer(): string {
  return API_SERVER;
}

export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

async function fetchApiWithStatus<T>(url: string, options?: RequestInit): Promise<{ data: T; status: number }> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json().catch(() => ({ error: 'Request failed' }));
  return { data, status: response.status };
}

export interface ExportResult {
  filePath: string;
  record: ExportRecord;
  recordCount?: number;
  success?: boolean;
  error?: string;
  message?: string;
  createdAt?: string;
  exportedBy?: string;
}

export interface ExportSummaryResult extends ExportResult {
  summary: any;
  generatedAt?: string;
}

export interface ExportFilteredResult extends ExportResult {
  count: number;
  filters?: any;
}

export const api = {
  batches: {
    import: (readings: Array<{
      meterId: string;
      readingDate: string;
      rawValue: number;
      meterType: MeterType;
    }>, importedBy?: string) =>
      fetchApi<ImportResult>('/batches', {
        method: 'POST',
        body: JSON.stringify({ readings, importedBy }),
      }),

    list: () => fetchApi<Batch[]>('/batches'),

    get: (id: string) => fetchApi<Batch & { readings: any[] }>(`/batches/${id}`),

    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/batches/${id}`, { method: 'DELETE' }),

    compare: (batch1Id: string, batch2Id: string) =>
      fetchApi<BatchComparisonResult>('/batches/compare', {
        method: 'POST',
        body: JSON.stringify({ batch1Id, batch2Id }),
      }),

    getSnapshot: (batchId: string) =>
      fetchApi<any>(`/batches/${batchId}/snapshot`),

    revertAll: (batchId: string, operator: string) =>
      fetchApi<BatchRevertResult>(`/batches/${batchId}/revert-all`, {
        method: 'POST',
        body: JSON.stringify({ operator }),
      }),
  },

  anomalies: {
    list: (filters?: { status?: string; type?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.type) params.set('type', filters.type);
      const query = params.toString();
      return fetchApi<AnomalyWithReading[]>(`/anomalies${query ? `?${query}` : ''}`);
    },

    get: (id: string) => fetchApi<AnomalyWithReading>(`/anomalies/${id}`),

    correct: (id: string, newValue: number, operator: string, version: number) =>
      fetchApi<{ success: boolean; correction: any }>(`/anomalies/${id}/correct`, {
        method: 'POST',
        body: JSON.stringify({ newValue, operator, version }),
      }),

    ignore: (id: string, operator: string, remark?: string) =>
      fetchApi<{ success: boolean }>(`/anomalies/${id}/ignore`, {
        method: 'POST',
        body: JSON.stringify({ operator, remark }),
      }),

    revert: (id: string) =>
      fetchApi<{ success: boolean; message: string }>(`/anomalies/${id}/revert`, {
        method: 'POST',
      }),

    checkConflict: async (id: string, currentVersion: number, operator: string): Promise<ConflictError | null> => {
      const { data, status } = await fetchApiWithStatus<ConflictError>(`/anomalies/${id}/check-conflict?currentVersion=${currentVersion}&operator=${encodeURIComponent(operator)}`);
      if (status === 409) {
        return data;
      }
      return null;
    },

    verifyRevert: async (id: string, operator: string): Promise<boolean> => {
      try {
        const { status } = await fetchApiWithStatus<{ canRevert: boolean }>(`/anomalies/${id}/verify-revert`, {
          method: 'POST',
          body: JSON.stringify({ operator }),
        });
        return status === 200;
      } catch {
        return false;
      }
    },

    getReplay: (id: string) => fetchApi<AnomalyReplay>(`/anomalies/${id}/replay`),
  },

  meters: {
    getTrajectory: (meterId: string) => fetchApi<MeterTrajectory>(`/meters/${meterId}/trajectory`),
  },

  users: {
    list: () => fetchApi<User[]>('/users'),
    get: (username: string) => fetchApi<User>(`/users/${username}`),
  },

  rules: {
    get: () => fetchApi<RuleConfig[]>('/rules'),

    update: (configs: Array<{ key: string; value: string }>) =>
      fetchApi<{ success: boolean; newVersion: number }>('/rules', {
        method: 'PUT',
        body: JSON.stringify({ configs }),
      }),

    getHistory: () => fetchApi<RuleConfig[]>('/rules/history'),

    rollback: (version: number) =>
      fetchApi<{ success: boolean; message: string }>(`/rules/${version}/rollback`, {
        method: 'POST',
      }),
  },

  export: {
    detail: (params: { dateFrom?: string; dateTo?: string; meterType?: string; batchId?: string; operator?: string }) =>
      fetchApi<ExportResult>('/export/detail', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    summary: (params: { dateFrom?: string; dateTo?: string; operator?: string }) =>
      fetchApi<ExportSummaryResult>('/export/summary', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    batchCompare: (batch1Id: string, batch2Id: string, operator: string) =>
      fetchApi<{ filePath: string; record: ExportRecord }>('/export/batch-compare', {
        method: 'POST',
        body: JSON.stringify({ batch1Id, batch2Id, operator }),
      }),

    replay: (anomalyId: string, operator: string) =>
      fetchApi<{ filePath: string; record: ExportRecord }>('/export/replay', {
        method: 'POST',
        body: JSON.stringify({ anomalyId, operator }),
      }),

    filtered: (filters: { status?: string; type?: string }, operator: string) =>
      fetchApi<ExportFilteredResult>('/export/filtered', {
        method: 'POST',
        body: JSON.stringify({ filters, operator }),
      }),

    list: (filters?: { operator?: string; exportType?: string }) => {
      const params = new URLSearchParams();
      if (filters?.operator) params.set('operator', filters.operator);
      if (filters?.exportType) params.set('exportType', filters.exportType);
      const query = params.toString();
      return fetchApi<ExportRecord[]>(`/exports${query ? `?${query}` : ''}`);
    },
  },

  logs: {
    list: (filters?: { operator?: string; operationType?: string; fromDate?: string; toDate?: string }) => {
      const params = new URLSearchParams();
      if (filters?.operator) params.set('operator', filters.operator);
      if (filters?.operationType) params.set('operationType', filters.operationType);
      if (filters?.fromDate) params.set('fromDate', filters.fromDate);
      if (filters?.toDate) params.set('toDate', filters.toDate);
      const query = params.toString();
      return fetchApi<OperationLog[]>(`/operation-logs${query ? `?${query}` : ''}`);
    },
  },

  dashboard: {
    stats: () => fetchApi<DashboardStats>('/dashboard/stats'),
  },
};
