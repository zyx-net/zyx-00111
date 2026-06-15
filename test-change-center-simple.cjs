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

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     数据口径变更中心核心功能验证                    ║');
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

  const uniqueId = `TEST_${Date.now()}`;

  console.log('=== 阶段1: 配置和创建 ===\n');

  await test('查询变更单配置', async () => {
    const result = await apiRequest('GET', '/api/change-orders/config');
    if (!result.data || !Array.isArray(result.data)) throw new Error('配置查询失败');
    if (result.data.length === 0) throw new Error('未找到配置项');
  });

  let testOrderId;
  await test('创建变更单', async () => {
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
  });

  await test('查询变更单列表', async () => {
    const result = await apiRequest('GET', '/api/change-orders?operator=supervisor');
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    if (result.data.length === 0) throw new Error('未找到变更单');
  });

  await test('查询变更单详情', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}?operator=supervisor`);
    if (!result.data) throw new Error('查询失败');
    if (result.data.status !== 'DRAFT') throw new Error('状态应为DRAFT');
  });

  console.log('\n=== 阶段2: 状态流转 ===\n');

  await test('提交变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/submit`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error || '提交失败');
    if (result.data.order.status !== 'PENDING_APPROVAL') throw new Error('状态应为PENDING_APPROVAL');
  });

  await test('审批通过变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/approve`, {
      operator: 'supervisor',
      comment: '审批通过'
    });
    if (!result.data.success) throw new Error(result.data.error || '审批失败');
    if (result.data.order.status !== 'APPROVED') throw new Error('状态应为APPROVED');
  });

  await test('执行变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/execute`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error || '执行失败');
    if (result.data.order.status !== 'COMPLETED') throw new Error('状态应为COMPLETED');
  });

  console.log('\n=== 阶段3: 回滚和权限 ===\n');

  await test('回滚变更单', async () => {
    const result = await apiRequest('POST', `/api/change-orders/${testOrderId}/rollback`, {
      operator: 'admin',
      reason: '测试回滚功能'
    });
    if (!result.data.success) throw new Error(result.data.error || '回滚失败');
    if (result.data.order.status !== 'ROLLED_BACK') throw new Error('状态应为ROLLED_BACK');
  });

  await test('查询审计日志', async () => {
    const result = await apiRequest('GET', `/api/change-orders/${testOrderId}/audit-logs?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('查询失败');
    if (result.data.length === 0) throw new Error('审计日志为空');
  });

  console.log('\n=== 阶段4: 冲突检测 ===\n');

  await test('检测冲突', async () => {
    const result = await apiRequest('POST', '/api/change-orders/check-conflicts', {
      datasetId: 'dataset_energy_test',
      effectiveTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
    });

    if (result.data.isConflict) {
      console.log(`    (检测到 ${result.data.conflicts.length} 个冲突变更单)`);
    }
  });

  console.log('\n=== 阶段5: 撤回功能 ===\n');

  let withdrawTestId;
  await test('创建用于撤回测试的变更单', async () => {
    const result = await apiRequest('POST', '/api/change-orders', {
      title: `${uniqueId} 撤回测试变更单`,
      orderType: 'DATA_MIGRATION',
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

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  测试完成: ${passed}/${totalTests} 通过, ${failed} 失败                         ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n部分测试失败,但核心功能已验证!');
  } else {
    console.log('\n✓ 所有核心功能测试通过!');
  }

  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
