const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;

function apiRequest(method, apiPath, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, API_BASE);
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

function downloadFile(filePath) {
  return new Promise((resolve, reject) => {
    const url = new URL(filePath, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let body = Buffer.alloc(0);
      res.on('data', (chunk) => { body = Buffer.concat([body, chunk]); });
      res.on('end', () => {
        resolve({ status: res.statusCode, content: body, contentType: res.headers['content-type'] });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function parseCSV(content) {
  const str = content.toString('utf-8');
  const cleanStr = str.replace(/^\ufeff/, '').trim();
  if (!cleanStr) return [];

  const lines = cleanStr.split(/\r?\n/).filter(line => line.trim());
  const result = [];

  for (const line of lines) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    result.push(values);
  }

  return result;
}

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

async function runTests() {
  console.log('\n=== 导出功能完整性测试 ===\n');

  // 1. 导入测试数据
  console.log('--- 导入测试数据 ---');

  await test('导入测试数据', async () => {
    const readings = [
      { meterId: 'TEST_M001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
      { meterId: 'TEST_M001', readingDate: '2026-06-02', rawValue: 1100, meterType: 'ELECTRICITY' },
      { meterId: 'TEST_M001', readingDate: '2026-06-03', rawValue: 2500, meterType: 'ELECTRICITY' },
    ];

    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}`);
    console.log(`   导入成功，批次ID: ${res.data.batchId}`);
  });

  // 2. 测试0条数据导出
  console.log('\n--- 0条数据导出测试 ---');

  await test('明细导出0条数据（不存在的日期范围）', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      operator: 'supervisor'
    });

    if (res.status !== 200) throw new Error(`期望状态码200，实际${res.status}`);
    if (res.data.success !== false) throw new Error(`期望success=false，实际${res.data.success}`);
    if (res.data.error !== '没有符合条件的数据') throw new Error(`期望错误信息，实际${res.data.error}`);
    if (res.data.recordCount !== 0) throw new Error(`期望recordCount=0，实际${res.data.recordCount}`);
    if (res.data.filePath) throw new Error(`期望无文件路径，实际${res.data.filePath}`);

    console.log(`   正确返回: ${res.data.message}`);
  });

  await test('筛选导出0条数据（待复核状态）', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies?status=PENDING');
    const pendingCount = anomalies.data.length;

    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'supervisor'
    });

    if (pendingCount === 0) {
      if (res.status !== 200) throw new Error(`期望状态码200，实际${res.status}`);
      if (res.data.success !== false) throw new Error(`期望success=false`);
      if (res.data.recordCount !== 0) throw new Error(`期望recordCount=0`);
      console.log(`   无待复核数据，正确返回空结果提示`);
    } else {
      if (res.status !== 200) throw new Error(`期望状态码200，实际${res.status}`);
      if (!res.data.filePath) throw new Error(`期望有文件路径`);
      console.log(`   有${pendingCount}条待复核数据，正确导出`);
    }
  });

  // 3. 测试有数据导出
  console.log('\n--- 有数据导出测试 ---');

  await test('明细导出（有数据）', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
    if (res.data.success === false) throw new Error(`期望导出成功，实际: ${res.data.message}`);
    if (!res.data.filePath) throw new Error('无文件路径');
    if (!res.data.filePath.endsWith('.csv')) throw new Error('文件不是CSV格式');
    if (!res.data.recordCount || res.data.recordCount === 0) throw new Error(`无数据: ${res.data.recordCount}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    if (csv.length < 2) throw new Error('CSV为空');
    console.log(`   导出${csv.length - 1}行数据，文件名: ${res.data.filePath.split('/').pop()}`);
  });

  await test('汇总导出', async () => {
    const res = await apiRequest('POST', '/api/export/summary', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
    if (!res.data.filePath) throw new Error('无文件路径');
    if (!res.data.filePath.endsWith('.csv')) throw new Error('文件不是CSV格式');
    if (!res.data.summary) throw new Error('无汇总数据');

    console.log(`   总记录数: ${res.data.summary.totalCount}`);
  });

  // 4. 测试操作日志
  console.log('\n--- 操作日志测试 ---');

  await test('导出操作记录到日志', async () => {
    const beforeLogs = await apiRequest('GET', '/api/operation-logs?operationType=EXPORT');
    const beforeCount = beforeLogs.data.length;

    await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    const afterLogs = await apiRequest('GET', '/api/operation-logs?operationType=EXPORT');
    const afterCount = afterLogs.data.length;

    if (afterCount <= beforeCount) throw new Error('导出记录未增加到日志');
    console.log(`   日志数: ${beforeCount} -> ${afterCount}`);
  });

  await test('导出记录包含操作者信息', async () => {
    await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'reviewer_1'
    });

    const logs = await apiRequest('GET', '/api/operation-logs?operator=reviewer_1&operationType=EXPORT');
    const exportLogs = logs.data.filter(l => l.operationType === 'EXPORT');

    if (exportLogs.length === 0) throw new Error('未找到reviewer_1的导出日志');
    console.log(`   找到${exportLogs.length}条reviewer_1的导出日志`);
  });

  await test('不同角色日志隔离', async () => {
    await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'reviewer_1'
    });

    const supervisorLogs = await apiRequest('GET', '/api/operation-logs?operator=supervisor&operationType=EXPORT');
    const reviewerLogs = await apiRequest('GET', '/api/operation-logs?operator=reviewer_1&operationType=EXPORT');

    const supervisorExportCount = supervisorLogs.data.filter(l => l.operationType === 'EXPORT').length;
    const reviewerExportCount = reviewerLogs.data.filter(l => l.operationType === 'EXPORT').length;

    if (supervisorExportCount === 0) throw new Error('主管无导出日志');
    if (reviewerExportCount === 0) throw new Error('复核人无导出日志');
    console.log(`   主管: ${supervisorExportCount}条, 复核人: ${reviewerExportCount}条`);
  });

  // 5. 测试导出记录
  console.log('\n--- 导出记录测试 ---');

  await test('导出后生成导出记录', async () => {
    const beforeRes = await apiRequest('GET', '/api/exports');
    const beforeCount = beforeRes.data.length;

    await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    const afterRes = await apiRequest('GET', '/api/exports');
    const afterCount = afterRes.data.length;

    if (afterCount <= beforeCount) throw new Error('导出记录未增加');
    console.log(`   导出记录: ${beforeCount} -> ${afterCount}`);
  });

  await test('导出记录包含操作者', async () => {
    const exports = await apiRequest('GET', '/api/exports');
    const latestExport = exports.data[0];

    if (!latestExport.downloadedBy) throw new Error('导出记录无操作者');
    console.log(`   操作者: ${latestExport.downloadedBy}`);
  });

  // 6. 测试文件格式
  console.log('\n--- CSV格式验证 ---');

  await test('CSV文件使用UTF-8编码', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    const downloadRes = await downloadFile(res.data.filePath);
    const content = downloadRes.content.toString('utf-8');

    const hasBOM = content.charCodeAt(0) === 0xFEFF;
    if (!hasBOM) throw new Error('CSV缺少UTF-8 BOM');

    const csv = parseCSV(downloadRes.content);
    const headers = csv[0];

    if (!headers.includes('表计编号')) throw new Error('缺少表计编号列');
    if (!headers.includes('能源类型')) throw new Error('缺少能源类型列');
    if (!headers.includes('原始值')) throw new Error('缺少原始值列');

    console.log(`   表头: ${headers.join(', ')}`);
  });

  await test('默认文件名正确（.csv）', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      operator: 'supervisor'
    });

    const fileName = res.data.filePath.split('/').pop();
    if (!fileName.endsWith('.csv')) throw new Error(`文件名不是CSV: ${fileName}`);
    if (!fileName.startsWith('energy_detail_')) throw new Error(`文件名格式不正确: ${fileName}`);

    console.log(`   文件名: ${fileName}`);
  });

  // Summary
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
