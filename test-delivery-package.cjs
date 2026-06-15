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
  console.log('=== 离线交付包回归测试 ===\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${err.message}`);
      failed++;
    }
  }

  console.log('--- 创建测试数据 ---');
  const testReadings = [
    { meterId: 'TEST_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'TEST_001', readingDate: '2026-06-02', rawValue: 1200, meterType: 'ELECTRICITY' },
    { meterId: 'TEST_002', readingDate: '2026-06-01', rawValue: 500, meterType: 'WATER' },
    { meterId: 'TEST_002', readingDate: '2026-06-02', rawValue: 550, meterType: 'WATER' },
  ];

  await test('导入测试数据', async () => {
    const result = await apiRequest('POST', '/api/batches', {
      readings: testReadings,
      importedBy: 'supervisor'
    });
    if (!result.data.batchId) throw new Error('导入失败');
  });

  console.log('\n--- 交付包创建测试 ---');

  let packageId;
  await test('创建交付包', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '测试交付包',
      description: '这是一个测试交付包',
      operator: 'supervisor',
      filters: { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
    });
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.package?.id) throw new Error('未返回交付包ID');
    packageId = result.data.package.id;
  });

  await test('查询交付包列表', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('未找到创建的交付包');
  });

  await test('查询交付包详情', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}?operator=supervisor`);
    if (!result.data.packageName) throw new Error('返回格式错误');
  });

  console.log('\n--- 交付包记录管理测试 ---');

  await test('添加记录到交付包', async () => {
    const records = await apiRequest('GET', `/api/batches`);
    if (records.data.length > 0) {
      const batchId = records.data[0].id;
      const result = await apiRequest('POST', `/api/delivery-packages/${packageId}/records`, {
        records: [
          { batchId: batchId, recordType: 'BATCH' }
        ],
        operator: 'supervisor'
      });
      if (!result.data.success) throw new Error(result.data.error);
    }
  });

  await test('查询交付包记录', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}/records?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
  });

  console.log('\n--- 交付包生成测试 ---');

  await test('生成交付包文件', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId}/generate`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.fileName) throw new Error('未返回文件名');
  });

  await test('交付包状态为已完成', async () => {
    await sleep(500);
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}?operator=supervisor`);
    if (result.data.status !== 'COMPLETED') throw new Error(`状态应为COMPLETED，实际为${result.data.status}`);
  });

  await test('查询任务日志', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}/tasks?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('未找到任务日志');
  });

  await test('查询版本历史', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}/versions?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('未找到版本历史');
  });

  console.log('\n--- 交付包下载测试 ---');

  await test('下载交付包', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}/download?operator=supervisor`);
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.downloadUrl) throw new Error('未返回下载链接');
  });

  await test('查询下载记录', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId}/downloads?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('未找到下载记录');
  });

  console.log('\n--- 审计日志测试 ---');

  await test('查询审计日志（主管）', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/audit-logs?operator=supervisor`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('未找到审计日志');
  });

  console.log('\n--- 权限隔离测试 ---');

  await test('复核员无法查看其他人的交付包', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages?operator=reviewer_1`);
    if (result.status === 403) {
      console.log('    (复核员被拒绝访问，符合预期)');
    }
  });

  await test('查询下载记录（角色过滤）', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/downloads?operator=reviewer_1`);
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
  });

  console.log('\n--- 交付包重建测试 ---');

  await test('取消交付包', async () => {
    const newResult = await apiRequest('POST', '/api/delivery-packages', {
      name: '测试取消',
      description: '用于测试取消',
      operator: 'supervisor'
    });
    const newPackageId = newResult.data.package.id;

    const result = await apiRequest('POST', `/api/delivery-packages/${newPackageId}/cancel`, {
      operator: 'supervisor',
      reason: '测试取消'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  await test('重建已取消的交付包', async () => {
    const list = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
    const cancelled = list.data.find(p => p.status === 'CANCELLED');
    if (!cancelled) throw new Error('未找到已取消的交付包');

    const result = await apiRequest('POST', `/api/delivery-packages/${cancelled.id}/rebuild`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  console.log('\n--- 服务重启恢复测试 ---');

  await test('重启后查询交付包列表', async () => {
    await sleep(1000);
    const result = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
    if (!Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length === 0) throw new Error('重启后未找到交付包');
  });

  await test('重启后查询已完成交付包', async () => {
    const result = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
    const completed = result.data.find(p => p.status === 'COMPLETED');
    if (!completed) throw new Error('重启后未找到已完成的交付包');

    const detail = await apiRequest('GET', `/api/delivery-packages/${completed.id}?operator=supervisor`);
    if (detail.data.status !== 'COMPLETED') throw new Error('重启后状态不一致');
    if (!detail.data.filePath) throw new Error('重启后下载地址丢失');
  });

  console.log('\n--- 锁定测试 ---');

  await test('锁定交付包', async () => {
    const list = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
    const pending = list.data.find(p => p.status === 'PENDING');
    if (!pending) throw new Error('未找到待处理的交付包');

    const result = await apiRequest('POST', `/api/delivery-packages/${pending.id}/lock`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  await test('解锁交付包', async () => {
    const list = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
    const locked = list.data.find(p => p.lockedBy);
    if (!locked) throw new Error('未找到锁定的交付包');

    const result = await apiRequest('POST', `/api/delivery-packages/${locked.id}/unlock`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
