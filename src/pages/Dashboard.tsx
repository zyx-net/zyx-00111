import { useEffect } from 'react';
import { useStore } from '../store';
import { AlertTriangle, TrendingUp, FileText, Activity, Droplets, Zap, Flame } from 'lucide-react';
import { METER_TYPE_LABELS } from '../types';

export function Dashboard() {
  const { dashboardStats, fetchDashboardStats } = useStore();

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const stats = [
    {
      label: '今日导入批次',
      value: dashboardStats?.todayImport ?? 0,
      icon: FileText,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
    },
    {
      label: '待复核异常',
      value: dashboardStats?.pendingAnomalies ?? 0,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
    },
    {
      label: '本月异常率',
      value: `${dashboardStats?.anomalyRate ?? '0.00'}%`,
      icon: TrendingUp,
      color: 'bg-green-500',
      textColor: 'text-green-600',
    },
  ];

  const typeIcons: Record<string, any> = {
    WATER: Droplets,
    ELECTRICITY: Zap,
    GAS: Flame,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">仪表盘</h1>
        <p className="text-slate-500 mt-2">能源计量数据概览</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg shadow-sm`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            按能源类型统计
          </h2>
          <div className="space-y-4">
            {dashboardStats?.typeStats?.map((stat) => {
              const Icon = typeIcons[stat.type] || Activity;
              return (
                <div key={stat.type} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">{METER_TYPE_LABELS[stat.type as keyof typeof METER_TYPE_LABELS] || stat.type}</p>
                      <p className="text-sm text-slate-500">{stat.count} 条记录</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">{stat.total?.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">总消耗量</p>
                  </div>
                </div>
              );
            })}
            {(!dashboardStats?.typeStats || dashboardStats.typeStats.length === 0) && (
              <div className="text-center py-8 text-slate-400">
                暂无数据
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            待复核异常
          </h2>
          <div className="space-y-3">
            {dashboardStats?.recentAnomalies?.map((anomaly) => (
              <div
                key={anomaly.id}
                className="p-4 bg-slate-50 rounded-lg border border-slate-100 hover:border-orange-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                      {anomaly.anomalyType === 'JUMP' ? '跳变' : anomaly.anomalyType === 'ROLLBACK' ? '回退' : '缺失'}
                    </span>
                    <span className="text-sm text-slate-500">{METER_TYPE_LABELS[anomaly.meterType]}</span>
                  </div>
                  <span className="text-sm text-slate-400">{anomaly.readingDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">表计: {anomaly.meterId}</span>
                  <span className="font-medium text-slate-800">{anomaly.rawValue}</span>
                </div>
              </div>
            ))}
            {(!dashboardStats?.recentAnomalies || dashboardStats.recentAnomalies.length === 0) && (
              <div className="text-center py-8 text-slate-400">
                暂无待复核异常
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
