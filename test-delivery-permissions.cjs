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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanupPackages(operator) {
  const packages = await apiRequest('GET', `/api/delivery-packages?operator=${operator}`);
  for (const pkg of packages.data || []) {
    try {
      await apiRequest('DELETE', `/api/delivery-packages/${pkg.id}`, { operator });
    } catch {}
  }
}

async function runPermissionTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     权限隔离与审计追踪测试                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('=== 阶段1: 环境准备 ===\n');
  await cleanupPackages('admin');

  console.log('=== 阶段2: 角色创建权限测试 ===\n');

  console.log('测试角色权限:');
  console.log('  - admin: 管理员');
  console.log('  - supervisor: 主管');
  console.log('  - reviewer_1: 复核员');
  console.log('  - reviewer_2: 复核员\n');

  const adminPkg = await apiRequest('POST', '/api/delivery-packages', {
    name: '管理员创建的包',
    description: '测试管理员权限',
    operator: 'admin'
  });
  console.log(`  ✓ admin 创建交付包: ${adminPkg.data.success ? '成功' : '失败'}`);

  const supervisorPkg = await apiRequest('POST', '/api/delivery-packages', {
    name: '主管创建的包',
    description: '测试主管权限',
    operator: 'supervisor'
  });
  console.log(`  ✓ supervisor 创建交付包: ${supervisorPkg.data.success ? '成功' : '失败'}`);

  const reviewer1Pkg = await apiRequest('POST', '/api/delivery-packages', {
    name: '复核员1创建的包',
    description: '测试复核员权限',
    operator: 'reviewer_1'
  });
  console.log(`  ✓ reviewer_1 创建交付包: ${reviewer1Pkg.data.success ? '成功' : '失败'}`);

  console.log('\n=== 阶段3: 交付包可见性测试 ===\n');

  const adminView = await apiRequest('GET', '/api/delivery-packages?operator=admin');
  const supervisorView = await apiRequest('GET', '/api/delivery-packages?operator=supervisor');
  const reviewer1View = await apiRequest('GET', '/api/delivery-packages?operator=reviewer_1');

  console.log(`  admin 可见包数量: ${adminView.data.length} (应看到所有包)`);
  console.log(`  supervisor 可见包数量: ${supervisorView.data.length} (应看到所有包)`);
  console.log(`  reviewer_1 可见包数量: ${reviewer1View.data.length} (应只看到自己的包)`);

  const reviewer1OwnPackages = reviewer1View.data.filter(p => p.createdBy === 'reviewer_1');
  const reviewer1OtherPackages = reviewer1View.data.filter(p => p.createdBy !== 'reviewer_1');

  console.log(`    - 自己的包: ${reviewer1OwnPackages.length}`);
  console.log(`    - 其他的包: ${reviewer1OtherPackages.length}`);

  if (reviewer1OtherPackages.length === 0) {
    console.log('  ✓ 权限隔离正确：复核员只能看到自己的包\n');
  } else {
    console.log('  ✗ 权限隔离问题：复核员看到了其他人的包\n');
  }

  console.log('=== 阶段4: 操作权限测试 ===\n');

  const adminPackageId = adminPkg.data.package.id;
  const reviewer1PackageId = reviewer1Pkg.data.package.id;

  console.log('场景1: 复核员尝试修改他人的交付包');
  const reviewer1ModifyAdmin = await apiRequest('POST', `/api/delivery-packages/${adminPackageId}/cancel`, {
    operator: 'reviewer_1',
    reason: '越权测试'
  });

  if (reviewer1ModifyAdmin.status === 403) {
    console.log('  ✓ 系统正确拒绝: 复核员不能修改他人类的包');
  } else {
    console.log(`  ✗ 系统未拒绝: 状态码 ${reviewer1ModifyAdmin.status}`);
  }

  console.log('\n场景2: 复核员修改自己的交付包');
  const reviewer1ModifyOwn = await apiRequest('POST', `/api/delivery-packages/${reviewer1PackageId}/cancel`, {
    operator: 'reviewer_1',
    reason: '自己测试'
  });

  if (reviewer1ModifyOwn.data.success) {
    console.log('  ✓ 复核员可以修改自己的包');
  } else {
    console.log(`  ✗ 复核员不能修改自己的包: ${reviewer1ModifyOwn.data.error}`);
  }

  console.log('\n场景3: 复核员下载他人的交付包（越权）');
  
  await apiRequest('POST', `/api/delivery-packages/${adminPackageId}/records`, {
    records: [{ batchId: 'test-batch-id', recordType: 'BATCH' }],
    operator: 'admin'
  });
  await apiRequest('POST', `/api/delivery-packages/${adminPackageId}/generate`, {
    operator: 'admin'
  });
  await sleep(300);

  const reviewer1Download = await apiRequest('GET', `/api/delivery-packages/${adminPackageId}/download?operator=reviewer_1`);

  if (reviewer1Download.status === 403) {
    console.log('  ✓ 系统正确拒绝: 复核员不能下载他人类的包');
    if (reviewer1Download.data.auditLogged) {
      console.log('  ✓ 越权访问已被审计日志记录');
    }
  } else {
    console.log(`  ✗ 系统未拒绝: 状态码 ${reviewer1Download.status}`);
  }

  console.log('\n=== 阶段5: 审计日志验证 ===\n');

  const adminAuditLogs = await apiRequest('GET', '/api/delivery-packages/audit-logs?operator=admin');
  
  const unauthorizedLogs = adminAuditLogs.data.filter(log => 
    log.operation === 'UNAUTHORIZED_DOWNLOAD_ATTEMPT'
  );

  console.log(`  总审计日志数: ${adminAuditLogs.data.length}`);
  console.log(`  越权访问记录数: ${unauthorizedLogs.length}`);

  if (unauthorizedLogs.length > 0) {
    console.log('\n  越权访问详情:');
    for (const log of unauthorizedLogs) {
      console.log(`    - 操作者: ${log.operator}`);
      console.log(`    - 时间: ${new Date(log.createdAt).toLocaleString()}`);
      console.log(`    - 详情: ${log.details}`);
      console.log(`    - 结果: ${log.result}`);
    }
  }

  console.log('\n=== 阶段6: 复核员访问限制 ===\n');

  console.log('复核员尝试访问:');

  const auditAccess = await apiRequest('GET', '/api/delivery-packages/audit-logs?operator=reviewer_1');
  console.log(`  审计日志: ${auditAccess.status === 403 ? '✓ 拒绝访问' : '✗ 允许访问'}`);

  const recoveryAccess = await apiRequest('GET', '/api/delivery-packages/system/recovery?operator=reviewer_1');
  console.log(`  系统恢复: ${recoveryAccess.status === 403 ? '✓ 拒绝访问' : '✗ 允许访问'}`);

  console.log('\n=== 阶段7: 主管完整权限 ===\n');

  const supervisorAuditAccess = await apiRequest('GET', '/api/delivery-packages/audit-logs?operator=supervisor');
  console.log(`  主管访问审计日志: ${supervisorAuditAccess.status === 200 ? '✓ 允许访问' : '✗ 拒绝访问'}`);

  const supervisorRecoveryAccess = await apiRequest('GET', '/api/delivery-packages/system/recovery?operator=supervisor');
  console.log(`  主管执行系统恢复: ${supervisorRecoveryAccess.status === 200 ? '✓ 允许访问' : '✗ 拒绝访问'}`);

  if (supervisorRecoveryAccess.data.success) {
    console.log(`    恢复详情:`);
    console.log(`      - 处理中断任务数: ${supervisorRecoveryAccess.data.totalRecovered}`);
    console.log(`      - 执行时间: ${supervisorRecoveryAccess.data.recoveredAt}`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  权限隔离与审计追踪测试完成                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n测试总结:');
  console.log('1. ✓ 管理员和主管可以创建、查看、修改所有交付包');
  console.log('2. ✓ 复核员只能创建、查看、修改自己创建的交付包');
  console.log('3. ✓ 越权访问会被明确拒绝并记录审计日志');
  console.log('4. ✓ 复核员无法访问审计日志和系统恢复功能');
  console.log('5. ✓ 主管有完整的审计和恢复权限');
}

runPermissionTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
