import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { AlertTriangle, CheckCircle, XCircle, RotateCcw, Filter, X } from 'lucide-react';
import { METER_TYPE_LABELS, ANOMALY_TYPE_LABELS, STATUS_LABELS, AnomalyWithReading, RuleConfig } from '../types';

export function Review() {
  const {
    anomalies,
    selectedAnomaly,
    fetchAnomalies,
    selectAnomaly,
    correctAnomaly,
    ignoreAnomaly,
    revertAnomaly,
    loading,
  } = useStore();

  const [filters, setFilters] = useState({
    status: '',
    type: '',
  });
  const [correctValue, setCorrectValue] = useState('');
  const [remark, setRemark] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);

  useEffect(() => {
    fetchAnomalies(filters.status ? { status: filters.status } : undefined);
  }, [filters.status, fetchAnomalies]);

  const handleCorrect = async () => {
    if (!selectedAnomaly || !correctValue) return;
    try {
      await correctAnomaly(selectedAnomaly.id, Number(correctValue), selectedAnomaly.currentVersion);
      setShowCorrect(false);
      setCorrectValue('');
      setRemark('');
    } catch (err: any) {
      alert(err.message || '修正失败');
    }
  };

  const handleIgnore = async () => {
    if (!selectedAnomaly) return;
    try {
      await ignoreAnomaly(selectedAnomaly.id, remark);
      setRemark('');
    } catch (err: any) {
      alert(err.message || '忽略失败');
    }
  };

  const handleRevert = async () => {
    if (!selectedAnomaly) return;
    try {
      await revertAnomaly(selectedAnomaly.id);
    } catch (err: any) {
      alert(err.message || '撤销失败');
    }
  };

  const getAnomalyIcon = (type: string) => {
    switch (type) {
      case 'JUMP':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'ROLLBACK':
        return <RotateCcw className="w-5 h-5 text-red-500" />;
      case 'MISSING':
        return <XCircle className="w-5 h-5 text-slate-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">待复核</span>;
      case 'CORRECTED':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">已修正</span>;
      case 'IGNORED':
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">已忽略</span>;
      case 'REVERTED':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">已撤销</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">异常复核</h1>
        <p className="text-slate-500 mt-2">处理跳变、缺失、回退等异常读数</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-500" />
            <span className="font-medium text-slate-700">筛选条件</span>
          </div>
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex gap-4">
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
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
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">全部类型</option>
                <option value="JUMP">跳变</option>
                <option value="MISSING">缺失</option>
                <option value="ROLLBACK">回退</option>
              </select>
              {(filters.status || filters.type) && (
                <button
                  onClick={() => setFilters({ status: '', type: '' })}
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
                <h3 className="text-lg font-semibold text-slate-800 mb-4">异常详情</h3>

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
    </div>
  );
}
