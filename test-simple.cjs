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
        console.log(`  [${res.statusCode}] ${body.substring(0, 300)}`);
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

async function test() {
  console.log('=== 检查数据 ===\n');

  // 查看现有批次
  const batches = await apiRequest('GET', '/api/batches');
  console.log(`1. 现有批次数量: ${Array.isArray(batches.data) ? batches.data.length : 0}`);

  // 使用唯一的meter ID
  const uniqueId = `TEST_${Date.now()}`;
  const testReadings = [
    { meterId: uniqueId, readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
  ];

  console.log(`\n2. 导入测试数据 (meterId: ${uniqueId})...`);
  const batch = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'admin'
  });

  if (batch.data.batchId) {
    console.log(`\n3. 创建交付包...`);
    const pkg = await apiRequest('POST', '/api/delivery-packages', {
      name: '测试交付包',
      description: '基础功能测试',
      operator: 'admin'
    });

    if (pkg.data.success && pkg.data.package) {
      console.log(`   ✓ 成功 (ID: ${pkg.data.package.id})`);

      console.log(`\n4. 添加记录...`);
      const addRecords = await apiRequest('POST', `/api/delivery-packages/${pkg.data.package.id}/records`, {
        records: [{ batchId: batch.data.batchId, recordType: 'BATCH' }],
        operator: 'admin'
      });
      console.log(`   ${addRecords.data.success ? '✓ 成功' : '✗ 失败'}`);

      console.log(`\n5. 生成文件...`);
      const generate = await apiRequest('POST', `/api/delivery-packages/${pkg.data.package.id}/generate`, {
        operator: 'admin'
      });
      console.log(`   ${generate.data.success ? '✓ 成功' : '✗ 失败'}`);
      if (generate.data.fileName) {
        console.log(`   文件名: ${generate.data.fileName}`);
      }
    } else {
      console.log(`   ✗ 失败: ${pkg.data.error}`);
    }
  } else {
    console.log(`   ✗ 失败: ${batch.data.error || batch.data.message}`);
  }

  console.log('\n=== 测试完成 ===');
}

test().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
