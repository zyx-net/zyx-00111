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

async function generateSampleData() {
  console.log('=== 生成离线交付包示例数据 ===\n');

  console.log('--- 导入测试数据 ---');

  const testReadings = [
    { meterId: 'ELEC_001', readingDate: '2026-06-01', rawValue: 1200, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_001', readingDate: '2026-06-02', rawValue: 1250, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_001', readingDate: '2026-06-03', rawValue: 1320, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_001', readingDate: '2026-06-04', rawValue: 1400, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_001', readingDate: '2026-06-05', rawValue: 1550, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_002', readingDate: '2026-06-01', rawValue: 800, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_002', readingDate: '2026-06-02', rawValue: 850, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_002', readingDate: '2026-06-03', rawValue: 920, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_002', readingDate: '2026-06-04', rawValue: 1000, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_002', readingDate: '2026-06-05', rawValue: 1080, meterType: 'ELECTRICITY' },
    { meterId: 'WATER_001', readingDate: '2026-06-01', rawValue: 200, meterType: 'WATER' },
    { meterId: 'WATER_001', readingDate: '2026-06-02', rawValue: 220, meterType: 'WATER' },
    { meterId: 'WATER_001', readingDate: '2026-06-03', rawValue: 250, meterType: 'WATER' },
    { meterId: 'WATER_001', readingDate: '2026-06-04', rawValue: 280, meterType: 'WATER' },
    { meterId: 'WATER_001', readingDate: '2026-06-05', rawValue: 300, meterType: 'WATER' },
    { meterId: 'WATER_002', readingDate: '2026-06-01', rawValue: 150, meterType: 'WATER' },
    { meterId: 'WATER_002', readingDate: '2026-06-02', rawValue: 165, meterType: 'WATER' },
    { meterId: 'WATER_002', readingDate: '2026-06-03', rawValue: 180, meterType: 'WATER' },
    { meterId: 'WATER_002', readingDate: '2026-06-04', rawValue: 195, meterType: 'WATER' },
    { meterId: 'WATER_002', readingDate: '2026-06-05', rawValue: 210, meterType: 'WATER' },
    { meterId: 'GAS_001', readingDate: '2026-06-01', rawValue: 100, meterType: 'GAS' },
    { meterId: 'GAS_001', readingDate: '2026-06-02', rawValue: 105, meterType: 'GAS' },
    { meterId: 'GAS_001', readingDate: '2026-06-03', rawValue: 112, meterType: 'GAS' },
    { meterId: 'GAS_001', readingDate: '2026-06-04', rawValue: 120, meterType: 'GAS' },
    { meterId: 'GAS_001', readingDate: '2026-06-05', rawValue: 128, meterType: 'GAS' },
    { meterId: 'ELEC_003', readingDate: '2026-06-10', rawValue: 1500, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_003', readingDate: '2026-06-11', rawValue: 1600, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_003', readingDate: '2026-06-12', rawValue: 1700, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_003', readingDate: '2026-06-13', rawValue: 1800, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_003', readingDate: '2026-06-14', rawValue: 1900, meterType: 'ELECTRICITY' },
    { meterId: 'ELEC_003', readingDate: '2026-06-15', rawValue: 2000, meterType: 'ELECTRICITY' },
    { meterId: 'WATER_003', readingDate: '2026-06-10', rawValue: 400, meterType: 'WATER' },
    { meterId: 'WATER_003', readingDate: '2026-06-11', rawValue: 420, meterType: 'WATER' },
    { meterId: 'WATER_003', readingDate: '2026-06-12', rawValue: 450, meterType: 'WATER' },
    { meterId: 'WATER_003', readingDate: '2026-06-13', rawValue: 480, meterType: 'WATER' },
    { meterId: 'WATER_003', readingDate: '2026-06-14', rawValue: 510, meterType: 'WATER' },
    { meterId: 'WATER_003', readingDate: '2026-06-15', rawValue: 540, meterType: 'WATER' },
    { meterId: 'GAS_002', readingDate: '2026-06-10', rawValue: 200, meterType: 'GAS' },
    { meterId: 'GAS_002', readingDate: '2026-06-11', rawValue: 210, meterType: 'GAS' },
    { meterId: 'GAS_002', readingDate: '2026-06-12', rawValue: 220, meterType: 'GAS' },
    { meterId: 'GAS_002', readingDate: '2026-06-13', rawValue: 230, meterType: 'GAS' },
    { meterId: 'GAS_002', readingDate: '2026-06-14', rawValue: 240, meterType: 'GAS' },
    { meterId: 'GAS_002', readingDate: '2026-06-15', rawValue: 250, meterType: 'GAS' },
  ];

  const importResult = await apiRequest('POST', '/api/batches', {
    readings: testReadings,
    importedBy: 'supervisor'
  });

  if (importResult.data.batchId) {
    console.log(`  ✓ 成功导入 ${testReadings.length} 条测试数据`);
    console.log(`    批次ID: ${importResult.data.batchId}`);
    console.log(`    批次号: ${importResult.data.batchNo}`);
    console.log(`    检测到 ${importResult.data.anomalyCount} 个异常`);
  } else {
    console.log('  ✗ 数据导入失败:', importResult.data.error);
  }

  console.log('\n--- 创建交付包 ---');

  const package1 = await apiRequest('POST', '/api/delivery-packages', {
    name: '2026年6月上旬交付包',
    description: '包含6月1日至15日的读数数据',
    operator: 'supervisor',
    filters: { dateFrom: '2026-06-01', dateTo: '2026-06-15' }
  });

  if (package1.data.success) {
    console.log(`  ✓ 创建交付包成功`);
    console.log(`    名称: ${package1.data.package.packageName}`);
    console.log(`    编号: ${package1.data.package.packageNo}`);
  }

  const package2 = await apiRequest('POST', '/api/delivery-packages', {
    name: '电表数据交付包',
    description: '仅包含电表读数数据',
    operator: 'reviewer_1',
    filters: { meterType: 'ELECTRICITY' }
  });

  if (package2.data.success) {
    console.log(`  ✓ 创建电表交付包成功`);
    console.log(`    名称: ${package2.data.package.packageName}`);
    console.log(`    创建人: ${package2.data.package.createdBy}`);
  }

  console.log('\n--- 查询交付包列表 ---');

  const packages = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
  console.log(`  主管可见 ${packages.data.length} 个交付包`);

  console.log('\n=== 示例数据生成完成 ===');
  console.log('\n您现在可以：');
  console.log('1. 访问 http://localhost:5173 进入系统');
  console.log('2. 点击左侧"离线交付包"菜单');
  console.log('3. 查看已创建的交付包');
  console.log('4. 为交付包添加记录并生成文件');
  console.log('5. 下载生成的交付包文件');
  console.log('\n测试用户：');
  console.log('- admin: 管理员角色');
  console.log('- supervisor: 主管角色');
  console.log('- reviewer_1: 复核员角色');
  console.log('- reviewer_2: 复核员角色');
}

generateSampleData().catch(err => {
  console.error('生成示例数据失败:', err);
  process.exit(1);
});
