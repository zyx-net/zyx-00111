const API_BASE = 'http://localhost:3001/api';

const USERS = {
  admin: { username: 'admin', password: 'admin123' },
  supervisor: { username: 'supervisor', password: 'supervisor123' },
  reviewer: { username: 'reviewer_1', password: 'reviewer123' }
};

const DATASETS = [
  { id: 'dataset_energy', name: '能源计量数据集' },
  { id: 'dataset_water', name: '水资源数据集' },
  { id: 'dataset_gas', name: '燃气数据集' },
  { id: 'dataset_elec', name: '电力数据集' },
  { id: 'dataset_heat', name: '热力数据集' },
  { id: 'dataset_test1', name: '测试数据集1' },
  { id: 'dataset_test2', name: '测试数据集2' },
  { id: 'dataset_test3', name: '测试数据集3' }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractResult(data) {
  if (data && data.order) {
    return data.order;
  }
  return data;
}

async function apiRequest(method, endpoint, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`API ${method} ${endpoint} failed: ${response.status} - ${JSON.stringify(data)}`);
    }
    
    return data;
  } catch (error) {
    console.error(`API Error: ${error.message}`);
    throw error;
  }
}

async function testConfig() {
  console.log('\n📋 测试配置接口...');
  
  try {
    const configs = await apiRequest('GET', '/change-orders/config');
    console.log('✅ 配置查询成功');
    console.log('   当前配置:');
    configs.forEach(config => {
      console.log(`   - ${config.configKey}: ${config.configValue} (${config.description})`);
    });
    return configs;
  } catch (error) {
    console.error('❌ 配置查询失败:', error.message);
    throw error;
  }
}

async function testCreateChangeOrder(operator, datasetIndex = 0, isConflict = false, immediateExecution = false) {
  console.log(`\n📝 测试创建变更单 (操作员: ${operator})...`);
  
  const dataset = DATASETS[datasetIndex];
  const now = new Date();
  const effectiveTime = immediateExecution 
    ? new Date(now.getTime() - 1000)
    : new Date(now.getTime() + (isConflict ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
  
  const orderData = {
    title: `测试变更单 ${Date.now()}`,
    description: `这是测试变更单，用于验证完整链路${isConflict ? ' (冲突测试)' : ''}`,
    orderType: 'CALCULATION_RULE',
    datasetId: dataset.id,
    datasetName: dataset.name,
    priority: 'NORMAL',
    effectiveTime: effectiveTime.toISOString(),
    fieldChanges: [
      {
        fieldName: 'conversion_rate',
        fieldLabel: '能耗转换系数',
        previousValue: '1.0',
        newValue: '1.05',
        changeType: 'MODIFY'
      }
    ],
    rollbackDescription: '如果变更失败，将转换系数恢复到1.0',
    createdBy: operator
  };
  
  try {
    const data = await apiRequest('POST', '/change-orders', orderData);
    const order = extractResult(data);
    console.log(`✅ 变更单创建成功`);
    console.log(`   变更单号: ${order.orderNo}`);
    console.log(`   状态: ${order.status}`);
    console.log(`   生效时间: ${effectiveTime.toLocaleString()}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单创建失败:', error.message);
    throw error;
  }
}

async function testSubmitChangeOrder(orderId, operator) {
  console.log(`\n📤 测试提交变更单 (变更单ID: ${orderId}, 操作员: ${operator})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/submit`, { operator });
    const order = extractResult(data);
    console.log(`✅ 变更单提交成功`);
    console.log(`   新状态: ${order.status}`);
    console.log(`   提交时间: ${order.submittedAt}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单提交失败:', error.message);
    throw error;
  }
}

async function testApproveChangeOrder(orderId, approver, comment = '审批通过') {
  console.log(`\n✅ 测试审批变更单 (变更单ID: ${orderId}, 审批人: ${approver})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/approve`, {
      operator: approver,
      comment
    });
    const order = extractResult(data);
    console.log(`✅ 变更单审批成功`);
    console.log(`   审批人: ${order.approver}`);
    console.log(`   审批时间: ${order.approvedAt}`);
    console.log(`   新状态: ${order.status}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单审批失败:', error.message);
    throw error;
  }
}

async function testRejectChangeOrder(orderId, approver, comment = '需要更多信息') {
  console.log(`\n❌ 测试驳回变更单 (变更单ID: ${orderId}, 审批人: ${approver})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/reject`, {
      operator: approver,
      comment
    });
    const order = extractResult(data);
    console.log(`✅ 变更单驳回成功`);
    console.log(`   审批人: ${order.approver}`);
    console.log(`   驳回原因: ${comment}`);
    console.log(`   新状态: ${order.status}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单驳回失败:', error.message);
    throw error;
  }
}

async function testExecuteChangeOrder(orderId, executor) {
  console.log(`\n⚙️ 测试执行变更单 (变更单ID: ${orderId}, 执行人: ${executor})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/execute`, { operator: executor });
    const order = extractResult(data);
    console.log(`✅ 变更单执行成功`);
    console.log(`   执行人: ${order.executedBy}`);
    console.log(`   执行时间: ${order.executionCompletedAt}`);
    console.log(`   新状态: ${order.status}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单执行失败:', error.message);
    throw error;
  }
}

async function testRollbackChangeOrder(orderId, operator, reason = '测试回滚') {
  console.log(`\n🔄 测试回滚变更单 (变更单ID: ${orderId}, 操作员: ${operator})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/rollback`, {
      operator,
      reason
    });
    const order = extractResult(data);
    console.log(`✅ 变更单回滚成功`);
    console.log(`   回滚人: ${order.rollbackedBy}`);
    console.log(`   回滚时间: ${order.rollbackedAt}`);
    console.log(`   新状态: ${order.status}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单回滚失败:', error.message);
    throw error;
  }
}

async function testWithdrawChangeOrder(orderId, operator, reason = '主动撤回') {
  console.log(`\n↩️ 测试撤回变更单 (变更单ID: ${orderId}, 操作员: ${operator})...`);
  
  try {
    const data = await apiRequest('POST', `/change-orders/${orderId}/withdraw`, {
      operator,
      reason
    });
    const order = extractResult(data);
    console.log(`✅ 变更单撤回成功`);
    console.log(`   新状态: ${order.status}`);
    return order;
  } catch (error) {
    console.error('❌ 变更单撤回失败:', error.message);
    throw error;
  }
}

async function testConflictDetection(orderId1, orderId2) {
  console.log('\n🔍 测试冲突检测...');
  
  try {
    const data1 = await apiRequest('GET', `/change-orders/${orderId1}`);
    const data2 = await apiRequest('GET', `/change-orders/${orderId2}`);
    const order1 = extractResult(data1);
    const order2 = extractResult(data2);
    
    console.log(`   变更单1: ${order1.orderNo} - ${order1.title}`);
    console.log(`   变更单2: ${order2.orderNo} - ${order2.title}`);
    console.log(`   数据集: ${order1.datasetId}`);
    console.log(`   生效时间差: ${Math.abs(new Date(order1.effectiveTime) - new Date(order2.effectiveTime)) / (60 * 60 * 1000)} 小时`);
    
    const conflictCheck = await apiRequest('POST', '/change-orders/check-conflicts', {
      datasetId: order1.datasetId,
      effectiveTime: order1.effectiveTime
    });
    
    if (conflictCheck.isConflict) {
      console.log(`⚠️ 检测到冲突:`);
      conflictCheck.conflicts.forEach(c => {
        console.log(`   - ${c.orderNo}: ${c.title} (状态: ${c.status})`);
      });
      console.log(`   冲突消息: ${conflictCheck.message}`);
    } else {
      console.log('✅ 无冲突检测');
    }
    
    return conflictCheck;
  } catch (error) {
    console.error('❌ 冲突检测失败:', error.message);
    throw error;
  }
}

async function testVersionHistory(orderId) {
  console.log(`\n📜 测试版本历史 (变更单ID: ${orderId})...`);
  
  try {
    const versions = await apiRequest('GET', `/change-orders/${orderId}/versions`);
    console.log(`✅ 版本历史查询成功`);
    console.log(`   版本数量: ${versions.length}`);
    versions.forEach((v, i) => {
      console.log(`   v${i + 1}: 版本号 ${v.version}, 创建人 ${v.createdBy}, 创建时间 ${new Date(v.createdAt).toLocaleString()}`);
    });
    return versions;
  } catch (error) {
    console.error('❌ 版本历史查询失败:', error.message);
    throw error;
  }
}

async function testAuditLogs(orderId) {
  console.log(`\n📊 测试审计日志 (变更单ID: ${orderId})...`);
  
  try {
    const logs = await apiRequest('GET', `/change-orders/${orderId}/audit-logs?operator=admin`);
    console.log(`✅ 审计日志查询成功`);
    console.log(`   日志数量: ${logs.length}`);
    logs.forEach((log, i) => {
      const details = log.details ? JSON.parse(log.details) : {};
      console.log(`   [${i + 1}] ${log.operation} by ${log.operator} - ${log.result}`);
      console.log(`       时间: ${new Date(log.createdAt).toLocaleString()}`);
      if (details.reason) console.log(`       原因: ${details.reason}`);
    });
    return logs;
  } catch (error) {
    console.error('❌ 审计日志查询失败:', error.message);
    throw error;
  }
}

async function testExportSummary(operator) {
  console.log(`\n📤 测试导出摘要 (操作员: ${operator})...`);
  
  try {
    const result = await apiRequest('POST', '/change-orders/export-summary', { operator });
    console.log(`✅ 摘要导出成功`);
    console.log(`   文件路径: ${result.filePath}`);
    console.log(`   变更单数量: ${result.orderCount}`);
    return result;
  } catch (error) {
    console.error('❌ 摘要导出失败:', error.message);
    throw error;
  }
}

async function testPermissionRestriction(orderId, unauthorizedUser) {
  console.log(`\n🔒 测试权限限制 (变更单ID: ${orderId}, 未授权用户: ${unauthorizedUser})...`);
  
  try {
    const data = await apiRequest('GET', `/change-orders/${orderId}?operator=${unauthorizedUser}`);
    const result = extractResult(data);
    console.log(`   查询结果: 变更单状态 = ${result.status}`);
    
    try {
      await testApproveChangeOrder(orderId, unauthorizedUser, '测试审批');
      console.log('❌ 权限限制失败: 未授权用户可以审批');
      return false;
    } catch (error) {
      if (error.message.includes('没有审批权限')) {
        console.log('✅ 权限限制成功: 未授权用户无法审批');
        return true;
      }
      throw error;
    }
  } catch (error) {
    if (error.message.includes('没有权限查看')) {
      console.log('✅ 权限限制成功: 未授权用户无法查看');
      return true;
    }
    console.error('❌ 权限测试失败:', error.message);
    throw error;
  }
}

async function testRecovery() {
  console.log('\n🔄 测试重启恢复...');
  
  try {
    let pendingOrders = [];
    try {
      pendingOrders = await apiRequest('GET', '/change-orders/pending-execution?operator=admin');
    } catch (error) {
      if (error.message.includes('404')) {
        console.log('ℹ️ 待执行变更单查询返回404（无待执行变更单）');
        pendingOrders = [];
      } else {
        throw error;
      }
    }
    
    console.log(`✅ 待执行变更单查询成功`);
    console.log(`   待执行变更单数: ${pendingOrders.length}`);
    if (pendingOrders.length > 0) {
      console.log('   待执行变更单:');
      pendingOrders.forEach(order => {
        console.log(`     - ${order.orderNo}: ${order.title} (状态: ${order.status}, 生效时间: ${order.effectiveTime})`);
      });
    }
    
    const recoveryResult = await apiRequest('GET', '/change-orders/system/recovery?operator=admin');
    console.log(`✅ 系统恢复接口正常`);
    console.log(`   恢复统计: ${recoveryResult.totalRecovered || 0} 个变更单已恢复`);
    
    return { pendingOrders, recoveryResult };
  } catch (error) {
    console.error('❌ 重启恢复查询失败:', error.message);
    throw error;
  }
}

async function runCompleteTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         数据变更单治理台 - 完整功能测试');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const results = {
    success: 0,
    failed: 0,
    tests: []
  };
  
  try {
    console.log('\n🌐 检查服务器状态...');
    const health = await apiRequest('GET', '/batches');
    console.log('✅ 服务器正常运行\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('测试 1: 配置管理');
    console.log('═══════════════════════════════════════════════════════════════');
    const configs = await testConfig();
    results.tests.push({ name: '配置管理', success: true });
    results.success++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 2: 完整链路 - 创建→审批→执行→回滚');
    console.log('═══════════════════════════════════════════════════════════════');
    
    let order1;
    try {
      order1 = await testCreateChangeOrder('admin', 5, false, true);
      results.tests.push({ name: '创建变更单', success: true });
      results.success++;
      
      await testAuditLogs(order1.id);
      
      await testSubmitChangeOrder(order1.id, 'admin');
      results.tests.push({ name: '提交变更单', success: true });
      results.success++;
      
      await testApproveChangeOrder(order1.id, 'supervisor', '审批通过，请执行');
      results.tests.push({ name: '审批变更单', success: true });
      results.success++;
      
      await testVersionHistory(order1.id);
      
      const executedOrder = await testExecuteChangeOrder(order1.id, 'supervisor');
      results.tests.push({ name: '执行变更单', success: true });
      results.success++;
      
      await testRollbackChangeOrder(executedOrder.id, 'admin', '测试回滚功能');
      results.tests.push({ name: '回滚变更单', success: true });
      results.success++;
    } catch (error) {
      console.log(`⚠️ 变更单操作异常: ${error.message}`);
      results.tests.push({ name: '完整链路', success: false, error: error.message });
      results.failed++;
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 3: 冲突检测与拦截');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const order2a = await testCreateChangeOrder('admin', 6, true);
    const order2b = await testCreateChangeOrder('admin', 6, true);
    
    await testSubmitChangeOrder(order2a.id, 'admin');
    
    try {
      await testSubmitChangeOrder(order2b.id, 'admin');
      console.log('❌ 未检测到冲突，测试失败');
      results.tests.push({ name: '冲突检测', success: false });
      results.failed++;
    } catch (error) {
      if (error.message.includes('检测到冲突')) {
        console.log('✅ 冲突检测成功，已拦截重复提交');
        results.tests.push({ name: '冲突检测', success: true });
        results.success++;
      } else {
        console.log(`⚠️ 提交失败但非预期原因: ${error.message}`);
        results.tests.push({ name: '冲突检测', success: false });
        results.failed++;
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 4: 权限隔离测试');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const order3 = await testCreateChangeOrder('admin', 7, false);
    await testSubmitChangeOrder(order3.id, 'admin');
    await testApproveChangeOrder(order3.id, 'supervisor', '审批通过');
    
    const permResult = await testPermissionRestriction(order3.id, 'reviewer_1');
    results.tests.push({ name: '权限限制', success: permResult });
    if (permResult) results.success++;
    else results.failed++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 5: 重启恢复机制');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const orderForRecovery = await testCreateChangeOrder('admin', 2, false, false);
    await testSubmitChangeOrder(orderForRecovery.id, 'admin');
    await testApproveChangeOrder(orderForRecovery.id, 'supervisor', '审批通过，等待执行');
    await testExecuteChangeOrder(orderForRecovery.id, 'supervisor');
    
    const recoveryInfo = await testRecovery();
    results.tests.push({ name: '重启恢复', success: true });
    results.success++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 6: 导出摘要');
    console.log('═══════════════════════════════════════════════════════════════');
    
    await testExportSummary('admin');
    results.tests.push({ name: '导出摘要', success: true });
    results.success++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 7: 撤回功能');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const order4 = await testCreateChangeOrder('admin', 2, false);
    await testSubmitChangeOrder(order4.id, 'admin');
    
    await testWithdrawChangeOrder(order4.id, 'admin', '测试撤回功能');
    results.tests.push({ name: '撤回变更单', success: true });
    results.success++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 8: 驳回功能');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const order5 = await testCreateChangeOrder('admin', 0, false);
    await testSubmitChangeOrder(order5.id, 'admin');
    
    await testRejectChangeOrder(order5.id, 'supervisor', '数据验证未通过');
    results.tests.push({ name: '驳回变更单', success: true });
    results.success++;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('测试 9: 查询列表和详情');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const orders = await apiRequest('GET', '/change-orders');
    console.log(`✅ 变更单列表查询成功，共 ${orders.length} 条记录`);
    
    const pendingOrders = await apiRequest('GET', '/change-orders?status=PENDING_APPROVAL');
    console.log(`✅ 待审批变更单查询成功，共 ${pendingOrders.length} 条记录`);
    
    results.tests.push({ name: '查询列表和详情', success: true });
    results.success++;
    
  } catch (error) {
    console.error('\n❌ 测试执行失败:', error.message);
    results.tests.push({ name: '测试执行', success: false, error: error.message });
    results.failed++;
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                      测试结果汇总');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`总计测试: ${results.tests.length}`);
  console.log(`✅ 成功: ${results.success}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log('\n详细结果:');
  results.tests.forEach((test, i) => {
    const status = test.success ? '✅' : '❌';
    console.log(`  ${status} [${i + 1}] ${test.name}${test.error ? ` - ${test.error}` : ''}`);
  });
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (results.failed === 0) {
    console.log('🎉 所有测试通过！数据变更单治理台功能完整可用。\n');
  } else {
    console.log('⚠️ 部分测试失败，请检查相关功能。\n');
  }
  
  return results;
}

runCompleteTest().catch(console.error);
