const http = require('http');

const API_BASE = 'http://localhost:3001';

function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ data: json, status: res.statusCode });
        } catch {
          resolve({ data: body, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanupOrders(operator) {
  try {
    const orders = await apiRequest('GET', `/api/change-orders?operator=${operator}`);
    if (orders.data && Array.isArray(orders.data)) {
      for (const order of orders.data) {
        try {
          await apiRequest('DELETE', `/api/change-orders/${order.id}`, { operator: 'admin' });
        } catch {}
      }
    }
  } catch {}
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     数据口径变更中心完整功能回归测试                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  let totalTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
      return true;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    错误: ${err.message}`);
      failed++;
      return false;
    }
  }

  console.log('=== 阶段1: 环境准备 ===\n');

  await cleanupOrders('admin');
  console.log('    (环境已清理)\n');

  console.log('=== 阶段2: 基础功能测试 ===\n');

  const uniqueId = `TEST_${Date.now()}`;
  let testOrderId;

  await test('查询变更单配置', async () => {
    const result = await apiRequest('GET', '/api/change-orders/config');
    if (!result.data || !Array.isArray(result.data)) throw new Error('配置查询失败');
    if (result.data.length === 0) throw new Error('未找到配置项');
    
    const approvalRoles = result.data.find(c => c.configKey === 'approval_roles');
    if (!approvalRoles) throw new Error('未找到审批角色配置');
    if (approvalRoles.configValue !== 'ADMIN,SUPERVISOR') throw new Error('审批角色配置不正确');
  });

  await test('创建变更单（业务人员）', async () => {
    const result = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 数据口径变更测试`,
      description: '用于测试变更中心功能',
      orderType: 'SCHEMA_CHANGE',
      datasetId: 'dataset_energy_test',
      datasetName: '能源计量数据集测试',
      fieldChanges: [
        {
          fieldName: 'meter_id',
          fieldLabel: '表计编号',
          previousValue: 'VARCHAR(50)',
          newValue: 'VARCHAR(100)',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor',
      priority: 'NORMAL',
      rollbackDescription: '如有问题可回滚至变更前状态'
    });

    if (!result.data.success) throw new Error(result.data.error || '创建失败');
    if (!result.data.order?.id) throw new Error('未返回变更单ID');
    
    testOrderId = result.data.order.id;
    if (result.data.order.status !== 'DRAFT') throw new Error('初始状态应为DRAFT');
    if (result.data.order.createdBy !== 'supervisor') throw new Error('创建人不正确');
  });

  await test('查询变更单列表', async () => {
    const result = await apiRequest('GET', '/api/change-orders?operator=supervisor');
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    if (result.data.length === 0) throw new Error('未找到变更单');
    
    const myOrder = result.data.find(o => o.id === testOrderId);
    if (!myOrder) throw new Error('未找到刚创建的变更单');
  });

  await test('查询变更单详情', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}?operator=supervisor`);
    if (!result.data) throw new Error('查询失败');
    if (result.data.orderNo !== result.data.orderNo) throw new Error('变更单号不正确');
    if (result.data.status !== 'DRAFT') throw new Error('状态应为DRAFT');
  });

  console.log('\n=== 阶段3: 状态流转测试 ===\n');

  await test('提交变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/submit`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error || '提交失败');
    if (result.data.order.status !== 'PENDING_APPROVAL') throw new Error('状态应为PENDING_APPROVAL');
  });

  await test('审批通过变更单（主管）', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/approve`, {
      operator: 'supervisor',
      comment: '审批通过，同意执行'
    });
    if (!result.data.success) throw new Error(result.data.error || '审批失败');
    if (result.data.order.status !== 'APPROVED') throw new Error('状态应为APPROVED');
    if (result.data.order.approver !== 'supervisor') throw new Error('审批人不正确');
  });

  await test('执行变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/execute`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error || '执行失败');
    if (result.data.order.status !== 'COMPLETED') throw new Error('状态应为COMPLETED');
  });

  await test('回滚变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/rollback`, {
      operator: 'admin',
      reason: '测试回滚功能'
    });
    if (!result.data.success) throw new Error(result.data.error || '回滚失败');
    if (result.data.order.status !== 'ROLLED_BACK') throw new Error('状态应为ROLLED_BACK');
  });

  console.log('\n=== 阶段4: 权限隔离测试 ===\n');

  let testOrderId2;
  await test('创建变更单（复核员1）', async () => {
    const result = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 复核员变更单`,
      description: '测试权限隔离',
      orderType: 'DATA_MIGRATION',
      datasetId: 'dataset_water_test',
      datasetName: '水表数据集测试',
      fieldChanges: [
        {
          fieldName: 'reading_value',
          fieldLabel: '读数值',
          previousValue: 'DECIMAL(10,2)',
          newValue: 'DECIMAL(12,4)',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      createdBy: 'reviewer_1',
      priority: 'LOW'
    });

    if (!result.data.success) throw new Error(result.data.error || '创建失败');
    testOrderId2 = result.data.order.id;
  });

  await test('复核员查看自己的变更单', async () => {
    const result = await apiRequest('GET', `/api/change-orders?operator=reviewer_1`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    
    const ownOrder = result.data.find(o => o.id === testOrderId2);
    if (!ownOrder) throw new Error('未找到自己的变更单');
  });

  await test('复核员不能查看主管的变更单', async () => {
    const result = await apiRequest('GET', `/api/change-orders?operator=reviewer_1`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    
    const otherOrder = result.data.find(o => o.id === testOrderId);
    if (otherOrder) throw new Error('复核员不应能看到主管的变更单');
  });

  await test('复核员提交自己的变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId2}/submit`, {
      operator: 'reviewer_1'
    });
    if (!result.data.success) throw new Error(result.data.error || '提交失败');
  });

  await test('主管审批复核员的变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId2}/approve`, {
      operator: 'supervisor',
      comment: '审批通过'
    });
    if (!result.data.success) throw new Error(result.data.error || '审批失败');
  });

  await test('主管驳回复核员的变更单', async () => {
    const result2 = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 待驳回变更单`,
      orderType: 'CALCULATION_RULE',
      datasetId: 'dataset_gas_test',
      datasetName: '气表数据集测试',
      fieldChanges: [
        {
          fieldName: 'calculation_formula',
          fieldLabel: '计算公式',
          previousValue: 'value * 1.1',
          newValue: 'value * 1.05',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      createdBy: 'reviewer_1'
    });

    if (!result2.data.success) throw new Error(result2.data.error || '创建失败');
    const orderId = result2.data.order.id;

    await apiRequest('POST', `/api/change-orders/${orderId}/submit`, {
      operator: 'reviewer_1'
    });

    const result = await apiRequest('POST', `/api/change-orders/${orderId}/reject`, {
      operator: 'supervisor',
      comment: '计算公式调整过大，需要重新评估'
    });
    if (!result.data.success) throw new Error(result.data.error || '驳回失败');
    if (result.data.order.status !== 'REJECTED') throw new Error('状态应为REJECTED');
  });

  console.log('\n=== 阶段5: 冲突检测测试 ===\n');

  let conflictOrderId1;
  let conflictOrderId2;

  await test('创建第一个冲突检测变更单', async () => {
    const result = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 冲突检测变更单1`,
      orderType: 'FIELD_MAPPING',
      datasetId: 'dataset_conflict_test',
      datasetName: '冲突测试数据集',
      fieldChanges: [
        {
          fieldName: 'field_a',
          fieldLabel: '字段A',
          previousValue: '映射规则1',
          newValue: '映射规则2',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor'
    });

    if (!result.data.success) throw new Error(result.data.error || '创建失败');
    conflictOrderId1 = result.data.order.id;
  });

  await test('检测冲突（第二个变更单）', async () => {
    const result = await apiRequest('POST', '/api/change-orders/check-conflicts', {
      datasetId: 'dataset_conflict_test',
      effectiveTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });

    if (!result.data.isConflict) throw new Error('应该检测到冲突');
    if (result.data.conflicts.length === 0) throw new Error('应该有冲突变更单');
  });

  await test('提交第一个变更单（模拟冲突场景）', async () => {
    await apiRequest('POST', `/api/change-orders/${conflictOrderId1}/submit`, {
      operator: 'supervisor'
    });
    await apiRequest('POST', `/api/change-orders/${conflictOrderId1}/approve`, {
      operator: 'supervisor'
    });
  });

  console.log('\n=== 阶段6: 撤回功能测试 ===\n');

  let withdrawTestId;
  await test('创建用于撤回测试的变更单', async () => {
    const result = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 撤回测试变更单`,
      orderType: 'SCHEMA_CHANGE',
      datasetId: 'dataset_withdraw_test',
      datasetName: '撤回测试数据集',
      fieldChanges: [
        {
          fieldName: 'test_field',
          fieldLabel: '测试字段',
          previousValue: '',
          newValue: '测试数据',
          changeType: 'ADD'
        }
      ],
      effectiveTime: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor'
    });

    if (!result.data.success) throw new Error(result.data.error || '创建失败');
    withdrawTestId = result.data.order.id;
  });

  await test('撤回草稿状态的变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${withdrawTestId}/withdraw`, {
      operator: 'supervisor',
      reason: '测试撤回功能'
    });
    if (!result.data.success) throw new Error(result.data.error || '撤回失败');
    if (result.data.order.status !== 'WITHDRAWN') throw new Error('状态应为WITHDRAWN');
  });

  console.log('\n=== 阶段7: 审计日志测试 ===\n');

  await test('查询变更单审计日志', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}/audit-logs?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    if (result.data.length === 0) throw new Error('审计日志为空');

    const operations = result.data.map(l => l.operation);
    if (!operations.includes('CREATE')) throw new Error('缺少创建操作');
    if (!operations.includes('SUBMIT')) throw new Error('缺少提交操作');
    if (!operations.includes('APPROVE')) throw new Error('缺少审批操作');
    if (!operations.includes('EXECUTE')) throw new Error('缺少执行操作');
    if (!operations.includes('ROLLBACK')) throw new Error('缺少回滚操作');
  });

  await test('复核员不能查看审计日志', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}/audit-logs?operator=reviewer_1`);
    if (result.status !== 403) throw new Error('复核员不应能查看审计日志');
  });

  console.log('\n=== 阶段8: 版本历史测试 ===\n');

  await test('查询变更单版本历史', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}/versions?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
  });

  console.log('\n=== 阶段9: 导出摘要测试 ===\n');

  await test('导出变更单摘要', async () => {
    const result = await apiRequest('POST', '/api/change-orders/export-summary', {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error || '导出失败');
    if (!result.data.filePath) throw new Error('未返回文件路径');
    if (!result.data.orderCount) throw new Error('未返回订单数量');
  });

  await test('复核员不能导出摘要', async () => {
    const result = await apiRequest('POST', '/api/change-orders/export-summary', {
      operator: 'reviewer_1'
    });
    if (result.status !== 403) throw new Error('复核员不应能导出摘要');
  });

  console.log('\n=== 阶段10: 重启恢复测试 ===\n');

  await test('手动触发重启恢复', async () => {
    const result = await apiRequest('GET', `/api/change-orders/system/recovery?operator=admin`);
    if (!result.data.success) throw new Error('恢复接口调用失败');
    console.log(`    (已处理 ${result.data.totalRecovered} 个中断任务)`);
  });

  await test('查询待执行变更单', async () => {
    const futureDate = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString();
    
    await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 待执行变更单`,
      orderType: 'SCHEMA_CHANGE',
      datasetId: 'dataset_pending_test',
      datasetName: '待执行测试数据集',
      fieldChanges: [
        {
          fieldName: 'pending_field',
          fieldLabel: '待执行字段',
          previousValue: 'OLD',
          newValue: 'NEW',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: futureDate,
      createdBy: 'supervisor'
    });

    const pendingOrders = await apiRequest('GET', `/api/change-orders/pending-execution?operator=supervisor`);
    if (!pendingOrders.data || !Array.isArray(pendingOrders.data)) throw new Error('查询失败');
  });

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  测试完成: ${passed}/${totalTests} 通过, ${failed} 失败                              ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n失败的测试将需要人工检查或修复。');
  } else {
    console.log('\n✓ 所有测试通过！');
  }

  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
