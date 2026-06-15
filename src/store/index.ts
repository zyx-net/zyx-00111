import { create } from 'zustand';
import { api } from '../utils/api';
import { Batch, AnomalyWithReading, RuleConfig, DashboardStats, MeterType } from '../types';

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

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentOperator: (operator: string) => void;

  fetchBatches: () => Promise<void>;
  fetchAnomalies: (filters?: { status?: string; type?: string }) => Promise<void>;
  selectAnomaly: (anomaly: AnomalyWithReading | null) => void;
  fetchRules: () => Promise<void>;
  fetchRuleHistory: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;

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
}

export const useStore = create<AppState>((set, get) => ({
  batches: [],
  anomalies: [],
  selectedAnomaly: null,
  rules: [],
  ruleHistory: [],
  dashboardStats: null,
  loading: false,
  error: null,
  currentOperator: 'operator_1',

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setCurrentOperator: (operator) => set({ currentOperator: operator }),

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
}));
