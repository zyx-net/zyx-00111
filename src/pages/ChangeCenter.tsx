import { useState, useEffect } from 'react';

interface FieldChange {
  fieldName: string;
  fieldLabel: string;
  previousValue: string;
  newValue: string;
  changeType: 'ADD' | 'MODIFY' | 'DELETE';
}

interface ChangeOrder {
  id: string;
  orderNo: string;
  title: string;
  description?: string;
  orderType: string;
  status: string;
  priority: string;
  datasetId: string;
  datasetName: string;
  fieldChanges: string;
  effectiveTime: string;
  approvalRole: string;
  approver?: string;
  approvedAt?: string;
  approvalComment?: string;
  rollbackDescription?: string;
  createdBy: string;
  createdAt: string;
  submittedAt?: string;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executedBy?: string;
  version: number;
}

interface AuditLog {
  id: string;
  orderId: string;
  operation: string;
  operator: string;
  details?: string;
  result: string;
  createdAt: string;
}

const API_BASE = 'http://localhost:3001/api';

export function ChangeCenter() {
  const [currentUser, setCurrentUser] = useState('supervisor');
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrder | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);

  const [newOrder, setNewOrder] = useState({
    title: '',
    description: '',
    orderType: 'SCHEMA_CHANGE',
    datasetId: '',
    datasetName: '',
    priority: 'NORMAL',
    effectiveTime: '',
    rollbackDescription: '',
    fieldChanges: [] as FieldChange[]
  });

  const [approvalComment, setApprovalComment] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ operator: currentUser });
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`${API_BASE}/change-orders?${params}`);
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async (orderId: string) => {
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/audit-logs?operator=${currentUser}`);
      const data = await response.json();
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadConflicts = async (orderId: string) => {
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/conflicts?operator=${currentUser}`);
      const data = await response.json();
      setConflicts(Array.isArray(data) ? data : []);
      setShowConflicts(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const checkConflicts = async () => {
    if (!newOrder.datasetId || !newOrder.effectiveTime) return;

    try {
      const response = await fetch(`${API_BASE}/change-orders/check-conflicts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: newOrder.datasetId,
          effectiveTime: newOrder.effectiveTime
        })
      });
      const result = await response.json();
      if (result.isConflict) {
        alert(`冲突检测: ${result.message}\n涉及变更单: ${result.conflicts.map((c: any) => c.orderNo).join(', ')}`);
      } else {
        alert('无冲突检测');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.title || !newOrder.datasetId || !newOrder.effectiveTime) {
      alert('请填写必要的字段');
      return;
    }

    if (newOrder.fieldChanges.length === 0) {
      alert('请至少添加一个字段变更');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newOrder,
          createdBy: currentUser
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('变更单创建成功');
        setShowCreateForm(false);
        setNewOrder({
          title: '',
          description: '',
          orderType: 'SCHEMA_CHANGE',
          datasetId: '',
          datasetName: '',
          priority: 'NORMAL',
          effectiveTime: '',
          rollbackDescription: '',
          fieldChanges: []
        });
        loadOrders();
      } else {
        alert(result.error || '创建失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitOrder = async (orderId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已提交');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '提交失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser,
          comment: approvalComment
        })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已审批通过');
        setApprovalComment('');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '审批失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    if (!approvalComment) {
      alert('请填写驳回原因');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser,
          comment: approvalComment
        })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已驳回');
        setApprovalComment('');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '驳回失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteOrder = async (orderId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: currentUser })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已执行');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '执行失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawOrder = async (orderId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser,
          reason: withdrawReason
        })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已撤回');
        setWithdrawReason('');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '撤回失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRollbackOrder = async (orderId: string) => {
    if (!rollbackReason) {
      alert('请填写回滚原因');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser,
          reason: rollbackReason
        })
      });
      const result = await response.json();
      if (result.success) {
        alert('变更单已回滚');
        setRollbackReason('');
        loadOrders();
        if (selectedOrder) loadOrderDetail(selectedOrder.id);
      } else {
        alert(result.error || '回滚失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrderDetail = async (orderId: string) => {
    try {
      const response = await fetch(`${API_BASE}/change-orders/${orderId}?operator=${currentUser}`);
      const data = await response.json();
      setSelectedOrder(data);
      loadAuditLogs(orderId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addFieldChange = () => {
    setNewOrder({
      ...newOrder,
      fieldChanges: [
        ...newOrder.fieldChanges,
        {
          fieldName: '',
          fieldLabel: '',
          previousValue: '',
          newValue: '',
          changeType: 'MODIFY'
        }
      ]
    });
  };

  const updateFieldChange = (index: number, field: keyof FieldChange, value: string) => {
    const changes = [...newOrder.fieldChanges];
    (changes[index] as any)[field] = value;
    setNewOrder({ ...newOrder, fieldChanges: changes });
  };

  const removeFieldChange = (index: number) => {
    const changes = newOrder.fieldChanges.filter((_, i) => i !== index);
    setNewOrder({ ...newOrder, fieldChanges: changes });
  };

  const getStatusBadgeClass = (status: string) => {
    const classes: { [key: string]: string } = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      PENDING_EXECUTION: 'bg-orange-100 text-orange-800',
      EXECUTING: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      WITHDRAWN: 'bg-gray-100 text-gray-800',
      ROLLED_BACK: 'bg-red-100 text-red-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityBadgeClass = (priority: string) => {
    const classes: { [key: string]: string } = {
      LOW: 'bg-gray-100 text-gray-600',
      NORMAL: 'bg-blue-100 text-blue-600',
      HIGH: 'bg-orange-100 text-orange-600',
      URGENT: 'bg-red-100 text-red-600'
    };
    return classes[priority] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">数据口径变更中心</h1>
            <p className="mt-1 text-sm text-gray-500">管理和追踪数据口径变更的全生命周期</p>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="admin">管理员 (admin)</option>
              <option value="supervisor">主管 (supervisor)</option>
              <option value="reviewer_1">复核员1 (reviewer_1)</option>
            </select>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              创建变更单
            </button>
            <button
              onClick={() => loadOrders()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              刷新
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-4 flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">状态筛选:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">全部</option>
                <option value="DRAFT">草稿</option>
                <option value="PENDING_APPROVAL">待审批</option>
                <option value="APPROVED">已审批</option>
                <option value="PENDING_EXECUTION">待执行</option>
                <option value="EXECUTING">执行中</option>
                <option value="COMPLETED">已完成</option>
                <option value="REJECTED">已驳回</option>
                <option value="WITHDRAWN">已撤回</option>
                <option value="ROLLED_BACK">已回滚</option>
              </select>
            </div>

            {isLoading ? (
              <div className="text-center py-8">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无变更单</div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => loadOrderDetail(order.id)}
                    className={`p-4 border rounded-lg cursor-pointer transition ${
                      selectedOrder?.id === order.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-gray-900">{order.title}</span>
                        <span className="ml-2 text-sm text-gray-500">{order.orderNo}</span>
                      </div>
                      <div className="flex space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${getPriorityBadgeClass(order.priority)}`}>
                          {order.priority}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span>数据集: {order.datasetName}</span>
                      <span className="mx-2">|</span>
                      <span>生效时间: {new Date(order.effectiveTime).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      创建人: {order.createdBy} | 创建时间: {new Date(order.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            {selectedOrder ? (
              <div>
                <div className="mb-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">变更单详情</h2>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">变更单号</label>
                    <div className="text-gray-900">{selectedOrder.orderNo}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                    <div className="text-gray-900">{selectedOrder.title}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                    <div className="text-gray-900">{selectedOrder.description || '-'}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(selectedOrder.status)}`}>
                        {selectedOrder.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                      <span className={`px-2 py-1 text-xs rounded-full ${getPriorityBadgeClass(selectedOrder.priority)}`}>
                        {selectedOrder.priority}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">数据集</label>
                    <div className="text-gray-900">{selectedOrder.datasetName}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">变更类型</label>
                    <div className="text-gray-900">{selectedOrder.orderType}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">生效时间</label>
                    <div className="text-gray-900">{new Date(selectedOrder.effectiveTime).toLocaleString()}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">字段变更</label>
                    <div className="border rounded-lg p-3">
                      {JSON.parse(selectedOrder.fieldChanges).map((change: FieldChange, index: number) => (
                        <div key={index} className="text-sm mb-2 last:mb-0">
                          <div className="font-medium">{change.fieldLabel} ({change.fieldName})</div>
                          <div className="text-gray-600">
                            {change.changeType}: {change.previousValue} → {change.newValue}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedOrder.rollbackDescription && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">回滚说明</label>
                      <div className="text-gray-900">{selectedOrder.rollbackDescription}</div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">操作</h3>
                    <div className="space-y-3">
                      {selectedOrder.status === 'DRAFT' && (
                        <button
                          onClick={() => handleSubmitOrder(selectedOrder.id)}
                          disabled={isLoading}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          提交变更单
                        </button>
                      )}

                      {selectedOrder.status === 'PENDING_APPROVAL' && (
                        <>
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">审批意见</label>
                            <textarea
                              value={approvalComment}
                              onChange={(e) => setApprovalComment(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              rows={3}
                              placeholder="请输入审批意见"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => handleApproveOrder(selectedOrder.id)}
                              disabled={isLoading}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              批准
                            </button>
                            <button
                              onClick={() => handleRejectOrder(selectedOrder.id)}
                              disabled={isLoading}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              驳回
                            </button>
                          </div>
                        </>
                      )}

                      {(selectedOrder.status === 'APPROVED' || selectedOrder.status === 'PENDING_EXECUTION') && (
                        <button
                          onClick={() => handleExecuteOrder(selectedOrder.id)}
                          disabled={isLoading}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                        >
                          执行变更单
                        </button>
                      )}

                      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PENDING_EXECUTION'].includes(selectedOrder.status) && (
                        <>
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">撤回原因</label>
                            <textarea
                              value={withdrawReason}
                              onChange={(e) => setWithdrawReason(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              rows={2}
                              placeholder="请输入撤回原因（可选）"
                            />
                          </div>
                          <button
                            onClick={() => handleWithdrawOrder(selectedOrder.id)}
                            disabled={isLoading}
                            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                          >
                            撤回变更单
                          </button>
                        </>
                      )}

                      {selectedOrder.status === 'COMPLETED' && (
                        <>
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">回滚原因</label>
                            <textarea
                              value={rollbackReason}
                              onChange={(e) => setRollbackReason(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              rows={3}
                              placeholder="请输入回滚原因（必填）"
                            />
                          </div>
                          <button
                            onClick={() => handleRollbackOrder(selectedOrder.id)}
                            disabled={isLoading || !rollbackReason}
                            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            回滚变更单
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => loadConflicts(selectedOrder.id)}
                        className="w-full px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                      >
                        查看冲突
                      </button>
                    </div>
                  </div>

                  {showConflicts && conflicts.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">冲突变更单</h3>
                      <div className="space-y-2">
                        {conflicts.map((conflict, index) => (
                          <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="font-medium text-yellow-900">{conflict.title}</div>
                            <div className="text-sm text-yellow-700">
                              变更单号: {conflict.orderNo} | 状态: {conflict.status}
                            </div>
                            <div className="text-sm text-yellow-700">
                              生效时间: {new Date(conflict.effectiveTime).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">审计日志</h3>
                    {auditLogs.length === 0 ? (
                      <div className="text-sm text-gray-500">暂无审计日志</div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-medium text-gray-900">{log.operation}</span>
                                <span className="ml-2 text-gray-600">by {log.operator}</span>
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(log.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {log.details && (
                              <div className="text-xs text-gray-500 mt-1">{log.details}</div>
                            )}
                            <div className="text-xs">
                              <span className={`px-1 py-0.5 rounded ${
                                log.result === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {log.result}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                请选择一个变更单查看详情
              </div>
            )}
          </div>
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto m-4">
              <div className="mb-4 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">创建变更单</h2>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
                  <input
                    type="text"
                    value={newOrder.title}
                    onChange={(e) => setNewOrder({ ...newOrder, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="请输入变更单标题"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={newOrder.description}
                    onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="请输入变更单描述"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">变更类型 *</label>
                    <select
                      value={newOrder.orderType}
                      onChange={(e) => setNewOrder({ ...newOrder, orderType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="SCHEMA_CHANGE">Schema变更</option>
                      <option value="DATA_MIGRATION">数据迁移</option>
                      <option value="CALCULATION_RULE">计算规则变更</option>
                      <option value="FIELD_MAPPING">字段映射变更</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                    <select
                      value={newOrder.priority}
                      onChange={(e) => setNewOrder({ ...newOrder, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="LOW">低</option>
                      <option value="NORMAL">普通</option>
                      <option value="HIGH">高</option>
                      <option value="URGENT">紧急</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">数据集ID *</label>
                    <input
                      type="text"
                      value={newOrder.datasetId}
                      onChange={(e) => setNewOrder({ ...newOrder, datasetId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如: dataset_energy"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">数据集名称 *</label>
                    <input
                      type="text"
                      value={newOrder.datasetName}
                      onChange={(e) => setNewOrder({ ...newOrder, datasetName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如: 能源计量数据集"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">生效时间 *</label>
                  <input
                    type="datetime-local"
                    value={newOrder.effectiveTime}
                    onChange={(e) => setNewOrder({ ...newOrder, effectiveTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={checkConflicts}
                    className="mt-2 px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                  >
                    检测冲突
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">字段变更 *</label>
                  <button
                    onClick={addFieldChange}
                    className="mb-2 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                  >
                    + 添加字段
                  </button>

                  <div className="space-y-3">
                    {newOrder.fieldChanges.map((change, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-lg">
                        <div className="grid grid-cols-5 gap-2 mb-2">
                          <input
                            type="text"
                            value={change.fieldName}
                            onChange={(e) => updateFieldChange(index, 'fieldName', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="字段名"
                          />
                          <input
                            type="text"
                            value={change.fieldLabel}
                            onChange={(e) => updateFieldChange(index, 'fieldLabel', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="字段标签"
                          />
                          <select
                            value={change.changeType}
                            onChange={(e) => updateFieldChange(index, 'changeType', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="ADD">新增</option>
                            <option value="MODIFY">修改</option>
                            <option value="DELETE">删除</option>
                          </select>
                          <input
                            type="text"
                            value={change.previousValue}
                            onChange={(e) => updateFieldChange(index, 'previousValue', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="原值"
                          />
                          <input
                            type="text"
                            value={change.newValue}
                            onChange={(e) => updateFieldChange(index, 'newValue', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="新值"
                          />
                        </div>
                        <button
                          onClick={() => removeFieldChange(index)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">回滚说明</label>
                  <textarea
                    value={newOrder.rollbackDescription}
                    onChange={(e) => setNewOrder({ ...newOrder, rollbackDescription: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="请描述如何回滚此变更"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateOrder}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
