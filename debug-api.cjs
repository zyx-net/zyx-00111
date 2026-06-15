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
          resolve({ data: json, status: res.statusCode, body: body });
        } catch {
          resolve({ data: body, status: res.statusCode, body: body });
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
  console.log('测试变更中心API...\n');

  console.log('1. 测试配置查询...');
  const configResult = await apiRequest('GET', '/api/change-orders/config');
  console.log('状态码:', configResult.status);
  console.log('返回数据:', JSON.stringify(configResult.data, null, 2));
  console.log();

  console.log('2. 测试创建变更单...');
  const createResult = await apiRequest('POST', '/api/change-orders', {
    title: '测试变更单',
    description: '这是一个测试',
    orderType: 'SCHEMA_CHANGE',
    datasetId: 'dataset_test',
    datasetName: '测试数据集',
    fieldChanges: [
      {
        fieldName: 'test_field',
        fieldLabel: '测试字段',
        previousValue: 'OLD',
        newValue: 'NEW',
        changeType: 'MODIFY'
      }
    ],
    effectiveTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'supervisor',
    priority: 'NORMAL',
    rollbackDescription: '测试回滚'
  });
  console.log('状态码:', createResult.status);
  console.log('返回数据:', JSON.stringify(createResult.data, null, 2));
  console.log();

  console.log('3. 测试查询变更单列表...');
  const listResult = await apiRequest('GET', '/api/change-orders?operator=supervisor');
  console.log('状态码:', listResult.status);
  console.log('返回数据:', JSON.stringify(listResult.data, null, 2));
}

test().then(() => {
  console.log('\n测试完成!');
  process.exit(0);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
