import { Batch, AnomalyWithReading, RuleConfig, ExportRecord, DashboardStats, ImportResult, MeterType } from '../types';

const API_BASE = '/api';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
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
    detail: (params: { dateFrom?: string; dateTo?: string; meterType?: string; batchId?: string }) =>
      fetchApi<{ filePath: string; record: ExportRecord }>('/export/detail', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    summary: (params: { dateFrom?: string; dateTo?: string }) =>
      fetchApi<{ filePath: string; record: ExportRecord; summary: any }>('/export/summary', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    list: () => fetchApi<ExportRecord[]>('/exports'),
  },

  dashboard: {
    stats: () => fetchApi<DashboardStats>('/dashboard/stats'),
  },
};
