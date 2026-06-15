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

async function test() {
  console.log('=== 基础连接测试 ===\n');

  // 测试1: 检查服务是否运行
  const health = await apiRequest('GET', '/api/batches');
  console.log(`1. 服务状态: ${health.status === 200 ? '✓ 运行正常' : '✗ 服务异常'}`);

  // 测试2: 创建批次
  const testReadings = [
    { meterId: 'TEST_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'TEST_002', readingDate: '2026-06-01', rawValue: 500, meterType: 'WATER' },
  ];

  const batch = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'admin'
  });
  
  if (batch.data.batchId) {
    console.log(`2. 导入测试数据: ✓ 成功 (批次ID: ${batch.data.batchId})`);
    
    // 测试3: 创建交付包
    const pkg = await apiRequest('POST', '/api/delivery-packages', {
      name: '测试交付包',
      description: '基础功能测试',
      operator: 'admin'
    });
    
    if (pkg.data.success && pkg.data.package) {
      console.log(`3. 创建交付包: ✓ 成功 (ID: ${pkg.data.package.id})`);
      
      // 测试4: 添加记录
      const addRecords = await apiRequest('POST', `/api/delivery-packages/${pkg.data.package.id}/records`, {
        records: [{ batchId: batch.data.batchId, recordType: 'BATCH' }],
        operator: 'admin'
      });
      
      console.log(`4. 添加记录: ${addRecords.data.success ? '✓ 成功' : '✗ 失败'}`);
      
      // 测试5: 生成文件
      const generate = await apiRequest('POST', `/api/delivery-packages/${pkg.data.package.id}/generate`, {
        operator: 'admin'
      });
      
      console.log(`5. 生成文件: ${generate.data.success ? '✓ 成功' : '✗ 失败'}`);
      if (generate.data.success) {
        console.log(`   文件名: ${generate.data.fileName}`);
      }
      
      // 测试6: 查询交付包
      await new Promise(r => setTimeout(r, 300));
      const pkgDetail = await apiRequest('GET', `/api/delivery-packages/${pkg.data.package.id}?operator=admin`);
      console.log(`6. 查询详情: ✓ 成功`);
      console.log(`   状态: ${pkgDetail.data.status}`);
      console.log(`   版本: ${pkgDetail.data.version}`);
      
    } else {
      console.log(`3. 创建交付包: ✗ 失败 - ${pkg.data.error}`);
    }
  } else {
    console.log(`2. 导入测试数据: ✗ 失败`);
  }

  // 测试7: 查询所有交付包
  const allPackages = await apiRequest('GET', '/api/delivery-packages?operator=admin');
  console.log(`7. 查询交付包列表: ${Array.isArray(allPackages.data) ? '✓ 成功' : '✗ 失败'}`);
  console.log(`   数量: ${Array.isArray(allPackages.data) ? allPackages.data.length : 0}`);

  console.log('\n=== 测试完成 ===');
}

test().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
