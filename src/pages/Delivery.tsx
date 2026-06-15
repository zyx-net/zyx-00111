import { useState, useEffect } from 'react';
import { api, getApiServer } from '../utils/api';
import { useStore } from '../store';
import { Package, Plus, FileDown, Clock, AlertCircle, CheckCircle, XCircle, Eye, Trash2, Download, Lock, Unlock, RefreshCw, Shield, History, Filter, Calendar } from 'lucide-react';

interface DeliveryPackage {
  id: string;
  packageName: string;
  packageNo: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  recordCount: number;
  fileCount: number;
  totalSize: number;
  filePath?: string;
  version: number;
  lockedBy?: string;
  lockedAt?: string;
}

interface PackageTask {
  id: string;
  packageId: string;
  taskType: string;
  status: string;
  progress: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface PackageDownload {
  id: string;
  packageId: string;
  downloadedBy: string;
  downloadedAt: string;
  fileVersion?: string;
  filePath?: string;
  recordCount: number;
}

interface PackageAuditLog {
  id: string;
  packageId?: string;
  operation: string;
  operator: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  result?: string;
  createdAt: string;
}

interface PackageVersion {
  id: string;
  packageId: string;
  version: number;
  filePath?: string;
  recordCount: number;
  createdBy: string;
  createdAt: string;
  changeSummary?: string;
  isActive: boolean;
}

export function Delivery() {
  const currentOperator = useStore(state => state.currentOperator);
  const currentUser = useStore(state => state.currentUser);
  const [packages, setPackages] = useState<DeliveryPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<DeliveryPackage | null>(null);
  const [packageRecords, setPackageRecords] = useState<any[]>([]);
  const [packageTasks, setPackageTasks] = useState<PackageTask[]>([]);
  const [packageDownloads, setPackageDownloads] = useState<PackageDownload[]>([]);
  const [packageVersions, setPackageVersions] = useState<PackageVersion[]>([]);
  const [auditLogs, setAuditLogs] = useState<PackageAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'records' | 'tasks' | 'downloads' | 'versions' | 'audit'>('records');
  const [message, setMessage] = useState<{type: 'success' | 'warning' | 'error', text: string} | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<'mine' | 'all'>('mine');

  const isSupervisor = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR';

  useEffect(() => {
    loadPackages();
  }, [filterStatus, historyFilter, currentOperator]);

  const loadPackages = async () => {
    try {
      const filters: any = {};
      if (filterStatus) filters.status = filterStatus;
      if (historyFilter === 'mine' && !isSupervisor) {
        filters.createdBy = currentOperator;
      }

      const data = await api.delivery.list(filters);
      setPackages(data);
    } catch (err) {
      console.error('Failed to load packages:', err);
    }
  };

  const loadPackageDetail = async (packageId: string) => {
    try {
      const [pkg, records, tasks, downloads, versions] = await Promise.all([
        api.delivery.getById(packageId),
        api.delivery.getRecords(packageId),
        api.delivery.getTasks(packageId),
        api.delivery.getDownloads(packageId),
        api.delivery.getVersions(packageId)
      ]);

      setSelectedPackage(pkg);
      setPackageRecords(records);
      setPackageTasks(tasks);
      setPackageDownloads(downloads);
      setPackageVersions(versions);
      setShowDetailModal(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '加载交付包详情失败' });
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await api.delivery.getAuditLogs(undefined, isSupervisor ? undefined : currentOperator);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  };

  const handleCreatePackage = async (name: string, description: string, filters?: any) => {
    setLoading(true);
    try {
      const result = await api.delivery.create(name, description, currentOperator, filters);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包创建成功' });
        setShowCreateModal(false);
        loadPackages();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '创建交付包失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePackage = async (packageId: string) => {
    setLoading(true);
    try {
      const result = await api.delivery.generate(packageId, currentOperator);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包生成成功' });
        loadPackages();
        if (selectedPackage?.id === packageId) {
          loadPackageDetail(packageId);
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '生成交付包失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPackage = async (packageId: string) => {
    try {
      const result = await api.delivery.download(packageId, currentOperator);
      if (result.success && result.downloadUrl) {
        const serverUrl = getApiServer();
        const link = document.createElement('a');
        link.href = `${serverUrl}${result.downloadUrl}`;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setMessage({ type: 'success', text: '下载成功' });
        loadPackageDetail(packageId);
        loadPackages();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '下载失败' });
    }
  };

  const handleCancelPackage = async (packageId: string, reason?: string) => {
    try {
      const result = await api.delivery.cancel(packageId, currentOperator, reason);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包已取消' });
        loadPackages();
        if (selectedPackage?.id === packageId) {
          loadPackageDetail(packageId);
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '取消失败' });
    }
  };

  const handleRebuildPackage = async (packageId: string) => {
    setLoading(true);
    try {
      const result = await api.delivery.rebuild(packageId, currentOperator);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包重建成功' });
        loadPackages();
        if (selectedPackage?.id === packageId) {
          loadPackageDetail(packageId);
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '重建失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePackage = async (packageId: string) => {
    if (!confirm('确定要删除这个交付包吗？')) return;

    try {
      const result = await api.delivery.delete(packageId, currentOperator);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包已删除' });
        setShowDetailModal(false);
        setSelectedPackage(null);
        loadPackages();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '删除失败' });
    }
  };

  const handleLockPackage = async (packageId: string) => {
    try {
      const result = await api.delivery.lock(packageId, currentOperator);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包已锁定' });
        loadPackageDetail(packageId);
        loadPackages();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '锁定失败' });
    }
  };

  const handleUnlockPackage = async (packageId: string) => {
    try {
      const result = await api.delivery.unlock(packageId, currentOperator);
      if (result.success) {
        setMessage({ type: 'success', text: '交付包已解锁' });
        loadPackageDetail(packageId);
        loadPackages();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '解锁失败' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-slate-500" />;
      case 'PROCESSING':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILED':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4 text-slate-400" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'PENDING': '待处理',
      'PROCESSING': '生成中',
      'COMPLETED': '已完成',
      'FAILED': '失败',
      'CANCELLED': '已取消'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-slate-100 text-slate-700';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'FAILED':
        return 'bg-red-100 text-red-700';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">离线交付包</h1>
          <p className="text-slate-500 mt-2">创建和管理离线交付包，异步生成可下载文件</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          新建交付包
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          message.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-600">状态筛选:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待处理</option>
              <option value="PROCESSING">生成中</option>
              <option value="COMPLETED">已完成</option>
              <option value="FAILED">失败</option>
              <option value="CANCELLED">已取消</option>
            </select>
          </div>

          {isSupervisor && (
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setHistoryFilter('mine')}
                className={`px-3 py-1 text-sm rounded ${
                  historyFilter === 'mine' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                我的交付包
              </button>
              <button
                onClick={() => setHistoryFilter('all')}
                className={`px-3 py-1 text-sm rounded ${
                  historyFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                全部交付包
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">交付包名称</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">编号</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">状态</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">记录数</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">创建人</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">创建时间</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {packages.length > 0 ? packages.map((pkg) => (
                <tr key={pkg.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-blue-500" />
                      <span className="font-medium text-slate-800">{pkg.packageName}</span>
                      {pkg.lockedBy && (
                        <Lock className="w-4 h-4 text-orange-500" title={`已被 ${pkg.lockedBy} 锁定`} />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{pkg.packageNo}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(pkg.status)}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(pkg.status)}`}>
                        {getStatusLabel(pkg.status)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{pkg.recordCount}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{pkg.createdBy}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {new Date(pkg.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadPackageDetail(pkg.id)}
                        className="p-1 text-slate-400 hover:text-blue-600"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {pkg.status === 'PENDING' && (
                        <button
                          onClick={() => handleGeneratePackage(pkg.id)}
                          disabled={loading || pkg.recordCount === 0}
                          className="p-1 text-slate-400 hover:text-green-600 disabled:opacity-50"
                          title={pkg.recordCount === 0 ? '请先添加记录' : '生成文件'}
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      )}

                      {pkg.status === 'COMPLETED' && (
                        <button
                          onClick={() => handleDownloadPackage(pkg.id)}
                          className="p-1 text-slate-400 hover:text-blue-600"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}

                      {(pkg.status === 'CANCELLED' || pkg.status === 'FAILED') && (
                        <button
                          onClick={() => handleRebuildPackage(pkg.id)}
                          disabled={loading}
                          className="p-1 text-slate-400 hover:text-orange-600"
                          title="重建"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}

                      {pkg.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancelPackage(pkg.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="取消"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}

                      {isSupervisor && (
                        <button
                          onClick={() => pkg.lockedBy ? handleUnlockPackage(pkg.id) : handleLockPackage(pkg.id)}
                          className="p-1 text-slate-400 hover:text-orange-600"
                          title={pkg.lockedBy ? '解锁' : '锁定'}
                        >
                          {pkg.lockedBy ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                      )}

                      {isSupervisor && (
                        <button
                          onClick={() => handleDeletePackage(pkg.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    暂无交付包数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreatePackageModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreatePackage}
          loading={loading}
        />
      )}

      {showDetailModal && selectedPackage && (
        <PackageDetailModal
          package={selectedPackage}
          records={packageRecords}
          tasks={packageTasks}
          downloads={packageDownloads}
          versions={packageVersions}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPackage(null);
          }}
          onGenerate={() => handleGeneratePackage(selectedPackage.id)}
          onDownload={() => handleDownloadPackage(selectedPackage.id)}
          onCancel={() => handleCancelPackage(selectedPackage.id)}
          onRebuild={() => handleRebuildPackage(selectedPackage.id)}
          onDelete={() => handleDeletePackage(selectedPackage.id)}
          onLock={() => handleLockPackage(selectedPackage.id)}
          onUnlock={() => handleUnlockPackage(selectedPackage.id)}
          onLoadAudit={() => loadAuditLogs()}
          auditLogs={auditLogs}
          isSupervisor={isSupervisor}
          currentOperator={currentOperator}
        />
      )}

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          交付包功能说明
        </h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li>• 交付包支持将筛选的记录打包成带清单的离线文件</li>
          <li>• 生成过程异步进行，可在任务列表查看进度和状态</li>
          <li>• 支持文件版本管理，重复提交不会覆盖历史记录</li>
          <li>• 完整的审计日志记录所有操作，支持权限隔离</li>
          <li>• 服务重启后任务状态和下载地址自动恢复</li>
        </ul>
      </div>
    </div>
  );
}

function CreatePackageModal({ onClose, onSubmit, loading }: {
  onClose: () => void;
  onSubmit: (name: string, description: string, filters?: any) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;

    const filters: any = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    onSubmit(name, description, Object.keys(filters).length > 0 ? filters : undefined);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-slate-800 mb-4">新建交付包</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">交付包名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入交付包名称"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入交付包描述（可选）"
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                开始日期
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                结束日期
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageDetailModal({ package: pkg, records, tasks, downloads, versions, activeTab, onTabChange, onClose, onGenerate, onDownload, onCancel, onRebuild, onDelete, onLock, onUnlock, onLoadAudit, auditLogs, isSupervisor, currentOperator }: {
  package: DeliveryPackage;
  records: any[];
  tasks: PackageTask[];
  downloads: PackageDownload[];
  versions: PackageVersion[];
  activeTab: 'records' | 'tasks' | 'downloads' | 'versions' | 'audit';
  onTabChange: (tab: 'records' | 'tasks' | 'downloads' | 'versions' | 'audit') => void;
  onClose: () => void;
  onGenerate: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onRebuild: () => void;
  onDelete: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onLoadAudit: () => void;
  auditLogs: PackageAuditLog[];
  isSupervisor: boolean;
  currentOperator: string;
}) {
  useEffect(() => {
    if (activeTab === 'audit') {
      onLoadAudit();
    }
  }, [activeTab]);

  const canModify = isSupervisor || pkg.createdBy === currentOperator;
  const isLocked = pkg.lockedBy && pkg.lockedBy !== currentOperator;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{pkg.packageName}</h2>
            <p className="text-sm text-slate-500">{pkg.packageNo} | 创建人: {pkg.createdBy}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            pkg.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
            pkg.status === 'FAILED' ? 'bg-red-100 text-red-700' :
            pkg.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' :
            'bg-blue-100 text-blue-700'
          }`}>
            {pkg.status === 'PENDING' ? '待处理' :
             pkg.status === 'PROCESSING' ? '生成中' :
             pkg.status === 'COMPLETED' ? '已完成' :
             pkg.status === 'FAILED' ? '失败' : '已取消'}
          </span>

          {pkg.lockedBy && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
              🔒 锁定中: {pkg.lockedBy}
            </span>
          )}

          <span className="ml-auto text-sm text-slate-500">
            记录数: {pkg.recordCount} | 版本: v{pkg.version}
          </span>
        </div>

        <div className="flex border-b border-slate-200 mb-4">
          <button
            onClick={() => onTabChange('records')}
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'records' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600'}`}
          >
            记录列表 ({records.length})
          </button>
          <button
            onClick={() => onTabChange('tasks')}
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'tasks' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600'}`}
          >
            任务日志 ({tasks.length})
          </button>
          <button
            onClick={() => onTabChange('downloads')}
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'downloads' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600'}`}
          >
            下载记录 ({downloads.length})
          </button>
          <button
            onClick={() => onTabChange('versions')}
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'versions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600'}`}
          >
            版本历史 ({versions.length})
          </button>
          {isSupervisor && (
            <button
              onClick={() => onTabChange('audit')}
              className={`px-4 py-2 text-sm font-medium ${activeTab === 'audit' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600'}`}
            >
              审计日志
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'records' && (
            <div className="space-y-2">
              {records.length > 0 ? records.map((record) => (
                <div key={record.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      类型: {record.recordType}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(record.includedAt).toLocaleString()}
                    </span>
                  </div>
                  {record.readingId && <p className="text-xs text-slate-500 mt-1">读数ID: {record.readingId}</p>}
                  {record.anomalyId && <p className="text-xs text-slate-500 mt-1">异常ID: {record.anomalyId}</p>}
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">暂无记录</div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-2">
              {tasks.length > 0 ? tasks.map((task) => (
                <div key={task.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{task.taskType}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        task.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        task.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(task.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {task.progress > 0 && (
                    <div className="mt-2">
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">进度: {task.progress}%</p>
                    </div>
                  )}
                  {task.errorMessage && (
                    <p className="text-xs text-red-600 mt-1">错误: {task.errorMessage}</p>
                  )}
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">暂无任务日志</div>
              )}
            </div>
          )}

          {activeTab === 'downloads' && (
            <div className="space-y-2">
              {downloads.length > 0 ? downloads.map((download) => (
                <div key={download.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      下载者: {download.downloadedBy}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(download.downloadedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    版本: {download.fileVersion} | 记录数: {download.recordCount}
                  </p>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">暂无下载记录</div>
              )}
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-2">
              {versions.length > 0 ? versions.map((version) => (
                <div key={version.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        v{version.version}
                      </span>
                      {version.isActive && (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                          当前版本
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    创建人: {version.createdBy} | 记录数: {version.recordCount}
                  </p>
                  {version.changeSummary && (
                    <p className="text-xs text-slate-600 mt-1">{version.changeSummary}</p>
                  )}
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">暂无版本历史</div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length > 0 ? auditLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                        {log.operation}
                      </span>
                      <span className="text-sm font-medium text-slate-700">
                        {log.operator}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {log.details && (
                    <p className="text-xs text-slate-500 mt-1">详情: {log.details}</p>
                  )}
                  {log.result && (
                    <p className={`text-xs mt-1 ${log.result === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`}>
                      结果: {log.result}
                    </p>
                  )}
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">暂无审计日志</div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
          {pkg.status === 'PENDING' && canModify && !isLocked && (
            <>
              <button
                onClick={onGenerate}
                disabled={pkg.recordCount === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                生成文件
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-red-600 hover:text-red-800"
              >
                取消
              </button>
            </>
          )}

          {pkg.status === 'COMPLETED' && (
            <button
              onClick={onDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              下载
            </button>
          )}

          {(pkg.status === 'CANCELLED' || pkg.status === 'FAILED') && canModify && (
            <button
              onClick={onRebuild}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              重建
            </button>
          )}

          {canModify && !isLocked && (
            <button
              onClick={pkg.lockedBy ? onUnlock : onLock}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
            >
              {pkg.lockedBy ? '解锁' : '锁定'}
            </button>
          )}

          {isSupervisor && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-red-600 hover:text-red-800"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
