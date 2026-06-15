const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001';

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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('========================================');
  console.log('筛选导出功能验证测试');
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

  // 1. 清理旧数据
  console.log('\n--- 清理旧数据 ---');

  await test('验证数据库为空状态', async () => {
    const batches = await apiRequest('GET', '/api/batches');
    const anomalies = await apiRequest('GET', '/api/anomalies');

    console.log(`   现有批次: ${batches.data.length}, 现有异常: ${anomalies.data.length}`);

    // 清理所有批次
    for (const batch of batches.data) {
      await apiRequest('DELETE', `/api/batches/${batch.id}`);
    }
  });

  await sleep(500);

  // 2. 数据准备 - 创建多个批次
  console.log('\n--- 数据准备 ---');

  let batch1Id, batch2Id;

  await test('导入第一批数据（包含跳变异常）', async () => {
    const readings = [
      { meterId: 'M001', readingDate: '2026-08-01', rawValue: 1000, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-08-02', rawValue: 1100, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-08-03', rawValue: 2500, meterType: 'ELECTRICITY' }, // 跳变异常
      { meterId: 'W001', readingDate: '2026-08-01', rawValue: 500, meterType: 'WATER' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}`);
    batch1Id = res.data.batchId;
    console.log(`   Batch 1 ID: ${batch1Id}, Anomalies: ${res.data.anomalyCount}`);
  });

  await sleep(300);

  await test('导入第二批数据（包含回退异常）', async () => {
    const readings = [
      { meterId: 'M002', readingDate: '2026-08-01', rawValue: 3000, meterType: 'ELECTRICITY' },
      { meterId: 'M002', readingDate: '2026-08-02', rawValue: 3100, meterType: 'ELECTRICITY' },
      { meterId: 'M002', readingDate: '2026-08-03', rawValue: 2800, meterType: 'ELECTRICITY' }, // 回退异常
      { meterId: 'W002', readingDate: '2026-08-01', rawValue: 800, meterType: 'WATER' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}`);
    batch2Id = res.data.batchId;
    console.log(`   Batch 2 ID: ${batch2Id}, Anomalies: ${res.data.anomalyCount}`);
  });

  await sleep(500);

  // 3. 验证初始异常状态
  console.log('\n--- 验证初始状态 ---');

  await test('初始待复核异常数量正确', async () => {
    const res = await apiRequest('GET', '/api/anomalies?status=PENDING');
    if (res.status !== 200) throw new Error(`查询失败: ${res.status}`);
    const count = res.data.length;
    if (count !== 2) throw new Error(`期望2个待复核异常，实际${count}`);
    console.log(`   待复核异常: ${count}`);
  });

  // 4. 处理部分异常
  console.log('\n--- 处理异常 ---');

  let jumpAnomalyId, rollbackAnomalyId;

  await test('处理跳变异常（标记为已修正）', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies?status=PENDING');
    const jump = anomalies.data.find(a => a.anomalyType === 'JUMP');
    if (!jump) throw new Error('未找到跳变异常');

    jumpAnomalyId = jump.id;
    const correctRes = await apiRequest('POST', `/api/anomalies/${jump.id}/correct`, {
      newValue: 1200,
      operator: 'reviewer_1',
      version: jump.currentVersion
    });
    if (correctRes.status !== 200) throw new Error(`修正失败: ${correctRes.status}`);
  });

  await sleep(200);

  await test('处理回退异常（标记为已忽略）', async () => {
    const anomalies = await apiRequest('GET', '/api/anomalies?status=PENDING');
    const rollback = anomalies.data.find(a => a.anomalyType === 'ROLLBACK');
    if (!rollback) throw new Error('未找到回退异常');

    rollbackAnomalyId = rollback.id;
    const ignoreRes = await apiRequest('POST', `/api/anomalies/${rollback.id}/ignore`, {
      operator: 'reviewer_1',
      remark: '数据异常，手动忽略'
    });
    if (ignoreRes.status !== 200) throw new Error(`忽略失败: ${ignoreRes.status}`);
  });

  await sleep(300);

  // 5. 验证状态分布
  console.log('\n--- 验证状态分布 ---');

  await test('验证异常状态分布正确', async () => {
    const pending = await apiRequest('GET', '/api/anomalies?status=PENDING');
    const corrected = await apiRequest('GET', '/api/anomalies?status=CORRECTED');
    const ignored = await apiRequest('GET', '/api/anomalies?status=IGNORED');

    console.log(`   待复核: ${pending.data.length}, 已修正: ${corrected.data.length}, 已忽略: ${ignored.data.length}`);

    if (pending.data.length !== 0) throw new Error(`期望0个待复核，实际${pending.data.length}`);
    if (corrected.data.length !== 1) throw new Error(`期望1个已修正，实际${corrected.data.length}`);
    if (ignored.data.length !== 1) throw new Error(`期望1个已忽略，实际${ignored.data.length}`);
  });

  // 6. 筛选导出测试
  console.log('\n--- 筛选导出测试 ---');

  await test('导出待复核异常（应有0条）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    if (csv.length === 0 || (csv.length === 1 && csv[0].length <= 1)) {
      console.log(`   导出记录数: 0 (空CSV)`);
      return;
    }

    const dataRows = csv.length - 1;

    if (dataRows !== 0) throw new Error(`期望0条数据，实际${dataRows}条`);
    console.log(`   导出记录数: ${dataRows}`);
  });

  await test('导出已修正异常（应有1条）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);
    const dataRows = csv.length - 1;

    if (dataRows !== 1) throw new Error(`期望1条数据，实际${dataRows}条`);
    console.log(`   导出记录数: ${dataRows}`);
  });

  await test('导出已忽略异常（应有1条）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'IGNORED' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);
    const dataRows = csv.length - 1;

    if (dataRows !== 1) throw new Error(`期望1条数据，实际${dataRows}条`);
    console.log(`   导出记录数: ${dataRows}`);
  });

  await test('导出跳变异常（应有1条）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { type: 'JUMP' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);
    const dataRows = csv.length - 1;

    if (dataRows !== 1) throw new Error(`期望1条数据，实际${dataRows}条`);
    console.log(`   导出记录数: ${dataRows}`);
  });

  await test('导出回退异常（应有1条）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { type: 'ROLLBACK' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);
    const dataRows = csv.length - 1;

    if (dataRows !== 1) throw new Error(`期望1条数据，实际${dataRows}条`);
    console.log(`   导出记录数: ${dataRows}`);
  });

  // 7. 批次隔离测试
  console.log('\n--- 批次隔离测试 ---');

  await test('按批次1筛选导出', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      batchId: batch1Id
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const str = downloadRes.content.toString('utf-8');

    // 检查是否只包含批次1的数据
    if (str.includes('M001') && !str.includes('M002')) {
      console.log(`   只包含批次1数据`);
    } else if (!str.includes('M001') && !str.includes('M002')) {
      console.log(`   无表计数据`);
    } else {
      throw new Error('混入了其他批次数据');
    }
  });

  await test('按批次2筛选导出', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {
      batchId: batch2Id
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);

    const downloadRes = await downloadFile(res.data.filePath);
    const str = downloadRes.content.toString('utf-8');

    // 检查是否只包含批次2的数据
    if (str.includes('M002') && !str.includes('M001')) {
      console.log(`   只包含批次2数据`);
    } else if (!str.includes('M001') && !str.includes('M002')) {
      console.log(`   无表计数据`);
    } else {
      throw new Error('混入了其他批次数据');
    }
  });

  // 8. 文件内容验证
  console.log('\n--- 文件内容验证 ---');

  await test('导出文件是CSV格式', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'supervisor'
    });

    const fileName = path.basename(res.data.filePath);
    if (!fileName.endsWith('.csv')) throw new Error(`不是CSV格式: ${fileName}`);
    console.log(`   文件名: ${fileName}`);
  });

  await test('CSV包含正确字段', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'supervisor'
    });

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    if (csv.length < 2) throw new Error('CSV格式错误');

    const headers = csv[0];
    const requiredFields = ['表计编号', '能源类型', '读数日期', '原始值', '异常类型', '异常状态'];

    for (const field of requiredFields) {
      if (!headers.includes(field)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }
    console.log(`   字段: ${headers.join(', ')}`);
  });

  await test('已修正异常的修正值正确', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'supervisor'
    });

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    if (csv.length < 2) throw new Error('CSV数据为空');

    const dataRow = csv[1];
    const headers = csv[0];

    const correctedValueIdx = headers.indexOf('修正值');
    const originalValueIdx = headers.indexOf('原始值');
    const anomalyTypeIdx = headers.indexOf('异常类型');

    if (correctedValueIdx === -1) throw new Error('缺少修正值字段');
    if (originalValueIdx === -1) throw new Error('缺少原始值字段');

    const correctedValue = dataRow[correctedValueIdx];
    const originalValue = dataRow[originalValueIdx];

    if (correctedValue === '1200' || correctedValue === '1,200') {
      console.log(`   修正值: ${correctedValue}`);
    } else {
      throw new Error(`修正值不正确: ${correctedValue}, 期望1200`);
    }
  });

  await test('已忽略异常的备注正确', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'IGNORED' },
      operator: 'supervisor'
    });

    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    if (csv.length < 2) throw new Error('CSV数据为空');

    const dataRow = csv[1];
    const headers = csv[0];
    const remarkIdx = headers.indexOf('备注');

    if (remarkIdx === -1) throw new Error('缺少备注字段');

    const remark = dataRow[remarkIdx];
    if (!remark.includes('手动忽略')) {
      throw new Error(`备注不正确: ${remark}`);
    }
    console.log(`   备注: ${remark}`);
  });

  // 9. 权限测试
  console.log('\n--- 权限测试 ---');

  await test('普通用户不能导出筛选结果（403）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'reviewer_1'
    });
    if (res.status !== 403) throw new Error(`期望403，实际${res.status}`);
  });

  await test('主管可以导出筛选结果（200）', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'CORRECTED' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
  });

  // Summary
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
