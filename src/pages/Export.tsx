import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useStore } from '../store';
import { FileDown, FileText, BarChart3, Download, Calendar } from 'lucide-react';

export function Export() {
  const currentOperator = useStore(state => state.currentOperator);
  const [exportType, setExportType] = useState<'detail' | 'summary'>('detail');
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
  const [loading, setLoading] = useState(false);
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  const [lastSummary, setLastSummary] = useState<any>(null);
  const [exportMessage, setExportMessage] = useState<{type: 'success' | 'warning' | 'error', text: string} | null>(null);

  useEffect(() => {
    localStorage.setItem('export_dateFrom', dateFrom);
  }, [dateFrom]);

  useEffect(() => {
    localStorage.setItem('export_dateTo', dateTo);
  }, [dateTo]);

  useEffect(() => {
    localStorage.setItem('export_meterType', meterType);
  }, [meterType]);

  const handleExport = async () => {
    setLoading(true);
    setExportMessage(null);
    try {
      const params: any = {
        operator: currentOperator
      };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (meterType) params.meterType = meterType;

      if (exportType === 'detail') {
        const result = await api.export.detail(params);

        if (result.success === false) {
          setExportMessage({
            type: 'warning',
            text: result.message || '没有符合条件的数据'
          });
          return;
        }

        const baseUrl = window.location.origin;
        const link = document.createElement('a');
        link.href = `${baseUrl}${result.filePath}`;
        link.download = result.filePath.split('/').pop() || 'energy_detail.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage({
          type: 'success',
          text: `导出成功，共 ${result.recordCount} 条记录`
        });
      } else {
        const result = await api.export.summary(params);
        setLastSummary(result.summary);
        const baseUrl = window.location.origin;
        const link = document.createElement('a');
        link.href = `${baseUrl}${result.filePath}`;
        link.download = result.filePath.split('/').pop() || 'energy_summary.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage({
          type: 'success',
          text: `导出成功，共 ${result.summary.totalCount} 条记录`
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
              <div className="grid grid-cols-2 gap-4">
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
            <div className="flex items-center gap-2 mb-4">
              <FileDown className="w-5 h-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-800">导出记录</h2>
            </div>

            <div className="space-y-3">
              {exportHistory.length > 0 ? (
                exportHistory.slice(0, 10).map((record) => (
                  <div key={record.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        record.exportType === 'DETAIL'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {record.exportType === 'DETAIL' ? '明细' : '汇总'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(record.downloadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {record.params && (
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {JSON.parse(record.params).dateFrom || '全部时间'}
                      </p>
                    )}
                  </div>
                ))
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
        </div>
      </div>
    </div>
  );
}
