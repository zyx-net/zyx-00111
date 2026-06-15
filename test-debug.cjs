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
        console.log(`  [${res.statusCode}] ${body.substring(0, 200)}`);
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
  console.log('=== 调试测试 ===\n');

  const testReadings = [
    { meterId: 'TEST_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
  ];

  console.log('1. 导入测试数据...');
  const batch = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'admin'
  });
  console.log(`   batchId: ${batch.data.batchId || '无'}\n`);

  console.log('2. 创建交付包 (admin)...');
  const pkg = await apiRequest('POST', '/api/delivery-packages', {
    name: '测试交付包',
    description: '基础功能测试',
    operator: 'admin'
  });
  console.log(`   success: ${pkg.data.success}`);
  console.log(`   package.id: ${pkg.data.package?.id || '无'}`);
  console.log(`   error: ${pkg.data.error || '无'}\n`);
}

test().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
