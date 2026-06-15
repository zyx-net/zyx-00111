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

async function cleanupPackages(operator) {
  try {
    const packages = await apiRequest('GET', `/api/delivery-packages?operator=${operator}`);
    if (packages.data && Array.isArray(packages.data)) {
      for (const pkg of packages.data) {
        try {
          await apiRequest('DELETE', `/api/delivery-packages/${pkg.id}`, { operator });
        } catch {}
      }
    }
  } catch {}
}

async function cleanupBatches() {
  try {
    const batches = await apiRequest('GET', '/api/batches');
    if (batches.data && Array.isArray(batches.data)) {
      for (const batch of batches.data) {
        try {
          await apiRequest('DELETE', `/api/batches/${batch.id}`);
        } catch {}
      }
    }
  } catch {}
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     离线交付包完整功能回归测试                          ║');
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
  
  await cleanupPackages('admin');
  await cleanupBatches();
  console.log('    (环境已清理)\n');

  console.log('=== 阶段2: 基础功能测试 ===\n');

  const uniqueId = `TEST_${Date.now()}`;
  let testBatchId;
  await test('导入测试数据', async () => {
    const testReadings = [
      { meterId: `${uniqueId}_001`, readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
      { meterId: `${uniqueId}_001`, readingDate: '2026-06-02', rawValue: 1100, meterType: 'ELECTRICITY' },
      { meterId: `${uniqueId}_002`, readingDate: '2026-06-01', rawValue: 500, meterType: 'WATER' },
      { meterId: `${uniqueId}_002`, readingDate: '2026-06-02', rawValue: 550, meterType: 'WATER' },
    ];
    const result = await apiRequest('POST', '/api/batches', {
      readings: testReadings,
      importedBy: 'supervisor'
    });
    if (!result.data.batchId) throw new Error(result.data.error || '导入失败');
    testBatchId = result.data.batchId;
  });

  let packageId1;
  await test('创建交付包（主管）', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '基础功能测试包',
      description: '用于基础功能测试',
      operator: 'supervisor',
      filters: { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
    });
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.package?.id) throw new Error('未返回交付包ID');
    packageId1 = result.data.package.id;
  });

  await test('添加记录到交付包', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId1}/records`, {
      records: [{ batchId: testBatchId, recordType: 'BATCH' }],
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  await test('生成交付包文件', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId1}/generate`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.fileName) throw new Error('未返回文件名');
  });

  await sleep(500);

  await test('验证交付包状态为已完成', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId1}?operator=supervisor`);
    if (result.data.status !== 'COMPLETED') throw new Error(`状态应为COMPLETED，实际为${result.data.status}`);
    if (!result.data.filePath) throw new Error('文件路径丢失');
  });

  await test('下载交付包', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId1}/download?operator=supervisor`);
    if (!result.data.success) throw new Error(result.data.error);
    if (!result.data.downloadUrl) throw new Error('未返回下载链接');
  });

  await test('验证下载记录已创建', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId1}/downloads?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) throw new Error('下载记录为空');
    if (result.data[0].downloadedBy !== 'supervisor') throw new Error('下载者信息错误');
  });

  console.log('\n=== 阶段3: 权限隔离测试 ===\n');

  let packageId2;
  await test('创建交付包（复核员1）', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '复核员1的交付包',
      description: '测试权限隔离',
      operator: 'reviewer_1'
    });
    if (!result.data.success) throw new Error(result.data.error);
    packageId2 = result.data.package.id;
  });

  await test('复核员1查看自己的交付包', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages?operator=reviewer_1`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('返回格式错误');
    const ownPackage = result.data.find(p => p.createdBy === 'reviewer_1');
    if (!ownPackage) throw new Error('未找到自己的交付包');
  });

  await test('复核员1不能查看其他人的交付包', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages?operator=reviewer_1`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('返回格式错误');
    const otherPackage = result.data.find(p => p.createdBy === 'supervisor');
    if (otherPackage) throw new Error('复核员应该看不到主管的交付包');
  });

  await test('复核员尝试下载其他人的交付包（越权）', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId1}/download?operator=reviewer_1`);
    if (result.status !== 403) throw new Error(`应返回403，实际返回${result.status}`);
    if (!result.data.auditLogged) throw new Error('越权访问应被记录');
  });

  await test('复核员可以下载自己的交付包', async () => {
    const batches = await apiRequest('GET', '/api/batches');
    const batchId = batches.data?.[0]?.id;
    
    if (batchId) {
      await apiRequest('POST', `/api/delivery-packages/${packageId2}/records`, {
        records: [{ batchId, recordType: 'BATCH' }],
        operator: 'reviewer_1'
      });
    }

    const result = await apiRequest('POST', `/api/delivery-packages/${packageId2}/generate`, {
      operator: 'reviewer_1'
    });
    if (!result.data.success) throw new Error(result.data.error);

    await sleep(300);

    const downloadResult = await apiRequest('GET', `/api/delivery-packages/${packageId2}/download?operator=reviewer_1`);
    if (!downloadResult.data.success) throw new Error('复核员应能下载自己的交付包');
  });

  console.log('\n=== 阶段4: 取消和重建测试 ===\n');

  let packageId3;
  await test('创建用于取消重建测试的交付包', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '取消重建测试包',
      description: '用于测试取消和重建',
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
    packageId3 = result.data.package.id;
  });

  await test('取消交付包', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId3}/cancel`, {
      operator: 'supervisor',
      reason: '测试取消功能'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  await test('验证取消后状态', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId3}?operator=supervisor`);
    if (result.data.status !== 'CANCELLED') throw new Error('状态应为CANCELLED');
  });

  await test('重建已取消的交付包', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId3}/rebuild`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
    if (result.data.package.version !== 2) throw new Error('版本号应为2');
  });

  await test('验证重建后状态', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId3}?operator=supervisor`);
    if (result.data.status !== 'PENDING') throw new Error('重建后状态应为PENDING');
    if (result.data.version !== 2) throw new Error('重建后版本号应为2');
  });

  console.log('\n=== 阶段5: 版本管理测试 ===\n');

  let packageId4;
  await test('创建用于版本测试的交付包', async () => {
    const batches = await apiRequest('GET', '/api/batches');
    const batchId = batches.data?.[0]?.id;
    
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '版本管理测试包',
      description: '测试版本递增',
      operator: 'supervisor'
    });

    if (!result.data.success) throw new Error(result.data.error);
    packageId4 = result.data.package.id;

    if (batchId) {
      await apiRequest('POST', `/api/delivery-packages/${packageId4}/records`, {
        records: [{ batchId, recordType: 'BATCH' }],
        operator: 'supervisor'
      });
      await apiRequest('POST', `/api/delivery-packages/${packageId4}/generate`, {
        operator: 'supervisor'
      });
    }
  });

  await test('验证版本历史记录', async () => {
    await sleep(300);
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId4}/versions?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) throw new Error('版本历史为空');
    const latestVersion = result.data[0];
    if (latestVersion.version !== 2) throw new Error('最新版本应为2');
  });

  console.log('\n=== 阶段6: 锁定功能测试 ===\n');

  let packageId5;
  await test('创建用于锁定测试的交付包', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '锁定功能测试包',
      description: '测试锁定和解锁',
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
    packageId5 = result.data.package.id;
  });

  await test('锁定交付包', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId5}/lock`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  await test('验证锁定状态', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/${packageId5}?operator=supervisor`);
    if (!result.data.lockedBy) throw new Error('应显示锁定状态');
    if (result.data.lockedBy !== 'supervisor') throw new Error('锁定者应为supervisor');
  });

  await test('解锁交付包', async () => {
    const result = await apiRequest('POST', `/api/delivery-packages/${packageId5}/unlock`, {
      operator: 'supervisor'
    });
    if (!result.data.success) throw new Error(result.data.error);
  });

  console.log('\n=== 阶段7: 审计日志测试 ===\n');

  await test('查询审计日志', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/audit-logs?operator=supervisor`);
    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) throw new Error('审计日志为空');
    
    const createLogs = result.data.filter(l => l.operation === 'CREATE_PACKAGE');
    const generateLogs = result.data.filter(l => l.operation === 'GENERATE_FILE');
    const downloadLogs = result.data.filter(l => l.operation === 'DOWNLOAD');
    
    if (createLogs.length === 0) throw new Error('缺少创建操作日志');
    if (generateLogs.length === 0) throw new Error('缺少生成操作日志');
    if (downloadLogs.length === 0) throw new Error('缺少下载操作日志');
  });

  await test('复核员无法查看审计日志', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/audit-logs?operator=reviewer_1`);
    if (result.status !== 403) throw new Error('复核员不应能查看审计日志');
  });

  console.log('\n=== 阶段8: 重启恢复测试 ===\n');

  let packageId6;
  await test('创建重启恢复测试包', async () => {
    const result = await apiRequest('POST', '/api/delivery-packages', {
      name: '重启恢复测试包',
      description: '模拟服务中断',
      operator: 'admin'
    });
    if (!result.data.success) throw new Error(result.data.error);
    packageId6 = result.data.package.id;
  });

  await test('手动触发重启恢复', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages/system/recovery?operator=admin`);
    if (!result.data.success) throw new Error('恢复接口调用失败');
    console.log(`    (已处理 ${result.data.totalRecovered} 个中断任务)`);
  });

  await test('验证数据持久化', async () => {
    const result = await apiRequest('GET', `/api/delivery-packages?operator=admin`);
    if (!result.data || !Array.isArray(result.data)) throw new Error('返回格式错误');
    if (result.data.length < 5) throw new Error('交付包数量不足');
    
    const completedPkg = result.data.find(p => p.status === 'COMPLETED');
    if (!completedPkg) throw new Error('应存在已完成的交付包');
    
    const detail = await apiRequest('GET', `/api/delivery-packages/${completedPkg.id}?operator=admin`);
    if (detail.data.status !== 'COMPLETED') throw new Error('重启后状态不一致');
    if (!detail.data.filePath) throw new Error('重启后下载地址丢失');
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
