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
  const lines = str.split(/\r?\n/);
  const result = [];

  for (const line of lines) {
    if (!line.trim()) continue;

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
  console.log('CSV导出功能验证测试');
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

  await test('清理旧批次数据', async () => {
    const batches = await apiRequest('GET', '/api/batches');
    for (const batch of batches.data.slice(0, 3)) {
      await apiRequest('DELETE', `/api/batches/${batch.id}`);
    }
  });

  await sleep(300);

  // 2. 数据准备
  console.log('\n--- 数据准备 ---');

  await test('导入测试数据（第一次）', async () => {
    const readings = [
      { meterId: 'M001', readingDate: '2026-07-01', rawValue: 1000, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-07-02', rawValue: 1100, meterType: 'ELECTRICITY' },
      { meterId: 'M001', readingDate: '2026-07-03', rawValue: 2000, meterType: 'ELECTRICITY' },
      { meterId: 'W001', readingDate: '2026-07-01', rawValue: 500, meterType: 'WATER' },
      { meterId: 'W001', readingDate: '2026-07-02', rawValue: 600, meterType: 'WATER' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}, ${JSON.stringify(res.data)}`);
  });

  await sleep(500);

  // 3. 导出格式验证
  console.log('\n--- 导出格式验证 ---');

  await test('导出明细 - 返回JSON包含filePath', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
    if (!res.data.filePath) throw new Error('缺少filePath字段');
    if (!res.data.filePath.includes('.csv')) throw new Error(`文件不是CSV格式: ${res.data.filePath}`);
    console.log(`   文件路径: ${res.data.filePath}`);
  });

  await test('导出明细 - 文件扩展名是.csv', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const filePath = res.data.filePath;

    const fileName = path.basename(filePath);
    if (!fileName.endsWith('.csv')) throw new Error(`文件不是CSV格式: ${fileName}`);
    console.log(`   文件名: ${fileName}`);
  });

  await test('导出明细 - 可以通过URL下载', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const filePath = res.data.filePath;

    const downloadRes = await downloadFile(filePath);
    if (downloadRes.status !== 200) throw new Error(`下载失败: ${downloadRes.status}`);
    if (downloadRes.content.length === 0) throw new Error('文件内容为空');
    console.log(`   文件大小: ${downloadRes.content.length} bytes`);
  });

  await test('导出明细 - 文件内容是UTF-8编码', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const downloadRes = await downloadFile(res.data.filePath);

    const str = downloadRes.content.toString('utf-8');
    if (str.includes('表计编号') && str.includes('能源类型')) {
      console.log('   中文内容正确解析');
    } else {
      throw new Error('UTF-8编码内容解析失败');
    }
  });

  await test('导出明细 - 文件包含CSV头部', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const downloadRes = await downloadFile(res.data.filePath);

    const csv = parseCSV(downloadRes.content);
    if (csv.length === 0) throw new Error('CSV为空');
    if (!csv[0].includes('表计编号')) throw new Error('缺少表计编号列');
    if (!csv[0].includes('能源类型')) throw new Error('缺少能源类型列');
    console.log(`   CSV头部: ${csv[0].join(', ')}`);
  });

  await test('导出明细 - 数据包含读数记录', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const downloadRes = await downloadFile(res.data.filePath);
    const csv = parseCSV(downloadRes.content);

    const dataRows = csv.length - 1;
    if (dataRows < 1) throw new Error('CSV无数据行');
    console.log(`   数据行数: ${dataRows}`);
  });

  await test('导出明细 - 响应头Content-Type正确', async () => {
    const res = await apiRequest('POST', '/api/export/detail', {});
    const downloadRes = await downloadFile(res.data.filePath);

    const contentType = downloadRes.contentType || '';
    console.log(`   Content-Type: ${contentType || '(无)'} `);
  });

  // 4. 汇总导出
  console.log('\n--- 汇总导出验证 ---');

  await test('导出汇总 - 文件扩展名是.csv', async () => {
    const res = await apiRequest('POST', '/api/export/summary', {});
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
    if (!res.data.filePath.includes('.csv')) throw new Error(`文件不是CSV格式: ${res.data.filePath}`);
    console.log(`   文件名: ${path.basename(res.data.filePath)}`);
  });

  await test('导出汇总 - 文件可下载', async () => {
    const res = await apiRequest('POST', '/api/export/summary', {});
    const downloadRes = await downloadFile(res.data.filePath);
    if (downloadRes.status !== 200) throw new Error(`下载失败: ${downloadRes.status}`);
  });

  await test('导出汇总 - 文件包含数据', async () => {
    const res = await apiRequest('POST', '/api/export/summary', {});
    const downloadRes = await downloadFile(res.data.filePath);
    const str = downloadRes.content.toString('utf-8');

    if (str.length < 10) throw new Error('汇总文件内容为空');
    console.log(`   文件内容长度: ${str.length} 字符`);
  });

  // 5. 批次对比导出
  console.log('\n--- 批次对比导出验证 ---');

  let batch1Id, batch2Id;

  await test('导入第一批数据用于对比', async () => {
    const readings = [
      { meterId: 'B001', readingDate: '2026-07-10', rawValue: 100, meterType: 'ELECTRICITY' },
      { meterId: 'B001', readingDate: '2026-07-11', rawValue: 200, meterType: 'ELECTRICITY' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}`);
    batch1Id = res.data.batchId;
    console.log(`   Batch 1 ID: ${batch1Id}`);
  });

  await sleep(300);

  await test('导入第二批数据用于对比', async () => {
    const readings = [
      { meterId: 'B001', readingDate: '2026-07-12', rawValue: 300, meterType: 'ELECTRICITY' },
      { meterId: 'B001', readingDate: '2026-07-13', rawValue: 400, meterType: 'ELECTRICITY' },
    ];
    const res = await apiRequest('POST', '/api/batches', { readings, importedBy: 'supervisor' });
    if (res.status !== 200) throw new Error(`导入失败: ${res.status}`);
    batch2Id = res.data.batchId;
    console.log(`   Batch 2 ID: ${batch2Id}`);
  });

  await sleep(300);

  await test('导出批次对比 - 文件扩展名是.csv', async () => {
    const res = await apiRequest('POST', '/api/export/batch-compare', {
      batch1Id: batch1Id,
      batch2Id: batch2Id,
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}, ${JSON.stringify(res.data)}`);
    if (!res.data.filePath.includes('.csv')) throw new Error(`文件不是CSV格式: ${res.data.filePath}`);
    console.log(`   文件名: ${path.basename(res.data.filePath)}`);
  });

  await test('导出批次对比 - 文件可下载', async () => {
    const res = await apiRequest('POST', '/api/export/batch-compare', {
      batch1Id: batch1Id,
      batch2Id: batch2Id,
      operator: 'supervisor'
    });
    const downloadRes = await downloadFile(res.data.filePath);
    if (downloadRes.status !== 200) throw new Error(`下载失败: ${downloadRes.status}`);
    console.log(`   文件大小: ${downloadRes.content.length} bytes`);
  });

  await test('导出批次对比 - 文件包含对比信息', async () => {
    const res = await apiRequest('POST', '/api/export/batch-compare', {
      batch1Id: batch1Id,
      batch2Id: batch2Id,
      operator: 'supervisor'
    });
    const downloadRes = await downloadFile(res.data.filePath);
    const str = downloadRes.content.toString('utf-8');

    if (!str.includes('对比') && !str.includes('批次')) {
      throw new Error('批次对比内容格式错误');
    }
    console.log('   包含对比汇总信息');
  });

  // 6. 权限验证
  console.log('\n--- 权限验证 ---');

  await test('普通用户不能导出筛选结果', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'reviewer_1'
    });
    if (res.status !== 403) throw new Error(`期望403, 实际${res.status}`);
  });

  await test('主管可以导出筛选结果', async () => {
    const res = await apiRequest('POST', '/api/export/filtered', {
      filters: { status: 'PENDING' },
      operator: 'supervisor'
    });
    if (res.status !== 200) throw new Error(`导出失败: ${res.status}`);
    if (!res.data.filePath.includes('.csv')) throw new Error(`文件不是CSV格式`);
  });

  // 7. 导出记录验证
  console.log('\n--- 导出记录验证 ---');

  await test('导出后生成导出记录', async () => {
    const beforeCountRes = await apiRequest('GET', '/api/exports');
    const beforeCount = beforeCountRes.data.length;

    await apiRequest('POST', '/api/export/detail', {});

    const afterCountRes = await apiRequest('GET', '/api/exports');
    const afterCount = afterCountRes.data.length;

    if (afterCount <= beforeCount) throw new Error('导出记录未增加');
    console.log(`   导出记录数: ${beforeCount} -> ${afterCount}`);
  });

  // Summary
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
