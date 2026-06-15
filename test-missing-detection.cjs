const API_BASE = 'http://localhost:3001/api';

async function request(method, url, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${url}`, options);
  const data = await response.json();
  return { status: response.status, data };
}

async function clearDatabase() {
  const batches = await request('GET', '/batches');
  for (const batch of batches.data) {
    await request('DELETE', `/batches/${batch.id}`);
  }
  console.log('已清空所有批次数据');
}

async function updateRule(key, value) {
  await request('PUT', '/rules', {
    configs: [{ key, value }]
  });
}

async function runTests() {
  console.log('=== 跨天缺失检测回归测试 ===\n');

  await clearDatabase();

  console.log('--- 步骤1: 设置缺失检测阈值为2天 ---');
  await updateRule('missingDays', '2');
  console.log('✓ missingDays 已设置为 2\n');

  console.log('--- 步骤2: 导入跨天数据（2026-06-12 和 2026-06-15，间隔3天 > 2天）---');
  const testReadings = [
    { meterId: 'M001', readingDate: '2026-06-12', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'M001', readingDate: '2026-06-15', rawValue: 1100, meterType: 'ELECTRICITY' },
  ];

  const importResult = await request('POST', '/batches', { readings: testReadings });
  console.log('导入结果:');
  console.log('  - 导入数量:', importResult.data.importedCount);
  console.log('  - 异常数量:', importResult.data.anomalyCount);

  const missingAnomalies = importResult.data.anomalies?.filter(a => a.anomalyType === 'MISSING') || [];
  if (missingAnomalies.length > 0) {
    console.log('\n✓ 跨天缺失检测正常！');
    missingAnomalies.forEach(a => {
      console.log(`  - ${a.meterId} (${a.readingDate}): ${a.remark}`);
    });
  } else {
    console.log('\n✗ 未检测到缺失异常！');
    return;
  }

  console.log('\n--- 步骤3: 验证异常列表 ---');
  const anomalies = await request('GET', '/anomalies?status=PENDING');
  const pendingMissing = anomalies.data.filter(a => a.anomalyType === 'MISSING');
  console.log('待复核缺失异常数量:', pendingMissing.length);

  if (pendingMissing.length > 0) {
    console.log('✓ 异常已进入待复核列表');
  } else {
    console.log('✗ 异常未进入待复核列表');
  }

  console.log('\n--- 步骤4: 测试正常间隔数据不触发缺失 ---');
  await clearDatabase();

  const normalReadings = [
    { meterId: 'W001', readingDate: '2026-06-12', rawValue: 500, meterType: 'WATER' },
    { meterId: 'W001', readingDate: '2026-06-13', rawValue: 520, meterType: 'WATER' },
    { meterId: 'W001', readingDate: '2026-06-14', rawValue: 540, meterType: 'WATER' },
  ];

  await request('POST', '/batches', { readings: normalReadings });
  const normalAnomalies = await request('GET', '/anomalies?type=MISSING');
  const normalMissingCount = normalAnomalies.data.filter(a => a.status === 'PENDING').length;

  if (normalMissingCount === 0) {
    console.log('✓ 正常间隔数据（每天）未触发缺失异常');
  } else {
    console.log('✗ 正常间隔数据错误触发了缺失异常');
  }

  console.log('\n--- 步骤5: 测试修正-冲突-撤销流程 ---');
  await clearDatabase();

  const conflictReadings = [
    { meterId: 'G001', readingDate: '2026-06-12', rawValue: 1000, meterType: 'GAS' },
    { meterId: 'G001', readingDate: '2026-06-13', rawValue: 900, meterType: 'GAS' },
  ];

  await request('POST', '/batches', { readings: conflictReadings });
  const conflictAnomalies = await request('GET', '/anomalies?status=PENDING');

  if (conflictAnomalies.data.length > 0) {
    const testAnomaly = conflictAnomalies.data[0];
    console.log('测试异常ID:', testAnomaly.id);
    console.log('初始版本:', testAnomaly.currentVersion);

    console.log('\n用户A提交修正 (v1 -> v2)...');
    const correctA = await request('POST', `/anomalies/${testAnomaly.id}/correct`, {
      newValue: 950,
      operator: 'user_a',
      version: testAnomaly.currentVersion
    });
    console.log('  结果:', correctA.data.success ? '成功' : correctA.data.error?.message);

    const afterA = await request('GET', `/anomalies/${testAnomaly.id}`);
    console.log('  当前版本:', afterA.data.currentVersion);

    console.log('\n用户B使用旧版本提交修正 (预期409冲突)...');
    const correctB = await request('POST', `/anomalies/${testAnomaly.id}/correct`, {
      newValue: 940,
      operator: 'user_b',
      version: testAnomaly.currentVersion
    });
    console.log('  状态码:', correctB.status);
    console.log('  结果:', correctB.status === 409 ? '✓ 冲突被正确拦截' : '✗ 冲突检测异常');

    console.log('\n执行撤销操作...');
    const revertResult = await request('POST', `/anomalies/${testAnomaly.id}/revert`);
    console.log('  撤销结果:', revertResult.data.message);

    const afterRevert = await request('GET', `/anomalies/${testAnomaly.id}`);
    console.log('  状态:', afterRevert.data.status);
    console.log('  correctedValue:', afterRevert.data.correctedValue);

    if (afterRevert.data.status === 'PENDING' && 
        (afterRevert.data.correctedValue === null || afterRevert.data.correctedValue === undefined)) {
      console.log('  ✓ 撤销后状态和数值都正确恢复');
    } else {
      console.log('  ✗ 撤销后数据恢复异常');
    }
  }

  console.log('\n--- 步骤6: 重启后数据一致性测试 ---');
  const afterRestartAnomalies = await request('GET', '/anomalies');
  const afterRestartSummary = await request('POST', '/export/summary', {});

  console.log('异常总数:', afterRestartAnomalies.data.length);
  console.log('待复核异常:', afterRestartAnomalies.data.filter(a => a.status === 'PENDING').length);

  const summary = afterRestartSummary.data.summary;
  console.log('\n汇总统计:');
  console.log('  - 总记录数:', summary.totalCount);
  console.log('  - 总原始值:', summary.totalRawValue);
  console.log('  - 待复核异常:', summary.pendingAnomalyCount);

  console.log('\n=== 测试完成 ===');
}

runTests().catch(console.error);
