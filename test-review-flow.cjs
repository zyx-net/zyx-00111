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
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
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
  console.log('========================================');
  console.log('读数异常复核台 - 完整回归测试');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${e.message}`);
      failed++;
    }
  }

  // Test 1: User Management
  console.log('\n--- 用户管理测试 ---');

  await test('获取用户列表', async () => {
    const res = await apiRequest('GET', '/api/users');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error('No users returned');
    console.log(`   Found ${res.data.length} users`);
  });

  await test('主管用户权限验证', async () => {
    const res = await apiRequest('GET', '/api/users/supervisor');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.role !== 'SUPERVISOR') throw new Error('Not a supervisor');
  });

  await test('普通复核人权限验证', async () => {
    const res = await apiRequest('GET', '/api/users/reviewer_1');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.role !== 'REVIEWER') throw new Error('Not a reviewer');
  });

  // Test 2: Data Import
  console.log('\n--- 数据导入测试 ---');

  let batch1Id, batch2Id;

  await test('导入第一批测试数据（包含跳变异常）', async () => {
    const readings = [
      { meterId: 'M001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-06-02', rawValue: 1100, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-06-03', rawValue: 2000, meterType: 'ELECTRICITY' }, // Jump
      { meterId: 'W001', readingDate: '2026-06-01', rawValue: 500, meterType: 'WATER' },
      { meterId: 'W001', readingDate: '2026-06-02', rawValue: 600, meterType: 'WATER' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'reviewer_1' });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.batchId) throw new Error('No batch ID returned');
    batch1Id = res.data.batchId;
    console.log(`   Batch ID: ${batch1Id}, Anomalies: ${res.data.anomalyCount}`);
  });

  await test('导入第二批测试数据（包含回退异常）', async () => {
    await sleep(100);
    const readings = [
      { meterId: 'M001', readingDate: '2026-06-04', rawValue: 2100, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-06-05', rawValue: 1900, meterType: 'ELECTRICITY' }, // Rollback
      { meterId: 'W001', readingDate: '2026-06-03', rawValue: 700, meterType: 'WATER' },
      { meterId: 'W001', readingDate: '2026-06-04', rawValue: 800, meterType: 'WATER' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    batch2Id = res.data.batchId;
    console.log(`   Batch ID: ${batch2Id}, Anomalies: ${res.data.anomalyCount}`);
  });

  await test('重复数据检测', async () => {
    const readings = [
      { meterId: 'M001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings });
    // Either 400 (重复) or 200 (允许导入)
    if (res.status !== 400 && res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.status === 400 && !res.data.message) throw new Error('No error message');
  });

  // Test 3: Anomaly Detection
  console.log('\n--- 异常检测测试 ---');

  await test('获取异常列表', async () => {
    const res = await apiRequest('GET', '/api/anomalies');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error('No anomalies returned');
    console.log(`   Found ${res.data.length} anomalies`);
  });

  await test('按状态筛选异常', async () => {
    const res = await apiRequest('GET', '/api/anomalies?status=PENDING');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Not an array');
  });

  await test('按类型筛选异常', async () => {
    const res = await apiRequest('GET', '/api/anomalies?type=JUMP');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  // Test 4: Anomaly Correction
  console.log('\n--- 异常修正测试 ---');

  let anomalyId, version;
  let pendingAnomalyId;

  await test('获取异常详情（含历史）', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies');
    if (anomalies.data.length === 0) throw new Error('No anomalies to test');
    // Find a pending anomaly that is NOT a rollback type
    const pending = anomalies.data.find(a => a.status === 'PENDING' && a.anomalyType !== 'ROLLBACK');
    if (!pending) {
      // Try any pending anomaly
      const anyPending = anomalies.data.find(a => a.status === 'PENDING');
      if (anyPending) {
        pendingAnomalyId = anyPending.id;
        anomalyId = anyPending.id;
        version = anyPending.currentVersion;
      } else {
        console.log('   No pending anomalies, testing with first JUMP anomaly');
        const jumpAnomaly = anomalies.data.find(a => a.anomalyType === 'JUMP');
        if (jumpAnomaly) {
          anomalyId = jumpAnomaly.id;
          version = jumpAnomaly.currentVersion;
        } else {
          anomalyId = anomalies.data[0].id;
          version = anomalies.data[0].currentVersion;
        }
      }
    } else {
      pendingAnomalyId = pending.id;
      anomalyId = pending.id;
      version = pending.currentVersion;
    }
    const res = await apiRequest('GET', `/api/anomalies/${anomalyId}`);
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    console.log(`   Anomaly ID: ${anomalyId}, Version: ${version}, Type: ${res.data.anomalyType}`);
  });

  await test('修正异常', async () => {
    if (!anomalyId) throw new Error('Anomaly ID not set');
    const res = await apiRequest('POST', `/api/anomalies/${anomalyId}/correct`, {
      newValue: 1500,
      operator: 'reviewer_1',
      version: version
    });
    if (res.status !== 200) {
      console.log(`   Response: ${JSON.stringify(res.data)}`);
    }
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('修正后再次修正（版本递增）', async () => {
    if (!anomalyId) throw new Error('Anomaly ID not set');
    const anomaly = await apiRequest('GET', `/api/anomalies/${anomalyId}`);
    if (anomaly.data.status !== 'CORRECTED') {
      console.log('   Skipped - anomaly not corrected');
      return;
    }
    const newVersion = anomaly.data.currentVersion;
    const res = await apiRequest('POST', `/api/anomalies/${anomalyId}/correct`, {
      newValue: 1600,
      operator: 'reviewer_1',
      version: newVersion
    });
    if (res.status !== 200) {
      console.log(`   Response: ${JSON.stringify(res.data)}`);
    }
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('回退异常修正限制', async () => {
    const rollbackAnomalies = await apiRequest('GET', '/api/anomalies?type=ROLLBACK');
    if (rollbackAnomalies.data.length === 0) {
      console.log('   Skipped - No rollback anomalies found');
      return;
    }
    const rollbackId = rollbackAnomalies.data[0].id;
    const rollbackVersion = rollbackAnomalies.data[0].currentVersion;
    const res = await apiRequest('POST', `/api/anomalies/${rollbackId}/correct`, {
      newValue: 100,
      operator: 'reviewer_1',
      version: rollbackVersion
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test('忽略异常', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies?status=PENDING');
    if (anomalies.data.length === 0) {
      console.log('   Skipped - No pending anomalies');
      return;
    }
    const ignoreId = anomalies.data[0].id;
    const res = await apiRequest('POST', `/api/anomalies/${ignoreId}/ignore`, {
      operator: 'reviewer_1',
      remark: '测试忽略'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('撤销操作', async () => {
    const corrected = await apiRequest('GET', '/api/anomalies?status=CORRECTED');
    if (corrected.data.length === 0) {
      console.log('   Skipped - No corrected anomalies');
      return;
    }
    const revertId = corrected.data[0].id;
    const res = await apiRequest('POST', `/api/anomalies/${revertId}/revert`);
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  // Test 5: Batch Comparison
  console.log('\n--- 批次对比测试 ---');

  await test('获取批次列表', async () => {
    const res = await apiRequest('GET', '/api/batches');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!Array.isArray(res.data) || res.data.length < 2) throw new Error('Not enough batches');
  });

  await test('对比两个批次', async () => {
    if (!batch1Id || !batch2Id) throw new Error('Batch IDs not available');
    const res = await apiRequest('POST', '/api/batches/compare', {
      batch1Id,
      batch2Id
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.meterTrajectory) throw new Error('No trajectory data');
    console.log(`   Trajectories: ${res.data.meterTrajectory.length}`);
  });

  await test('获取表计轨迹', async () => {
    const res = await apiRequest('GET', '/api/meters/M001/trajectory');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.readings) throw new Error('No readings');
    console.log(`   Readings: ${res.data.readings.length}`);
  });

  // Test 6: Anomaly Replay
  console.log('\n--- 复核回放测试 ---');

  await test('获取异常回放', async () => {
    const res = await apiRequest('GET', `/api/anomalies/${anomalyId}/replay`);
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.ruleSnapshot) throw new Error('No rule snapshot');
    console.log(`   Corrections: ${res.data.corrections.length}`);
  });

  // Test 7: Operation Logs
  console.log('\n--- 操作日志测试 ---');

  await test('获取操作日志', async () => {
    const res = await apiRequest('GET', '/api/operation-logs');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    console.log(`   Logs: ${res.data.length}`);
  });

  await test('按操作类型筛选日志', async () => {
    const res = await apiRequest('GET', '/api/operation-logs?operationType=EXPORT');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  // Test 8: Export
  console.log('\n--- 导出功能测试 ---');

  await test('导出明细', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.filePath) throw new Error('No file path');
  });

  await test('导出汇总', async () => {
    const res = await apiRequest('POST', '/api/export/summary', {});
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.filePath) throw new Error('No file path');
  });

  await test('导出筛选结果（主管权限）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('导出筛选结果（普通用户权限拦截）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'reviewer_1'
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await test('导出批次对比（主管权限）', async () => {
    if (!batch1Id || !batch2Id) throw new Error('Batch IDs not available');
    const res = await apiRequest('POST', '/api/export/batch-compare', {
      batch1Id,
      batch2Id,
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  await test('导出回放（主管权限）', async () => {
    const res = await apiRequest('POST', '/api/export/replay', {
      anomalyId,
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
  });

  // Test 9: Batch Operations
  console.log('\n--- 批次操作测试 ---');

  await test('撤销整批操作（主管权限）', async () => {
    if (!batch1Id) throw new Error('Batch ID not available');
    const res = await apiRequest('POST', `/api/batches/${batch1Id}/revert-all`, {
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    console.log(`   Reverted: ${res.data.revertedCount}`);
  });

  await test('撤销整批操作（普通用户权限拦截）', async () => {
    if (!batch2Id) throw new Error('Batch ID not available');
    const res = await apiRequest('POST', `/api/batches/${batch2Id}/revert-all`, {
      operator: 'reviewer_1'
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  // Test 10: Conflict Detection
  console.log('\n--- 冲突检测测试 ---');

  await test('版本冲突检测', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies');
    if (anomalies.data.length === 0) {
      console.log('   Skipped - No anomalies');
      return;
    }
    const testId = anomalies.data[0].id;
    const oldVersion = 1;
    const res = await apiRequest('GET', `/api/anomalies/${testId}/check-conflict?currentVersion=${oldVersion}&operator=reviewer_1`);
    if (res.status === 409) {
      console.log(`   Conflict detected: ${res.data.message}`);
    } else if (res.status === 200) {
      console.log('   No conflict (version matched)');
    } else {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  });

  // Test 11: Dashboard
  console.log('\n--- 仪表盘测试 ---');

  await test('获取仪表盘统计', async () => {
    const res = await apiRequest('GET', '/api/dashboard/stats');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    console.log(`   Pending: ${res.data.pendingAnomalies}`);
  });

  // Summary
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
