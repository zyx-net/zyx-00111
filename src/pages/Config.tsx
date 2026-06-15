import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Settings, History, RotateCcw, Save } from 'lucide-react';
import { format } from 'date-fns';
import { RuleConfig } from '../types';

export function Config() {
  const { rules, ruleHistory, fetchRules, fetchRuleHistory, updateRules, rollbackRules, loading } = useStore();
  const [localRules, setLocalRules] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchRuleHistory();
  }, [fetchRules, fetchRuleHistory]);

  useEffect(() => {
    const rulesMap: Record<string, string> = {};
    rules.forEach((rule: RuleConfig) => {
      rulesMap[rule.configKey] = rule.configValue;
    });
    setLocalRules(rulesMap);
  }, [rules]);

  const handleChange = (key: string, value: string) => {
    setLocalRules({ ...localRules, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    const configs = Object.entries(localRules).map(([key, value]) => ({ key, value }));
    try {
      await updateRules(configs);
      setHasChanges(false);
      alert('配置保存成功');
    } catch (err: any) {
      alert(err.message || '保存失败');
    }
  };

  const handleRollback = async (version: number) => {
    if (!confirm(`确定要回滚到版本 ${version} 吗？`)) return;
    try {
      await rollbackRules(version);
      alert('回滚成功');
    } catch (err: any) {
      alert(err.message || '回滚失败');
    }
  };

  const getRuleLabel = (key: string) => {
    switch (key) {
      case 'jumpThreshold':
        return '跳变阈值 (%)';
      case 'missingDays':
        return '缺失判定天数';
      case 'rollbackEnabled':
        return '回退检测开关';
      default:
        return key;
    }
  };

  const getRuleDescription = (key: string) => {
    switch (key) {
      case 'jumpThreshold':
        return '当读数变化超过此百分比时，标记为跳变异常';
      case 'missingDays':
        return '当超过此天数无读数时，标记为缺失异常';
      case 'rollbackEnabled':
        return '是否启用回退检测（当前读数低于上次读数）';
      default:
        return '';
    }
  };

  const groupedHistory: Record<number, RuleConfig[]> = ruleHistory.reduce((acc, rule) => {
    if (!acc[rule.version]) {
      acc[rule.version] = [];
    }
    acc[rule.version].push(rule);
    return acc;
  }, {} as Record<number, RuleConfig[]>);

  const currentVersion = Math.max(...rules.map((r) => r.version), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">规则配置</h1>
        <p className="text-slate-500 mt-2">设置异常检测阈值和规则</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-slate-800">当前配置</h2>
              </div>
              <div className="text-sm text-slate-500">
                版本 {currentVersion}
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {getRuleLabel('jumpThreshold')}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={localRules['jumpThreshold'] || ''}
                    onChange={(e) => handleChange('jumpThreshold', e.target.value)}
                    min="0"
                    max="100"
                    className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-slate-500">%</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {getRuleDescription('jumpThreshold')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {getRuleLabel('missingDays')}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={localRules['missingDays'] || ''}
                    onChange={(e) => handleChange('missingDays', e.target.value)}
                    min="1"
                    max="365"
                    className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-slate-500">天</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {getRuleDescription('missingDays')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {getRuleLabel('rollbackEnabled')}
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleChange('rollbackEnabled', localRules['rollbackEnabled'] === 'true' ? 'false' : 'true')}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                      localRules['rollbackEnabled'] === 'true' ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                        localRules['rollbackEnabled'] === 'true' ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-slate-600">
                    {localRules['rollbackEnabled'] === 'true' ? '启用' : '禁用'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {getRuleDescription('rollbackEnabled')}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={!hasChanges || loading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-5 h-5" />
                保存配置
              </button>
              {hasChanges && (
                <p className="mt-2 text-sm text-orange-600">
                  配置已修改，请点击保存以应用更改
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <History className="w-5 h-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-800">配置历史</h2>
            </div>

            <div className="space-y-6 max-h-[400px] overflow-y-auto">
              {Object.entries(groupedHistory)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([version, versionRules]) => (
                  <div
                    key={version}
                    className={`p-4 rounded-lg border ${
                      Number(version) === currentVersion
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">版本 {version}</span>
                        {Number(version) === currentVersion && (
                          <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-xs rounded-full">
                            当前
                          </span>
                        )}
                      </div>
                      {Number(version) !== currentVersion && (
                        <button
                          onClick={() => handleRollback(Number(version))}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-orange-600 hover:bg-orange-100 rounded transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                          回滚
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      {versionRules.map((rule) => (
                        <div key={rule.id} className="flex justify-between">
                          <span className="text-slate-600">
                            {getRuleLabel(rule.configKey)}:
                          </span>
                          <span className="font-medium text-slate-800">
                            {rule.configKey === 'rollbackEnabled'
                              ? rule.configValue === 'true'
                                ? '启用'
                                : '禁用'
                              : rule.configValue}
                            {rule.configKey === 'jumpThreshold' ? '%' : rule.configKey === 'missingDays' ? '天' : ''}
                          </span>
                        </div>
                      ))}
                      <div className="text-xs text-slate-400 pt-2 border-t border-slate-200">
                        更新于 {format(new Date(versionRules[0].updatedAt), 'yyyy-MM-dd HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}

              {Object.keys(groupedHistory).length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  暂无历史记录
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
