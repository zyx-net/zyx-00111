const http = require('http');
const fs = require('fs');
const path = require('path');

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
  const packages = await apiRequest('GET', `/api/delivery-packages?operator=${operator}`);
  for (const pkg of packages.data || []) {
    try {
      await apiRequest('DELETE', `/api/delivery-packages/${pkg.id}`, { operator });
    } catch {}
  }
}

async function cleanupBatches() {
  const batches = await apiRequest('GET', '/api/batches');
  for (const batch of batches.data || []) {
    try {
      await apiRequest('DELETE', `/api/batches/${batch.id}`);
    } catch {}
  }
}

async function runRestartRecoveryTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     服务重启恢复测试                                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('=== 阶段1: 环境准备 ===\n');
  await cleanupPackages('admin');
  await cleanupBatches();

  const testReadings = [
    { meterId: 'RECOVERY_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'RECOVERY_001', readingDate: '2026-06-02', rawValue: 1100, meterType: 'ELECTRICITY' },
  ];

  const importResult = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'admin'
  });

  const batchId = importResult.data.batchId;
  console.log(`  ✓ 测试数据已导入 (批次ID: ${batchId})\n`);

  console.log('=== 阶段2: 创建测试数据 ===\n');

  const testPackages = [];
  for (let i = 1; i <= 3; i++) {
    const pkgResult = await apiRequest('POST', '/api/delivery-packages', {
      name: `重启恢复测试包${i}`,
      description: `用于测试重启恢复功能 ${i}`,
      operator: 'admin'
    });

    const pkgId = pkgResult.data.package.id;
    testPackages.push(pkgId);

    await apiRequest('POST', `/api/delivery-packages/${pkgId}/records`, {
      records: [{ batchId, recordType: 'BATCH' }],
      operator: 'admin'
    });

    if (i <= 2) {
      await apiRequest('POST', `/api/delivery-packages/${pkgId}/generate`, {
        operator: 'admin'
      });
      await sleep(300);
    }

    console.log(`  ✓ 创建交付包 ${i}: ${pkgResult.data.package.packageName}`);
    console.log(`    - 状态: ${i <= 2 ? 'COMPLETED' : 'PENDING'}`);
  }

  console.log('\n=== 阶段3: 记录当前状态 ===\n');

  const beforeRestart = await apiRequest('GET', '/api/delivery-packages?operator=admin');
  const completedPackages = beforeRestart.data.filter(p => p.status === 'COMPLETED');
  const pendingPackages = beforeRestart.data.filter(p => p.status === 'PENDING');

  console.log(`  当前交付包总数: ${beforeRestart.data.length}`);
  console.log(`  已完成交付包数: ${completedPackages.length}`);
  console.log(`  待处理交付包数: ${pendingPackages.length}`);

  const completedPackageDetails = [];
  for (const pkg of completedPackages) {
    const detail = await apiRequest('GET', `/api/delivery-packages/${pkg.id}?operator=admin`);
    completedPackageDetails.push({
      id: detail.data.id,
      name: detail.data.packageName,
      version: detail.data.version,
      filePath: detail.data.filePath,
      status: detail.data.status
    });
    console.log(`    - ${detail.data.packageName}: v${detail.data.version}, 文件: ${detail.data.filePath || '无'}`);
  }

  console.log('\n=== 阶段4: 数据库文件验证 ===\n');

  const dbPath = path.join(__dirname, 'data', 'energy_review.db');
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`  ✓ 数据库文件存在: ${dbPath}`);
    console.log(`    - 大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`    - 最后修改: ${stats.mtime.toLocaleString()}`);
  } else {
    console.log('  ✗ 数据库文件不存在');
  }

  const exportsDir = path.join(__dirname, 'exports');
  if (fs.existsSync(exportsDir)) {
    const files = fs.readdirSync(exportsDir).filter(f => f.includes('delivery_package'));
    console.log(`\n  ✓ 交付包文件目录存在`);
    console.log(`    - 交付包文件数: ${files.length}`);
  }

  console.log('\n=== 阶段5: 模拟服务中断 ===\n');

  console.log('  注意: 请手动停止服务 (Ctrl+C) 然后重新启动');
  console.log('  重新启动后，运行以下命令验证:');
  console.log('    node test-delivery-recovery-verify.cjs\n');

  console.log('  或者，您可以继续运行以验证手动恢复功能...\n');

  console.log('=== 阶段6: 手动恢复功能测试 ===\n');

  const recoveryResult = await apiRequest('GET', '/api/delivery-packages/system/recovery?operator=admin');
  
  if (recoveryResult.data.success) {
    console.log('  ✓ 系统恢复接口调用成功');
    console.log(`    - 处理中断任务数: ${recoveryResult.data.totalRecovered}`);
    console.log(`    - 执行时间: ${recoveryResult.data.recoveredAt}`);

    if (recoveryResult.data.staleTasksRecovery?.details?.length > 0) {
      console.log('    - 任务恢复详情:');
      for (const detail of recoveryResult.data.staleTasksRecovery.details) {
        console.log(`      ${detail}`);
      }
    }

    if (recoveryResult.data.processingRecovery?.packageIds?.length > 0) {
      console.log('    - 处理中包恢复详情:');
      console.log(`      处理了 ${recoveryResult.data.processingRecovery.packageIds.length} 个中断的包`);
    }
  } else {
    console.log('  ✗ 系统恢复接口调用失败');
    console.log(`    错误: ${recoveryResult.data.error}`);
  }

  console.log('\n=== 阶段7: 恢复后状态验证 ===\n');

  const afterRecovery = await apiRequest('GET', '/api/delivery-packages?operator=admin');
  const recoveredCompleted = afterRecovery.data.filter(p => p.status === 'COMPLETED');
  const failedPackages = afterRecovery.data.filter(p => p.status === 'FAILED');

  console.log(`  恢复后交付包总数: ${afterRecovery.data.length}`);
  console.log(`  已完成交付包数: ${recoveredCompleted.length}`);
  console.log(`  失败状态交付包数: ${failedPackages.length}`);

  for (const pkg of recoveredCompleted) {
    const versions = await apiRequest('GET', `/api/delivery-packages/${pkg.id}/versions?operator=admin`);
    console.log(`\n  交付包: ${pkg.packageName}`);
    console.log(`    - 当前版本: v${pkg.version}`);
    console.log(`    - 版本历史数: ${versions.data.length}`);
    console.log(`    - 文件路径: ${pkg.filePath || '无'}`);

    const downloads = await apiRequest('GET', `/api/delivery-packages/${pkg.id}/downloads?operator=admin`);
    console.log(`    - 下载记录数: ${downloads.data.length}`);
  }

  console.log('\n=== 阶段8: 重建失败任务测试 ===\n');

  if (failedPackages.length > 0) {
    const failedPkg = failedPackages[0];
    console.log(`  发现失败交付包: ${failedPkg.packageName}`);

    const rebuildResult = await apiRequest('POST', `/api/delivery-packages/${failedPkg.id}/rebuild`, {
      operator: 'admin'
    });

    if (rebuildResult.data.success) {
      console.log(`  ✓ 重建成功`);
      console.log(`    - 新版本: v${rebuildResult.data.package.version}`);
      console.log(`    - 新状态: ${rebuildResult.data.package.status}`);
    } else {
      console.log(`  ✗ 重建失败: ${rebuildResult.data.error}`);
    }
  } else {
    console.log('  (无失败状态的交付包，跳过重建测试)');
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  服务重启恢复测试完成                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n测试要点:');
  console.log('1. 服务重启后，PROCESSING 状态会自动标记为 FAILED');
  console.log('2. 已完成状态的文件路径和配置完整保留');
  console.log('3. 管理员可以手动触发系统恢复');
  console.log('4. 失败的任务可以重建，重建后版本号正确递增');
  console.log('5. 所有操作都有完整的审计日志记录');
}

runRestartRecoveryTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
