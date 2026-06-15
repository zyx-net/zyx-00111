import { create } from 'zustand';
import { api, getApiServer } from '../utils/api';
import { Batch, AnomalyWithReading, RuleConfig, DashboardStats, MeterType, User, BatchComparisonResult, AnomalyReplay, OperationLog } from '../types';

interface AppState {
  batches: Batch[];
  anomalies: AnomalyWithReading[];
  selectedAnomaly: AnomalyWithReading | null;
  rules: RuleConfig[];
  ruleHistory: RuleConfig[];
  dashboardStats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  currentOperator: string;
  currentUser: User | null;
  batchComparison: BatchComparisonResult | null;
  anomalyReplay: AnomalyReplay | null;
  operationLogs: OperationLog[];
  savedFilters: { status: string; type: string };
  savedBatchCompare: { batch1Id: string; batch2Id: string } | null;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentOperator: (operator: string) => void;
  setCurrentUser: (user: User | null) => void;
  saveFilters: (filters: { status: string; type: string }) => void;
  saveBatchCompare: (compare: { batch1Id: string; batch2Id: string } | null) => void;

  fetchBatches: () => Promise<void>;
  fetchAnomalies: (filters?: { status?: string; type?: string }) => Promise<void>;
  selectAnomaly: (anomaly: AnomalyWithReading | null) => void;
  fetchRules: () => Promise<void>;
  fetchRuleHistory: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchOperationLogs: (filters?: { operator?: string; operationType?: string }) => Promise<void>;

  importReadings: (readings: Array<{
    meterId: string;
    readingDate: string;
    rawValue: number;
    meterType: MeterType;
  }>) => Promise<void>;

  correctAnomaly: (id: string, newValue: number, version: number) => Promise<void>;
  ignoreAnomaly: (id: string, remark?: string) => Promise<void>;
  revertAnomaly: (id: string) => Promise<void>;
  deleteBatch: (id: string) => Promise<void>;
  updateRules: (configs: Array<{ key: string; value: string }>) => Promise<void>;
  rollbackRules: (version: number) => Promise<void>;

  compareBatches: (batch1Id: string, batch2Id: string) => Promise<void>;
  getAnomalyReplay: (anomalyId: string) => Promise<void>;
  revertBatch: (batchId: string) => Promise<void>;
  exportBatchCompare: (batch1Id: string, batch2Id: string) => Promise<void>;
  exportFiltered: (filters: { status?: string; type?: string }) => Promise<void>;
  exportReplay: (anomalyId: string) => Promise<void>;
}

const loadSavedState = () => {
  try {
    const savedFilters = localStorage.getItem('reviewFilters');
    const savedBatchCompare = localStorage.getItem('batchCompare');
    return {
      savedFilters: savedFilters ? JSON.parse(savedFilters) : { status: '', type: '' },
      savedBatchCompare: savedBatchCompare ? JSON.parse(savedBatchCompare) : null
    };
  } catch {
    return {
      savedFilters: { status: '', type: '' },
      savedBatchCompare: null
    };
  }
};

const savedState = loadSavedState();

export const useStore = create<AppState>((set, get) => ({
  batches: [],
  anomalies: [],
  selectedAnomaly: null,
  rules: [],
  ruleHistory: [],
  dashboardStats: null,
  loading: false,
  error: null,
  currentOperator: 'reviewer_1',
  currentUser: null,
  batchComparison: null,
  anomalyReplay: null,
  operationLogs: [],
  savedFilters: savedState.savedFilters,
  savedBatchCompare: savedState.savedBatchCompare,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setCurrentOperator: (operator) => {
    set({ currentOperator: operator });
    localStorage.setItem('currentOperator', operator);
  },
  setCurrentUser: (user) => set({ currentUser: user }),
  saveFilters: (filters) => {
    set({ savedFilters: filters });
    localStorage.setItem('reviewFilters', JSON.stringify(filters));
  },
  saveBatchCompare: (compare) => {
    set({ savedBatchCompare: compare });
    if (compare) {
      localStorage.setItem('batchCompare', JSON.stringify(compare));
    } else {
      localStorage.removeItem('batchCompare');
    }
  },

  fetchBatches: async () => {
    try {
      set({ loading: true });
      const batches = await api.batches.list();
      set({ batches, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchAnomalies: async (filters) => {
    try {
      set({ loading: true });
      const anomalies = await api.anomalies.list(filters);
      set({ anomalies, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  selectAnomaly: (anomaly) => set({ selectedAnomaly: anomaly }),

  fetchRules: async () => {
    try {
      const rules = await api.rules.get();
      set({ rules });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchRuleHistory: async () => {
    try {
      const ruleHistory = await api.rules.getHistory();
      set({ ruleHistory });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchDashboardStats: async () => {
    try {
      const dashboardStats = await api.dashboard.stats();
      set({ dashboardStats });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchUsers: async () => {
    try {
      const users = await api.users.list();
      const currentOperator = localStorage.getItem('currentOperator') || 'reviewer_1';
      const currentUser = users.find(u => u.username === currentOperator) || users[0];
      set({ currentUser });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchOperationLogs: async (filters) => {
    try {
      const operationLogs = await api.logs.list(filters);
      set({ operationLogs });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  importReadings: async (readings) => {
    try {
      set({ loading: true, error: null });
      await api.batches.import(readings, get().currentOperator);
      await get().fetchBatches();
      await get().fetchAnomalies();
      await get().fetchDashboardStats();
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  correctAnomaly: async (id, newValue, version) => {
    try {
      set({ loading: true, error: null });
      await api.anomalies.correct(id, newValue, get().currentOperator, version);
      await get().fetchAnomalies();
      await get().fetchDashboardStats();
      set({ selectedAnomaly: null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  ignoreAnomaly: async (id, remark) => {
    try {
      set({ loading: true, error: null });
      await api.anomalies.ignore(id, get().currentOperator, remark);
      await get().fetchAnomalies();
      await get().fetchDashboardStats();
      set({ selectedAnomaly: null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  revertAnomaly: async (id) => {
    try {
      set({ loading: true, error: null });
      await api.anomalies.revert(id);
      await get().fetchAnomalies();
      await get().fetchDashboardStats();
      set({ selectedAnomaly: null, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  deleteBatch: async (id) => {
    try {
      set({ loading: true, error: null });
      await api.batches.delete(id);
      await get().fetchBatches();
      await get().fetchDashboardStats();
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateRules: async (configs) => {
    try {
      set({ loading: true, error: null });
      await api.rules.update(configs);
      await get().fetchRules();
      await get().fetchRuleHistory();
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  rollbackRules: async (version) => {
    try {
      set({ loading: true, error: null });
      await api.rules.rollback(version);
      await get().fetchRules();
      await get().fetchRuleHistory();
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  compareBatches: async (batch1Id, batch2Id) => {
    try {
      set({ loading: true, error: null });
      const comparison = await api.batches.compare(batch1Id, batch2Id);
      set({ batchComparison: comparison, loading: false });
      get().saveBatchCompare({ batch1Id, batch2Id });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  getAnomalyReplay: async (anomalyId) => {
    try {
      set({ loading: true, error: null });
      const replay = await api.anomalies.getReplay(anomalyId);
      set({ anomalyReplay: replay, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  revertBatch: async (batchId) => {
    try {
      set({ loading: true, error: null });
      await api.batches.revertAll(batchId, get().currentOperator);
      await get().fetchBatches();
      await get().fetchAnomalies();
      await get().fetchDashboardStats();
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  exportBatchCompare: async (batch1Id, batch2Id) => {
    try {
      set({ loading: true, error: null });
      const result = await api.export.batchCompare(batch1Id, batch2Id, get().currentOperator);
      const serverUrl = getApiServer();
      window.open(`${serverUrl}${result.filePath}`, '_blank');
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  exportFiltered: async (filters) => {
    try {
      set({ loading: true, error: null });
      const result = await api.export.filtered(filters, get().currentOperator);
      const serverUrl = getApiServer();
      window.open(`${serverUrl}${result.filePath}`, '_blank');
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  exportReplay: async (anomalyId) => {
    try {
      set({ loading: true, error: null });
      const result = await api.export.replay(anomalyId, get().currentOperator);
      const serverUrl = getApiServer();
      window.open(`${serverUrl}${result.filePath}`, '_blank');
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
}));
