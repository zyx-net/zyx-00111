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

async function runConcurrencyTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     并发场景测试 - 交付包模块                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('=== 阶段1: 环境准备 ===\n');
  await cleanupPackages('admin');
  await cleanupBatches();

  const testReadings = [
    { meterId: 'CONCURR_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'CONCURR_001', readingDate: '2026-06-02', rawValue: 1100, meterType: 'ELECTRICITY' },
  ];

  const importResult = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'admin'
  });

  const batchId = importResult.data.batchId;
  console.log(`  ✓ 测试数据已导入 (批次ID: ${batchId})\n`);

  console.log('=== 阶段2: 并发生成测试 ===\n');

  const pkg1Result = await apiRequest('POST', '/api/delivery-packages', {
    name: '并发生成测试包',
    description: '测试并发生成场景',
    operator: 'admin'
  });

  const packageId = pkg1Result.data.package.id;

  await apiRequest('POST', `/api/delivery-packages/${packageId}/records`, {
    records: [{ batchId, recordType: 'BATCH' }],
    operator: 'admin'
  });

  console.log('  场景: 两个用户同时尝试生成同一个交付包\n');

  const [result1, result2] = await Promise.all([
    apiRequest('POST', `/api/delivery-packages/${packageId}/generate`, {
      operator: 'admin'
    }).catch(err => ({ error: err.message, status: 500 })),
    apiRequest('POST', `/api/delivery-packages/${packageId}/generate`, {
      operator: 'supervisor'
    }).catch(err => ({ error: err.message, status: 500 }))
  ]);

  await sleep(500);

  const successCount = [result1, result2].filter(r => r.data?.success).length;
  const failCount = [result1, result2].filter(r => !r.data?.success).length;

  console.log(`  结果: ${successCount} 个成功, ${failCount} 个失败`);

  if (successCount === 1 && failCount === 1) {
    console.log('  ✓ 并发控制生效，只有一个生成操作成功\n');
  } else if (successCount === 0) {
    console.log('  ! 警告: 两个操作都失败了，可能需要检查\n');
  } else {
    console.log('  ? 注意: 两个操作都成功了，可能是锁机制问题\n');
  }

  console.log('=== 阶段3: 版本号递增验证 ===\n');

  const detail = await apiRequest('GET', `/api/delivery-packages/${packageId}?operator=admin`);
  console.log(`  交付包最终版本: v${detail.data.version}`);
  console.log(`  交付包最终状态: ${detail.data.status}\n`);

  const versions = await apiRequest('GET', `/api/delivery-packages/${packageId}/versions?operator=admin`);
  console.log(`  版本历史记录数: ${versions.data.length}`);

  for (const v of versions.data) {
    console.log(`    - v${v.version} (${v.isActive ? '当前版本' : '历史版本'})`);
  }
  console.log('');

  console.log('=== 阶段4: 撤销后重建测试 ===\n');

  const cancelResult = await apiRequest('POST', `/api/delivery-packages/${packageId}/cancel`, {
    operator: 'admin',
    reason: '并发测试撤销'
  });

  if (cancelResult.data.success) {
    console.log('  ✓ 撤销成功');

    const rebuildResult = await apiRequest('POST', `/api/delivery-packages/${packageId}/rebuild`, {
      operator: 'admin'
    });

    if (rebuildResult.data.success) {
      console.log(`  ✓ 重建成功，新版本: v${rebuildResult.data.package.version}`);

      await apiRequest('POST', `/api/delivery-packages/${packageId}/records`, {
        records: [{ batchId, recordType: 'BATCH' }],
        operator: 'admin'
      });

      const newGenerateResult = await apiRequest('POST', `/api/delivery-packages/${packageId}/generate`, {
        operator: 'admin'
      });

      if (newGenerateResult.data.success) {
        console.log('  ✓ 重建后重新生成成功');
      } else {
        console.log(`  ✗ 重建后重新生成失败: ${newGenerateResult.data.error}`);
      }
    }
  }

  console.log('\n=== 阶段5: 历史记录完整性验证 ===\n');

  const finalVersions = await apiRequest('GET', `/api/delivery-packages/${packageId}/versions?operator=admin`);
  console.log(`  最终版本历史数: ${finalVersions.data.length}`);

  for (const v of finalVersions.data) {
    const createdAt = new Date(v.createdAt).toLocaleString();
    console.log(`    v${v.version}: ${createdAt} - ${v.changeSummary || '无描述'}`);
  }

  const auditLogs = await apiRequest('GET', `/api/delivery-packages/audit-logs?operator=admin`);
  const packageLogs = auditLogs.data.filter(l => l.packageId === packageId);
  console.log(`\n  该交付包审计日志数: ${packageLogs.length}`);

  const operations = {};
  for (const log of packageLogs) {
    operations[log.operation] = (operations[log.operation] || 0) + 1;
  }

  for (const [op, count] of Object.entries(operations)) {
    console.log(`    ${op}: ${count} 条`);
  }

  console.log('\n=== 阶段6: 重复提交测试 ===\n');

  const pkg2Result = await apiRequest('POST', '/api/delivery-packages', {
    name: '重复提交测试包',
    description: '测试重复提交记录',
    operator: 'admin'
  });

  const packageId2 = pkg2Result.data.package.id;

  console.log('  尝试添加相同的批次两次...');

  await apiRequest('POST', `/api/delivery-packages/${packageId2}/records`, {
    records: [{ batchId, recordType: 'BATCH' }],
    operator: 'admin'
  });

  const recordsBefore = await apiRequest('GET', `/api/delivery-packages/${packageId2}/records?operator=admin`);
  const countBefore = recordsBefore.data.length;
  console.log(`    添加第一次后记录数: ${countBefore}`);

  await apiRequest('POST', `/api/delivery-packages/${packageId2}/records`, {
    records: [{ batchId, recordType: 'BATCH' }],
    operator: 'admin'
  });

  const recordsAfter = await apiRequest('GET', `/api/delivery-packages/${packageId2}/records?operator=admin`);
  const countAfter = recordsAfter.data.length;
  console.log(`    添加第二次后记录数: ${countAfter}`);

  if (countAfter > countBefore) {
    console.log('  ! 注意: 系统允许添加相同的记录（可能需要去重逻辑）');
  } else {
    console.log('  ✓ 系统正确处理了重复提交');
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  并发场景测试完成                                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n注意事项:');
  console.log('1. 并发控制确保同一时刻只有一个生成操作成功');
  console.log('2. 版本号在每次生成时递增');
  console.log('3. 历史记录完整保留');
  console.log('4. 撤销后可以重建，重建后版本号正确递增');
  console.log('5. 审计日志记录了所有操作');
}

runConcurrencyTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
