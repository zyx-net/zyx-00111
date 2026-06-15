import { useState, useEffect } from 'react';
import { useStore } from '../store';
import {
  AlertTriangle, CheckCircle, XCircle, RotateCcw, Filter, X,
  GitCompare, Play, Download, Clock, History, Users, ChevronRight,
  Eye, Shield, ShieldAlert, FileSpreadsheet
} from 'lucide-react';
import {
  METER_TYPE_LABELS, ANOMALY_TYPE_LABELS, STATUS_LABELS,
  AnomalyWithReading, Batch, BatchComparisonResult, AnomalyReplay
} from '../types';

type ViewMode = 'list' | 'detail' | 'compare' | 'replay';

export function Review() {
  const {
    anomalies,
    selectedAnomaly,
    batches,
    batchComparison,
    anomalyReplay,
    currentUser,
    loading,
    savedFilters,
    savedBatchCompare,
    fetchAnomalies,
    fetchBatches,
    selectAnomaly,
    correctAnomaly,
    ignoreAnomaly,
    revertAnomaly,
    compareBatches,
    getAnomalyReplay,
    exportBatchCompare,
    exportFiltered,
    exportReplay,
    revertBatch,
    saveFilters,
    fetchUsers,
    fetchOperationLogs,
  } = useStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filters, setFilters] = useState(savedFilters);
  const [correctValue, setCorrectValue] = useState('');
  const [remark, setRemark] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);
  const [batch1Id, setBatch1Id] = useState('');
  const [batch2Id, setBatch2Id] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'anomalies' | 'compare' | 'logs'>('anomalies');

  useEffect(() => {
    fetchBatches();
    fetchAnomalies(filters.status ? { status: filters.status } : undefined);
    fetchUsers();
    fetchOperationLogs();
  }, []);

  useEffect(() => {
    if (savedBatchCompare) {
      setBatch1Id(savedBatchCompare.batch1Id);
      setBatch2Id(savedBatchCompare.batch2Id);
      compareBatches(savedBatchCompare.batch1Id, savedBatchCompare.batch2Id);
    }
  }, [savedBatchCompare]);

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    saveFilters(newFilters);
    fetchAnomalies(newFilters.status ? { status: newFilters.status, type: newFilters.type } : undefined);
  };

  const handleCorrect = async () => {
    if (!selectedAnomaly || !correctValue) return;
    try {
      setConflictError(null);
      await correctAnomaly(selectedAnomaly.id, Number(correctValue), selectedAnomaly.currentVersion);
      setShowCorrect(false);
      setCorrectValue('');
      setRemark('');
    } catch (err: any) {
      if (err.message.includes('已被其他用户修改')) {
        setConflictError('数据已被其他用户修改，请刷新后重试。原始值: ' + (selectedAnomaly.correctedValue ?? selectedAnomaly.rawValue));
      } else {
        setConflictError(err.message || '修正失败');
      }
    }
  };

  const handleIgnore = async () => {
    if (!selectedAnomaly) return;
    try {
      await ignoreAnomaly(selectedAnomaly.id, remark);
      setRemark('');
    } catch (err: any) {
      setConflictError(err.message || '忽略失败');
    }
  };

  const handleRevert = async () => {
    if (!selectedAnomaly) return;
    try {
      await revertAnomaly(selectedAnomaly.id);
    } catch (err: any) {
      setConflictError(err.message || '撤销失败');
    }
  };

  const handleBatchRevert = async (batchId: string) => {
    if (!window.confirm('确定要撤销该批次的所有操作吗？')) return;
    try {
      await revertBatch(batchId);
      alert('撤销成功');
    } catch (err: any) {
      alert(err.message || '撤销失败');
    }
  };

  const handleBatchCompare = async () => {
    if (!batch1Id || !batch2Id) {
      alert('请选择要对比的两个批次');
      return;
    }
    try {
      await compareBatches(batch1Id, batch2Id);
    } catch (err: any) {
      alert(err.message || '批次对比失败');
    }
  };

  const handleExportCompare = async () => {
    if (!batch1Id || !batch2Id) return;
    try {
      await exportBatchCompare(batch1Id, batch2Id);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const handleViewReplay = async (anomalyId: string) => {
    try {
      await getAnomalyReplay(anomalyId);
      setViewMode('replay');
    } catch (err: any) {
      alert(err.message || '获取回放失败');
    }
  };

  const handleExportFiltered = async () => {
    try {
      await exportFiltered(filters);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const handleExportReplay = async (anomalyId: string) => {
    try {
      await exportReplay(anomalyId);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const isSupervisor = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR';

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case 'JUMP': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'ROLLBACK': return <RotateCcw className="w-5 h-5 text-red-500" />;
      case 'MISSING': return <XCircle className="w-5 h-5 text-slate-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">待复核</span>;
      case 'CORRECTED': return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">已修正</span>;
      case 'IGNORED': return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">已忽略</span>;
      case 'REVERTED': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">已撤销</span>;
      default: return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1"><Shield className="w-3 h-3" /> 管理员</span>;
      case 'SUPERVISOR': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 主管</span>;
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full flex items-center gap-1"><Users className="w-3 h-3" /> 复核人</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">异常复核</h1>
          <p className="text-slate-500 mt-2">处理跳变、缺失、回退等异常读数</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
            <Users className="w-5 h-5 text-slate-500" />
            <span className="font-medium text-slate-700">{currentUser?.username || 'user'}</span>
            {getRoleBadge(currentUser?.role || 'REVIEWER')}
          </div>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
            activeTab === 'anomalies'
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            异常列表
          </div>
        </button>
        <button
          onClick={() => setActiveTab('compare')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
            activeTab === 'compare'
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            批次对比
          </div>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
            activeTab === 'logs'
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" />
            操作日志
          </div>
        </button>
      </div>

      {activeTab === 'anomalies' && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-slate-500" />
                <span className="font-medium text-slate-700">筛选条件</span>
              </div>
              {isSupervisor && (
                <button
                  onClick={handleExportFiltered}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  导出
                </button>
              )}
            </div>
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex gap-4">
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange({ ...filters, status: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">全部状态</option>
                  <option value="PENDING">待复核</option>
                  <option value="CORRECTED">已修正</option>
                  <option value="IGNORED">已忽略</option>
                  <option value="REVERTED">已撤销</option>
                </select>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange({ ...filters, type: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">全部类型</option>
                  <option value="JUMP">跳变</option>
                  <option value="MISSING">缺失</option>
                  <option value="ROLLBACK">回退</option>
                </select>
                {(filters.status || filters.type) && (
                  <button
                    onClick={() => handleFilterChange({ status: '', type: '' })}
                    className="px-3 py-2 text-slate-500 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  onClick={() => {
                    selectAnomaly(anomaly);
                    setShowCorrect(false);
                    setCorrectValue('');
                    setRemark('');
                    setConflictError(null);
                  }}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedAnomaly?.id === anomaly.id
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : 'hover:bg-slate-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getAnomalyIcon(anomaly.anomalyType)}
                      <span className="font-medium text-slate-800">
                        {ANOMALY_TYPE_LABELS[anomaly.anomalyType]}
                      </span>
                    </div>
                    {getStatusBadge(anomaly.status)}
                  </div>
                  <div className="text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span>表计: {anomaly.meterId}</span>
                      <span>{anomaly.readingDate}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>{METER_TYPE_LABELS[anomaly.meterType]}</span>
                      <span className="font-mono">原始值: {anomaly.rawValue}</span>
                    </div>
                  </div>
                </div>
              ))}
              {anomalies.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  暂无异常记录
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7 space-y-6">
            {selectedAnomaly ? (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">异常详情</h3>
                    <button
                      onClick={() => handleViewReplay(selectedAnomaly.id)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100"
                    >
                      <Play className="w-4 h-4" />
                      回放
                    </button>
                  </div>

                  {conflictError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-700">{conflictError}</p>
                          <p className="text-sm text-red-600 mt-1">请刷新页面后重新尝试操作</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">表计编号</p>
                      <p className="font-medium text-slate-800">{selectedAnomaly.meterId}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">能源类型</p>
                      <p className="font-medium text-slate-800">{METER_TYPE_LABELS[selectedAnomaly.meterType]}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">读数日期</p>
                      <p className="font-medium text-slate-800">{selectedAnomaly.readingDate}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">异常类型</p>
                      <div className="flex items-center gap-2">
                        {getAnomalyIcon(selectedAnomaly.anomalyType)}
                        <p className="font-medium text-slate-800">
                          {ANOMALY_TYPE_LABELS[selectedAnomaly.anomalyType]}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-600 mb-1">原始值</p>
                      <p className="font-mono text-xl font-bold text-orange-700">{selectedAnomaly.rawValue}</p>
                    </div>
                    {selectedAnomaly.correctedValue !== undefined && (
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-600 mb-1">修正值</p>
                        <p className="font-mono text-xl font-bold text-green-700">{selectedAnomaly.correctedValue}</p>
                      </div>
                    )}
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">批次号</p>
                      <p className="font-mono text-sm text-slate-800">{selectedAnomaly.batchNo || '-'}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">版本号</p>
                      <p className="font-mono text-sm text-slate-800">v{selectedAnomaly.currentVersion}</p>
                    </div>
                  </div>

                  {selectedAnomaly.remark && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">备注</p>
                      <p className="text-slate-700">{selectedAnomaly.remark}</p>
                    </div>
                  )}
                  {selectedAnomaly.resolvedBy && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500 mb-1">处理人</p>
                      <p className="text-slate-700">{selectedAnomaly.resolvedBy}</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">处理操作</h3>

                  {selectedAnomaly.status === 'PENDING' && (
                    <>
                      {!showCorrect ? (
                        <div className="flex gap-4">
                          <button
                            onClick={() => setShowCorrect(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <CheckCircle className="w-5 h-5" />
                            修正
                          </button>
                          <button
                            onClick={handleIgnore}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                          >
                            <XCircle className="w-5 h-5" />
                            忽略
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              修正值
                            </label>
                            <input
                              type="number"
                              value={correctValue}
                              onChange={(e) => setCorrectValue(e.target.value)}
                              placeholder={`请输入修正值（原值: ${selectedAnomaly.rawValue}）`}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            {selectedAnomaly.anomalyType === 'ROLLBACK' && (
                              <p className="mt-2 text-sm text-orange-600">
                                注意：回退异常不能将读数修正为低于原始值
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              备注（可选）
                            </label>
                            <textarea
                              value={remark}
                              onChange={(e) => setRemark(e.target.value)}
                              placeholder="请输入修正说明..."
                              rows={3}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex gap-4">
                            <button
                              onClick={handleCorrect}
                              disabled={!correctValue || loading}
                              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              确认修正
                            </button>
                            <button
                              onClick={() => {
                                setShowCorrect(false);
                                setCorrectValue('');
                              }}
                              className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}

                      {!showCorrect && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            忽略说明
                          </label>
                          <textarea
                            value={remark}
                            onChange={(e) => setRemark(e.target.value)}
                            placeholder="请输入忽略原因..."
                            rows={2}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {(selectedAnomaly.status === 'CORRECTED' || selectedAnomaly.status === 'IGNORED') && (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-600 mb-2">
                          已{selectedAnomaly.status === 'CORRECTED' ? '修正' : '忽略'}
                        </p>
                        {selectedAnomaly.resolvedBy && (
                          <p className="text-sm text-slate-600">
                            操作人: {selectedAnomaly.resolvedBy}
                          </p>
                        )}
                        {selectedAnomaly.resolvedAt && (
                          <p className="text-sm text-slate-600">
                            时间: {new Date(selectedAnomaly.resolvedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleRevert}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                      >
                        <RotateCcw className="w-5 h-5" />
                        撤销操作
                      </button>
                    </div>
                  )}

                  {selectedAnomaly.status === 'REVERTED' && (
                    <div className="p-4 bg-slate-100 rounded-lg">
                      <p className="text-slate-600">该异常已撤销，恢复为待复核状态</p>
                    </div>
                  )}

                  {loading && (
                    <div className="mt-4 text-center text-slate-500">处理中...</div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <AlertTriangle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">请从左侧选择一个异常记录</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <GitCompare className="w-5 h-5" />
              批次对比
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  批次1（较旧）
                </label>
                <select
                  value={batch1Id}
                  onChange={(e) => setBatch1Id(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择批次</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchNo} ({batch.importedAt.split('T')[0]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center">
                <ChevronRight className="w-6 h-6 text-slate-400 rotate-90" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  批次2（较新）
                </label>
                <select
                  value={batch2Id}
                  onChange={(e) => setBatch2Id(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择批次</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchNo} ({batch.importedAt.split('T')[0]})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleBatchCompare}
                disabled={!batch1Id || !batch2Id || loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                开始对比
              </button>
              {isSupervisor && batch1Id && batch2Id && (
                <button
                  onClick={handleExportCompare}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Download className="w-5 h-5" />
                  导出对比结果
                </button>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="font-medium text-slate-700 mb-4">批次管理</h4>
              <div className="space-y-2">
                {batches.slice(0, 5).map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-700">{batch.batchNo}</p>
                      <p className="text-xs text-slate-500">{batch.totalCount} 条记录</p>
                    </div>
                    {isSupervisor && (
                      <button
                        onClick={() => handleBatchRevert(batch.id)}
                        className="px-2 py-1 text-xs text-orange-600 bg-orange-50 rounded hover:bg-orange-100"
                      >
                        撤销全部
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {batchComparison ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">对比结果</h3>
                  <div className="flex gap-4 text-sm">
                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">
                      新增: {batchComparison.newAnomalies.length}
                    </span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                      已修正: {batchComparison.correctedAnomalies.length}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
                      已忽略: {batchComparison.ignoredAnomalies.length}
                    </span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      已撤销: {batchComparison.revertedAnomalies.length}
                    </span>
                  </div>
                </div>

                {batchComparison.newAnomalies.length > 0 && (
                  <div>
                    <h4 className="font-medium text-slate-700 mb-2">新增异常</h4>
                    <div className="space-y-2">
                      {batchComparison.newAnomalies.map((a) => (
                        <div key={a.id} className="p-3 bg-orange-50 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getAnomalyIcon(a.anomalyType)}
                            <div>
                              <p className="font-medium">{a.meterId}</p>
                              <p className="text-sm text-slate-500">
                                {METER_TYPE_LABELS[a.meterType]} | 原始值: {a.rawValue}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(a.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {batchComparison.correctedAnomalies.length > 0 && (
                  <div>
                    <h4 className="font-medium text-slate-700 mb-2">已修正异常</h4>
                    <div className="space-y-2">
                      {batchComparison.correctedAnomalies.map((a) => (
                        <div key={a.id} className="p-3 bg-green-50 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getAnomalyIcon(a.anomalyType)}
                            <div>
                              <p className="font-medium">{a.meterId}</p>
                              <p className="text-sm text-slate-500">
                                {METER_TYPE_LABELS[a.meterType]} | 原始值: {a.rawValue} → 修正值: {a.correctedValue}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(a.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {batchComparison.meterTrajectory.length > 0 && (
                  <div>
                    <h4 className="font-medium text-slate-700 mb-2">表计轨迹</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="px-3 py-2 text-left">表计编号</th>
                            <th className="px-3 py-2 text-left">日期</th>
                            <th className="px-3 py-2 text-left">原始值</th>
                            <th className="px-3 py-2 text-left">修正值</th>
                            <th className="px-3 py-2 text-left">异常状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchComparison.meterTrajectory.flatMap((t) =>
                            t.readings.map((r) => {
                              const anomaly = t.anomalies.find(a => a.readingId === r.id);
                              return (
                                <tr key={r.id} className="border-b border-slate-100">
                                  <td className="px-3 py-2">{t.meterId}</td>
                                  <td className="px-3 py-2">{r.readingDate}</td>
                                  <td className="px-3 py-2 font-mono">{r.rawValue}</td>
                                  <td className="px-3 py-2 font-mono">{r.correctedValue ?? '-'}</td>
                                  <td className="px-3 py-2">
                                    {anomaly ? getStatusBadge(anomaly.status) : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <GitCompare className="w-12 h-12 mx-auto mb-4" />
                <p>请选择两个批次进行对比</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <History className="w-5 h-5" />
            操作日志
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-4 py-3 text-left">时间</th>
                  <th className="px-4 py-3 text-left">操作人</th>
                  <th className="px-4 py-3 text-left">操作类型</th>
                  <th className="px-4 py-3 text-left">目标类型</th>
                  <th className="px-4 py-3 text-left">详情</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 text-slate-500" colSpan={5}>
                    暂无操作记录
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'replay' && anomalyReplay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                <Play className="w-6 h-6 text-purple-500" />
                复核回放
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExportReplay(anomalyReplay.anomalyId)}
                  className="flex items-center gap-1 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                >
                  <Download className="w-5 h-5" />
                  导出
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500 mb-1">表计编号</p>
                  <p className="font-medium text-slate-800">{anomalyReplay.meterId}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500 mb-1">能源类型</p>
                  <p className="font-medium text-slate-800">{METER_TYPE_LABELS[anomalyReplay.meterType]}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500 mb-1">读数日期</p>
                  <p className="font-medium text-slate-800">{anomalyReplay.readingDate}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500 mb-1">异常类型</p>
                  <p className="font-medium text-slate-800">{ANOMALY_TYPE_LABELS[anomalyReplay.anomalyType]}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-600 mb-1">原始值</p>
                  <p className="font-mono text-xl font-bold text-orange-700">{anomalyReplay.rawValue}</p>
                </div>
                {anomalyReplay.correctedValue && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600 mb-1">修正值</p>
                    <p className="font-mono text-xl font-bold text-green-700">{anomalyReplay.correctedValue}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  处理时间线
                </h4>
                <div className="space-y-3">
                  {anomalyReplay.processedAt.map((time, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mt-1.5"></div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-700">
                          {i === 0 ? '检测到异常' : i === anomalyReplay.processedAt.length - 1 ? '处理完成' : `第${i}次修正`}
                        </p>
                        <p className="text-sm text-slate-500">{new Date(time).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {anomalyReplay.corrections.length > 0 && (
                <div>
                  <h4 className="font-medium text-slate-700 mb-3">修正历史</h4>
                  <div className="space-y-2">
                    {anomalyReplay.corrections.map((c) => (
                      <div key={c.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{c.operator}</span>
                          <span className="text-sm text-slate-500">{new Date(c.operatedAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {c.originalValue} → {c.newValue} (v{c.version})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {anomalyReplay.ruleSnapshot.length > 0 && (
                <div>
                  <h4 className="font-medium text-slate-700 mb-3">当时阈值配置</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {anomalyReplay.ruleSnapshot.map((r) => (
                      <div key={r.id} className="p-3 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600">{r.configKey === 'jumpThreshold' ? '跳变阈值' : r.configKey === 'missingDays' ? '缺失判定天数' : '回退检测'}</p>
                        <p className="font-medium text-purple-800">
                          {r.configKey === 'rollbackEnabled' ? (r.configValue === 'true' ? '启用' : '禁用') : r.configValue}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
