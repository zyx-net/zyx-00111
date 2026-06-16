import { useState, useEffect } from 'react';
import { api, getApiServer } from '../utils/api';
import { useStore } from '../store';
import { FileDown, FileText, BarChart3, Download, Calendar, Filter, Activity } from 'lucide-react';
import { OperationLog } from '../types';

export function Export() {
  const currentOperator = useStore(state => state.currentOperator);
  const currentUser = useStore(state => state.currentUser);
  const [exportType, setExportType] = useState<'detail' | 'summary' | 'filtered'>('detail');
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('export_dateFrom');
    return saved || '';
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('export_dateTo');
    return saved || '';
  });
  const [meterType, setMeterType] = useState(() => {
    const saved = localStorage.getItem('export_meterType');
    return saved || '';
  });
  const [filterStatus, setFilterStatus] = useState(() => {
    const saved = localStorage.getItem('export_filterStatus');
    return saved || '';
  });
  const [filterType, setFilterType] = useState(() => {
    const saved = localStorage.getItem('export_filterType');
    return saved || '';
  });
  const [loading, setLoading] = useState(false);
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  const [lastSummary, setLastSummary] = useState<any>(null);
  const [exportMessage, setExportMessage] = useState<{type: 'success' | 'warning' | 'error', text: string} | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'mine'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('mine');
  const isSupervisor = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR';

  useEffect(() => {
    localStorage.setItem('export_dateFrom', dateFrom);
  }, [dateFrom]);

  useEffect(() => {
    localStorage.setItem('export_dateTo', dateTo);
  }, [dateTo]);

  useEffect(() => {
    localStorage.setItem('export_meterType', meterType);
  }, [meterType]);

  useEffect(() => {
    localStorage.setItem('export_filterStatus', filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    localStorage.setItem('export_filterType', filterType);
  }, [filterType]);

  useEffect(() => {
    const loadExportHistory = async () => {
      try {
        const filters = isSupervisor && historyFilter === 'all' 
          ? undefined 
          : { operator: currentOperator };
        const records = await api.export.list(filters);
        setExportHistory(records);
      } catch (err) {
        console.error('Failed to load export history:', err);
      }
    };
    loadExportHistory();
  }, [historyFilter, currentOperator, isSupervisor]);

  useEffect(() => {
    if (showLogs) {
      const loadLogs = async () => {
        try {
          const filters = logFilter === 'mine' ? { operator: currentOperator } : undefined;
          const logs = await api.logs.list(filters);
          const exportLogs = logs.filter(log => 
            log.operationType === 'EXPORT' || 
            log.operationType === 'BATCH_EXPORT'
          );
          setOperationLogs(exportLogs);
        } catch (err) {
          console.error('Failed to load operation logs:', err);
        }
      };
      loadLogs();
    }
  }, [showLogs, logFilter, currentOperator]);

  const handleExport = async () => {
    setLoading(true);
    setExportMessage(null);
    try {
      const serverUrl = getApiServer();

      if (exportType === 'detail') {
        const params: any = {
          operator: currentOperator
        };
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (meterType) params.meterType = meterType;

        const result = await api.export.detail(params);

        if (result.success === false) {
          setExportMessage({
            type: 'warning',
            text: result.message || '没有符合条件的数据'
          });
          setLoading(false);
          return;
        }

        const fileName = result.filePath.split('/').pop() || 'energy_detail.csv';
        const link = document.createElement('a');
        link.href = `${serverUrl}${result.filePath}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage({
          type: 'success',
          text: `导出成功，共 ${result.recordCount || 0} 条记录，文件名: ${fileName}`
        });
      } else if (exportType === 'summary') {
        const params: any = {
          operator: currentOperator
        };
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;

        const result = await api.export.summary(params);

        if (result.success === false) {
          setExportMessage({
            type: 'warning',
            text: result.message || '没有符合条件的数据'
          });
          setLoading(false);
          return;
        }

        setLastSummary(result.summary);
        const fileName = result.filePath.split('/').pop() || 'energy_summary.csv';
        const link = document.createElement('a');
        link.href = `${serverUrl}${result.filePath}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage({
          type: 'success',
          text: `导出成功，共 ${result.summary?.totalCount || 0} 条记录，文件名: ${fileName}`
        });
      } else if (exportType === 'filtered') {
        if (!isSupervisor) {
          setExportMessage({
            type: 'error',
            text: '权限不足，只有主管可以导出筛选结果'
          });
          setLoading(false);
          return;
        }

        const filters: any = {};
        if (filterStatus) filters.status = filterStatus;
        if (filterType) filters.type = filterType;

        const result = await api.export.filtered(filters, currentOperator);

        if (result.success === false) {
          setExportMessage({
            type: 'warning',
            text: result.message || '没有符合条件的数据'
          });
          setLoading(false);
          return;
        }

        const fileName = result.filePath.split('/').pop() || 'filtered_anomalies.csv';
        const link = document.createElement('a');
        link.href = `${serverUrl}${result.filePath}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage({
          type: 'success',
          text: `导出成功，共 ${result.count || 0} 条异常记录，文件名: ${fileName}`
        });
      }

      const records = await api.export.list();
      setExportHistory(records);
    } catch (err: any) {
      setExportMessage({
        type: 'error',
        text: err.message || '导出失败'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">导出中心</h1>
        <p className="text-slate-500 mt-2">导出能源计量数据明细和汇总报表</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">导出配置</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                导出类型
              </label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => setExportType('detail')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    exportType === 'detail'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileText className={`w-8 h-8 mx-auto mb-2 ${
                    exportType === 'detail' ? 'text-blue-600' : 'text-slate-400'
                  }`} />
                  <p className={`font-medium ${
                    exportType === 'detail' ? 'text-blue-700' : 'text-slate-700'
                  }`}>
                    数据明细
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    导出完整的读数明细记录
                  </p>
                </button>

                <button
                  onClick={() => setExportType('summary')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    exportType === 'summary'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <BarChart3 className={`w-8 h-8 mx-auto mb-2 ${
                    exportType === 'summary' ? 'text-blue-600' : 'text-slate-400'
                  }`} />
                  <p className={`font-medium ${
                    exportType === 'summary' ? 'text-blue-700' : 'text-slate-700'
                  }`}>
                    汇总报表
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    导出按类型统计的汇总数据
                  </p>
                </button>

                <button
                  onClick={() => setExportType('filtered')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    exportType === 'filtered'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${!isSupervisor ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!isSupervisor}
                  title={!isSupervisor ? '仅主管可使用' : '导出筛选的异常记录'}
                >
                  <Filter className={`w-8 h-8 mx-auto mb-2 ${
                    exportType === 'filtered' ? 'text-purple-600' : 'text-slate-400'
                  }`} />
                  <p className={`font-medium ${
                    exportType === 'filtered' ? 'text-purple-700' : 'text-slate-700'
                  }`}>
                    筛选导出
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {isSupervisor ? '导出筛选的异常记录' : '（仅主管可用）'}
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  开始日期
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  结束日期
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {exportType === 'detail' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  能源类型
                </label>
                <select
                  value={meterType}
                  onChange={(e) => setMeterType(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">全部类型</option>
                  <option value="WATER">水</option>
                  <option value="ELECTRICITY">电</option>
                  <option value="GAS">气</option>
                </select>
              </div>
            )}

            {exportType === 'filtered' && (
              <div className="mb-6 space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h3 className="font-medium text-purple-800">异常筛选条件</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      异常状态
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      <option value="">全部状态</option>
                      <option value="PENDING">待复核</option>
                      <option value="CORRECTED">已修正</option>
                      <option value="IGNORED">已忽略</option>
                      <option value="REVERTED">已撤销</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      异常类型
                    </label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      <option value="">全部类型</option>
                      <option value="JUMP">跳变</option>
                      <option value="MISSING">缺失</option>
                      <option value="ROLLBACK">回退</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-5 h-5" />
              {loading ? '导出中...' : '导出CSV'}
            </button>

            {exportMessage && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                exportMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                exportMessage.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {exportMessage.text}
              </div>
            )}
          </div>

          {lastSummary && (
            <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">汇总预览</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">总记录数</p>
                  <p className="text-2xl font-bold text-slate-800">{lastSummary.totalCount}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">总消耗量</p>
                  <p className="text-2xl font-bold text-slate-800">{lastSummary.totalRawValue?.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-600">待复核异常</p>
                  <p className="text-2xl font-bold text-orange-700">{lastSummary.pendingAnomalyCount}</p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-slate-700">按类型统计</h4>
                {lastSummary.byType?.map((item: any) => (
                  <div key={item.type} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                    <span className="text-slate-700">{item.type}</span>
                    <div className="flex gap-4 text-sm">
                      <span>记录: {item.count}</span>
                      <span>总量: {item.totalRaw?.toLocaleString()}</span>
                      <span className="text-orange-600">异常: {item.anomalyCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileDown className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-800">导出记录</h2>
              </div>
              {isSupervisor && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryFilter('mine')}
                    className={`px-3 py-1 text-xs rounded ${
                      historyFilter === 'mine'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    我的记录
                  </button>
                  <button
                    onClick={() => setHistoryFilter('all')}
                    className={`px-3 py-1 text-xs rounded ${
                      historyFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    全部记录
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {exportHistory.length > 0 ? (
                exportHistory.slice(0, 20).map((record) => {
                  const params = record.params ? JSON.parse(record.params) : {};
                  const exportTypeLabel = {
                    'DETAIL': '明细',
                    'SUMMARY': '汇总',
                    'BATCH_COMPARE': '批次对比',
                    'REPLAY': '回放',
                    'FILTERED': '筛选'
                  }[record.exportType] || record.exportType;
                  
                  return (
                    <div key={record.id} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          record.exportType === 'DETAIL'
                            ? 'bg-blue-100 text-blue-700'
                            : record.exportType === 'SUMMARY'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {exportTypeLabel}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(record.downloadedAt).toLocaleDateString()} {new Date(record.downloadedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {params.dateFrom || params.dateTo ? (
                          <span>
                            {params.dateFrom || '...'} 至 {params.dateTo || '...'}
                          </span>
                        ) : (
                          <span>全部时间</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        操作人: {record.downloadedBy || 'system'}
                        {record.recordCount !== undefined && (
                          <span className="ml-2">({record.recordCount} 条)</span>
                        )}
                      </div>
                      {record.fileName && (
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = `${getApiServer()}/exports/${record.fileName}`;
                            link.download = record.fileName;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          重新下载
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-400">
                  暂无导出记录
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-6">
            <h3 className="font-semibold text-blue-800 mb-3">导出说明</h3>
            <ul className="text-sm text-blue-700 space-y-2">
              <li>• 数据明细导出完整的读数和异常记录</li>
              <li>• 汇总报表按能源类型统计总量和异常数</li>
              <li>• 可通过日期范围筛选导出特定时间段</li>
              <li>• 导出文件格式为CSV (.csv)</li>
            </ul>
          </div>

          <button
            onClick={() => setShowLogs(!showLogs)}
            className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Activity className="w-5 h-5" />
            {showLogs ? '隐藏操作日志' : '查看导出操作日志'}
          </button>

          {showLogs && (
            <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">导出操作日志</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLogFilter('all')}
                    className={`px-3 py-1 text-sm rounded ${
                      logFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    全部日志
                  </button>
                  <button
                    onClick={() => setLogFilter('mine')}
                    className={`px-3 py-1 text-sm rounded ${
                      logFilter === 'mine'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    我的日志
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {operationLogs.length > 0 ? (
                  operationLogs.slice(0, 50).map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            {log.operationType}
                          </span>
                          <span className="text-sm font-medium text-slate-700">
                            {log.targetType}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(log.operatedAt).toLocaleDateString()} {new Date(log.operatedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-medium">操作人:</span> {log.operator}
                        {log.details && (
                          <>
                            {' | '}
                            <span className="font-medium">详情:</span> {JSON.parse(log.details).dateFrom || JSON.parse(log.details).filters?.status || '全部'}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    暂无导出日志
                  </div>
                )}
              </div>
              {!isSupervisor && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-700">
                  注意：您当前以"复核员"身份登录，只能查看自己的导出日志。主管可以查看所有用户的日志。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
