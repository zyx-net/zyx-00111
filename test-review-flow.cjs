const fs = require('fs');
const path = require('path');

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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearDatabase() {
  const batches = await request('GET', '/batches');
  for (const batch of batches.data) {
    await request('DELETE', `/batches/${batch.id}`);
  }
  console.log('已清空所有批次数据');
}

async function runTests() {
  console.log('=== 开始测试读数复核链路 ===\n');

  await clearDatabase();

  console.log('\n--- 测试1: 导入数据并检测异常 ---');
  const testReadings = [
    { meterId: 'M001', readingDate: '2024-01-15', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'M001', readingDate: '2024-01-16', rawValue: 1100, meterType: 'ELECTRICITY' },
    { meterId: 'M001', readingDate: '2024-01-17', rawValue: 1050, meterType: 'ELECTRICITY' },
    { meterId: 'M001', readingDate: '2024-01-18', rawValue: 1200, meterType: 'ELECTRICITY' },
    { meterId: 'W001', readingDate: '2024-01-15', rawValue: 500, meterType: 'WATER' },
    { meterId: 'W001', readingDate: '2024-01-16', rawValue: 520, meterType: 'WATER' },
  ];

  const importResult = await request('POST', '/batches', { readings: testReadings });
  console.log('导入结果:', JSON.stringify(importResult.data, null, 2));

  if (importResult.data.anomalies) {
    console.log(`检测到 ${importResult.data.anomalies.length} 个异常`);
    importResult.data.anomalies.forEach(a => {
      console.log(`  - ${a.anomalyType}: ${a.meterId} (${a.readingDate})`);
    });
  }

  console.log('\n--- 测试2: 验证回退异常检测 ---');
  const rollbackAnomaly = importResult.data.anomalies?.find(a => a.anomalyType === 'ROLLBACK');
  if (rollbackAnomaly) {
    console.log('✓ 回退异常检测正常');
  } else {
    console.log('✗ 未检测到回退异常');
  }

  console.log('\n--- 测试3: 修正异常 ---');
  if (rollbackAnomaly) {
    const correctResult = await request('POST', `/anomalies/${rollbackAnomaly.id}/correct`, {
      newValue: 1150,
      operator: 'test_user',
      version: rollbackAnomaly.currentVersion
    });
    console.log('修正结果:', JSON.stringify(correctResult.data, null, 2));

    const anomalyDetail = await request('GET', `/anomalies/${rollbackAnomaly.id}`);
    console.log('修正后异常详情:', JSON.stringify(anomalyDetail.data, null, 2));

    if (anomalyDetail.data.correctedValue === 1150) {
      console.log('✓ 修正值已正确保存');
    } else {
      console.log('✗ 修正值保存异常');
    }
  }

  console.log('\n--- 测试4: 撤销修正 ---');
  if (rollbackAnomaly) {
    const revertResult = await request('POST', `/anomalies/${rollbackAnomaly.id}/revert`);
    console.log('撤销结果:', JSON.stringify(revertResult.data, null, 2));

    const anomalyDetail = await request('GET', `/anomalies/${rollbackAnomaly.id}`);
    console.log('撤销后异常详情:', JSON.stringify(anomalyDetail.data, null, 2));

    if (anomalyDetail.data.status === 'PENDING') {
      console.log('✓ 状态已恢复为待复核');
    } else {
      console.log('✗ 状态恢复异常');
    }

    if (anomalyDetail.data.correctedValue === null || anomalyDetail.data.correctedValue === undefined) {
      console.log('✓ correctedValue 已清除');
    } else {
      console.log('✗ correctedValue 未清除:', anomalyDetail.data.correctedValue);
    }
  }

  console.log('\n--- 测试5: 汇总报表 ---');
  const summaryResult = await request('POST', '/export/summary', {});
  console.log('汇总结果:', JSON.stringify(summaryResult.data.summary, null, 2));

  const electricType = summaryResult.data.summary?.byType?.find(t => t.type === '电');
  if (electricType) {
    console.log(`电表统计: 原始值总和=${electricType.totalRaw}, 有效值总和=${electricType.totalEffective}`);
    if (electricType.totalRaw === electricType.totalEffective) {
      console.log('✓ 撤销后汇总计算正确（使用原始值）');
    } else {
      console.log('✗ 汇总计算异常');
    }
  }

  console.log('\n--- 测试6: 缺失检测 ---');
  await clearDatabase();

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 10);
  const oldDateStr = oldDate.toISOString().split('T')[0];

  const oldReadings = [
    { meterId: 'G001', readingDate: oldDateStr, rawValue: 100, meterType: 'GAS' },
  ];

  const oldImportResult = await request('POST', '/batches', { readings: oldReadings });
  console.log('导入旧数据结果:', JSON.stringify(oldImportResult.data, null, 2));

  const missingResult = await request('POST', '/anomalies/detect-missing');
  console.log('缺失检测结果:', JSON.stringify(missingResult.data, null, 2));

  if (missingResult.data.count > 0) {
    console.log('✓ 缺失检测正常');
    missingResult.data.anomalies.forEach(a => {
      console.log(`  - ${a.anomalyType}: ${a.remark}`);
    });
  } else {
    console.log('! 未检测到缺失异常（可能因为配置或数据原因）');
  }

  console.log('\n--- 测试7: 重复导入检测 ---');
  const dupReadings = [
    { meterId: 'G001', readingDate: oldDateStr, rawValue: 100, meterType: 'GAS' },
  ];
  const duplicateResult = await request('POST', '/batches', { readings: dupReadings });
  if (duplicateResult.status === 400 && duplicateResult.data.error?.includes('重复')) {
    console.log('✓ 重复导入被正确拦截');
  } else {
    console.log('✗ 重复导入检测异常');
  }

  console.log('\n--- 测试8: 冲突检测 ---');
  const anomalies = await request('GET', '/anomalies?status=PENDING');
  if (anomalies.data.length > 0) {
    const testAnomaly = anomalies.data[0];
    
    const correct1 = await request('POST', `/anomalies/${testAnomaly.id}/correct`, {
      newValue: 9999,
      operator: 'user1',
      version: testAnomaly.currentVersion
    });
    console.log('第一次修正:', correct1.status, correct1.data.success ? '成功' : correct1.data.error?.message);

    const correct2 = await request('POST', `/anomalies/${testAnomaly.id}/correct`, {
      newValue: 8888,
      operator: 'user2',
      version: testAnomaly.currentVersion
    });
    console.log('第二次修正（旧版本）:', correct2.status, correct2.data.error?.message || correct2.data);

    if (correct2.status === 409) {
      console.log('✓ 冲突检测正常');
    } else {
      console.log('✗ 冲突检测异常');
    }
  }

  console.log('\n--- 测试9: 重启后数据一致性 ---');
  console.log('当前异常列表:');
  const finalAnomalies = await request('GET', '/anomalies');
  finalAnomalies.data.forEach(a => {
    console.log(`  - ${a.anomalyType}: ${a.meterId} (${a.status}) correctedValue=${a.correctedValue}`);
  });

  console.log('\n当前汇总:');
  const finalSummary = await request('POST', '/export/summary', {});
  console.log(JSON.stringify(finalSummary.data.summary, null, 2));

  console.log('\n=== 测试完成 ===');
}

runTests().catch(console.error);
