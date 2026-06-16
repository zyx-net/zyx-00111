const API_BASE = 'http://localhost:3001/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function importSampleBatches() {
  console.log('📥 开始导入示例批次数据...\n');
  
  const batch1Readings = [];
  const baseDate = new Date('2024-06-01');
  
  for (let day = 0; day < 10; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];
    
    batch1Readings.push({
      meterId: 'ELEC_001',
      readingDate: dateStr,
      rawValue: 1000 + day * 50 + Math.floor(Math.random() * 20),
      meterType: 'ELECTRICITY'
    });
    
    batch1Readings.push({
      meterId: 'WATER_001',
      readingDate: dateStr,
      rawValue: 200 + day * 10 + Math.floor(Math.random() * 5),
      meterType: 'WATER'
    });
    
    if (day === 5) {
      batch1Readings.push({
        meterId: 'ELEC_001',
        readingDate: dateStr,
        rawValue: 900 + day * 50,
        meterType: 'ELECTRICITY'
      });
    }
  }
  
  try {
    console.log('批次1: 常规能源计量数据 + 回退异常');
    const result1 = await apiRequest('POST', '/batches', {
      readings: batch1Readings,
      importedBy: 'admin'
    });
    console.log(`✅ 批次1导入成功: ${result1.batchNo}`);
    console.log(`   导入记录: ${result1.importedCount}`);
    console.log(`   检测异常: ${result1.anomalyCount}\n`);
  } catch (error) {
    console.error(`❌ 批次1导入失败: ${error.message}\n`);
  }
  
  await sleep(500);
  
  const batch2Readings = [];
  const baseDate2 = new Date('2024-06-15');
  
  for (let day = 0; day < 8; day++) {
    const date = new Date(baseDate2);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];
    
    batch2Readings.push({
      meterId: 'ELEC_002',
      readingDate: dateStr,
      rawValue: 2000 + day * 30 + Math.floor(Math.random() * 15),
      meterType: 'ELECTRICITY'
    });
    
    batch2Readings.push({
      meterId: 'GAS_001',
      readingDate: dateStr,
      rawValue: 500 + day * 8 + Math.floor(Math.random() * 4),
      meterType: 'GAS'
    });
  }
  
  try {
    console.log('批次2: 能源计量数据（含跳变异常）');
    const result2 = await apiRequest('POST', '/batches', {
      readings: batch2Readings,
      importedBy: 'supervisor'
    });
    console.log(`✅ 批次2导入成功: ${result2.batchNo}`);
    console.log(`   导入记录: ${result2.importedCount}`);
    console.log(`   检测异常: ${result2.anomalyCount}\n`);
  } catch (error) {
    console.error(`❌ 批次2导入失败: ${error.message}\n`);
  }
  
  await sleep(500);
  
  const batch3Readings = [];
  const baseDate3 = new Date('2024-06-20');
  
  for (let day = 0; day < 5; day++) {
    if (day === 2) continue;
    
    const date = new Date(baseDate3);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];
    
    batch3Readings.push({
      meterId: 'ELEC_003',
      readingDate: dateStr,
      rawValue: 3000 + day * 40,
      meterType: 'ELECTRICITY'
    });
  }
  
  try {
    console.log('批次3: 缺失检测数据（间隔超过3天）');
    const result3 = await apiRequest('POST', '/batches', {
      readings: batch3Readings,
      importedBy: 'reviewer_1'
    });
    console.log(`✅ 批次3导入成功: ${result3.batchNo}`);
    console.log(`   导入记录: ${result3.importedCount}`);
    console.log(`   检测异常: ${result3.anomalyCount}\n`);
  } catch (error) {
    console.error(`❌ 批次3导入失败: ${error.message}\n`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('示例批次数据导入完成！\n');
}

async function createSampleChangeOrders() {
  console.log('📝 开始创建示例变更单...\n');
  
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const changeOrder1 = {
    title: '能耗转换系数调整',
    description: '调整夏季能耗转换系数，提高计量精度',
    orderType: 'CALCULATION_RULE',
    datasetId: 'dataset_energy',
    datasetName: '能源计量数据集',
    priority: 'NORMAL',
    effectiveTime: tomorrow.toISOString(),
    fieldChanges: [
      {
        fieldName: 'conversion_rate',
        fieldLabel: '能耗转换系数',
        previousValue: '1.0',
        newValue: '1.05',
        changeType: 'MODIFY'
      },
      {
        fieldName: 'baseline_value',
        fieldLabel: '基准值',
        previousValue: '1000',
        newValue: '1050',
        changeType: 'MODIFY'
      }
    ],
    rollbackDescription: '将转换系数恢复到1.0，基准值恢复到1000',
    createdBy: 'admin'
  };
  
  try {
    console.log('变更单1: 能耗转换系数调整');
    const result1 = await apiRequest('POST', '/change-orders', changeOrder1);
    console.log(`✅ 变更单1创建成功: ${result1.orderNo}\n`);
    
    await apiRequest('POST', `/change-orders/${result1.id}/submit`, { operator: 'admin' });
    console.log(`   已提交变更单`);
    
    await apiRequest('POST', `/change-orders/${result1.id}/approve`, {
      operator: 'supervisor',
      comment: '调整方案合理，批准执行'
    });
    console.log(`   已审批通过\n`);
  } catch (error) {
    console.error(`❌ 变更单1创建失败: ${error.message}\n`);
  }
  
  await sleep(500);
  
  const changeOrder2 = {
    title: '新增计量字段',
    description: '为能源计量数据集添加新的计算字段',
    orderType: 'SCHEMA_CHANGE',
    datasetId: 'dataset_energy',
    datasetName: '能源计量数据集',
    priority: 'HIGH',
    effectiveTime: nextWeek.toISOString(),
    fieldChanges: [
      {
        fieldName: 'carbon_emission',
        fieldLabel: '碳排放量',
        previousValue: '',
        newValue: '新增字段',
        changeType: 'ADD'
      }
    ],
    rollbackDescription: '删除碳排放量字段',
    createdBy: 'supervisor'
  };
  
  try {
    console.log('变更单2: 新增计量字段');
    const result2 = await apiRequest('POST', '/change-orders', changeOrder2);
    console.log(`✅ 变更单2创建成功: ${result2.orderNo}\n`);
    
    await apiRequest('POST', `/change-orders/${result2.id}/submit`, { operator: 'supervisor' });
    console.log(`   已提交变更单\n`);
  } catch (error) {
    console.error(`❌ 变更单2创建失败: ${error.message}\n`);
  }
  
  await sleep(500);
  
  const changeOrder3 = {
    title: '水表计量规则优化',
    description: '优化水表计量规则，提高数据准确性',
    orderType: 'CALCULATION_RULE',
    datasetId: 'dataset_water',
    datasetName: '水资源数据集',
    priority: 'LOW',
    effectiveTime: nextWeek.toISOString(),
    fieldChanges: [
      {
        fieldName: 'pressure_factor',
        fieldLabel: '压力系数',
        previousValue: '1.0',
        newValue: '0.98',
        changeType: 'MODIFY'
      }
    ],
    rollbackDescription: '恢复压力系数为1.0',
    createdBy: 'admin'
  };
  
  try {
    console.log('变更单3: 水表计量规则优化');
    const result3 = await apiRequest('POST', '/change-orders', changeOrder3);
    console.log(`✅ 变更单3创建成功: ${result3.orderNo}\n`);
  } catch (error) {
    console.error(`❌ 变更单3创建失败: ${error.message}\n`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('示例变更单创建完成！\n');
}

async function createSampleConflictOrders() {
  console.log('⚠️ 开始创建冲突测试变更单...\n');
  
  const now = new Date();
  const conflictTime1 = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const conflictTime2 = new Date(now.getTime() + 14 * 60 * 60 * 1000);
  
  const conflictOrder1 = {
    title: '冲突测试变更单A',
    description: '用于测试冲突检测功能的变更单A',
    orderType: 'CALCULATION_RULE',
    datasetId: 'dataset_energy',
    datasetName: '能源计量数据集',
    priority: 'NORMAL',
    effectiveTime: conflictTime1.toISOString(),
    fieldChanges: [
      {
        fieldName: 'test_field_a',
        fieldLabel: '测试字段A',
        previousValue: '100',
        newValue: '110',
        changeType: 'MODIFY'
      }
    ],
    rollbackDescription: '恢复到100',
    createdBy: 'admin'
  };
  
  try {
    console.log(`变更单A: 冲突测试 (生效时间: ${conflictTime1.toLocaleString()})`);
    const result1 = await apiRequest('POST', '/change-orders', conflictOrder1);
    console.log(`✅ 变更单A创建成功: ${result1.orderNo}`);
    
    await apiRequest('POST', `/change-orders/${result1.id}/submit`, { operator: 'admin' });
    console.log(`   已提交变更单\n`);
    
    await sleep(500);
    
    const conflictOrder2 = {
      title: '冲突测试变更单B',
      description: '用于测试冲突检测功能的变更单B',
      orderType: 'CALCULATION_RULE',
      datasetId: 'dataset_energy',
      datasetName: '能源计量数据集',
      priority: 'NORMAL',
      effectiveTime: conflictTime2.toISOString(),
      fieldChanges: [
        {
          fieldName: 'test_field_b',
          fieldLabel: '测试字段B',
          previousValue: '200',
          newValue: '220',
          changeType: 'MODIFY'
        }
      ],
      rollbackDescription: '恢复到200',
      createdBy: 'admin'
    };
    
    console.log(`变更单B: 冲突测试 (生效时间: ${conflictTime2.toLocaleString()})`);
    const result2 = await apiRequest('POST', '/change-orders', conflictOrder2);
    console.log(`✅ 变更单B创建成功: ${result2.orderNo}`);
    
    await apiRequest('POST', `/change-orders/${result2.id}/submit`, { operator: 'admin' });
    console.log(`   已提交变更单\n`);
    
    console.log('📊 检测冲突...');
    const conflictCheck = await apiRequest('POST', '/change-orders/check-conflicts', {
      datasetId: 'dataset_energy',
      effectiveTime: conflictTime1.toISOString()
    });
    
    if (conflictCheck.isConflict) {
      console.log(`⚠️ 检测到 ${conflictCheck.conflicts.length} 个冲突:`);
      conflictCheck.conflicts.forEach(c => {
        console.log(`   - ${c.orderNo}: ${c.title} (状态: ${c.status})`);
      });
    } else {
      console.log('✅ 无冲突检测');
    }
  } catch (error) {
    console.error(`❌ 冲突测试变更单创建失败: ${error.message}\n`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('冲突测试数据创建完成！\n');
}

async function querySystemStatus() {
  console.log('📊 系统状态查询...\n');
  
  try {
    const batches = await apiRequest('GET', '/batches');
    console.log(`批次总数: ${batches.length}`);
    
    const anomalies = await apiRequest('GET', '/anomalies?status=PENDING');
    console.log(`待处理异常数: ${anomalies.length}`);
    
    const changeOrders = await apiRequest('GET', '/change-orders');
    console.log(`变更单总数: ${changeOrders.length}`);
    
    const pendingOrders = await apiRequest('GET', '/change-orders?status=PENDING_APPROVAL');
    console.log(`待审批变更单: ${pendingOrders.length}`);
    
    const configs = await apiRequest('GET', '/change-orders/config');
    console.log(`\n当前配置:`);
    configs.forEach(config => {
      if (['approval_roles', 'conflict_time_window_hours', 'require_rollback_description'].includes(config.configKey)) {
        console.log(`  - ${config.configKey}: ${config.configValue}`);
      }
    });
    
    console.log('\n');
  } catch (error) {
    console.error(`❌ 系统状态查询失败: ${error.message}\n`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     数据变更单治理台 - 示例数据导入脚本');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  try {
    console.log('🌐 检查服务器状态...');
    await apiRequest('GET', '/batches');
    console.log('✅ 服务器正常运行\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('步骤1: 导入示例批次数据');
    console.log('═══════════════════════════════════════════════════════════════');
    await importSampleBatches();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('步骤2: 创建示例变更单');
    console.log('═══════════════════════════════════════════════════════════════');
    await createSampleChangeOrders();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('步骤3: 创建冲突测试数据');
    console.log('═══════════════════════════════════════════════════════════════');
    await createSampleConflictOrders();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('步骤4: 系统状态汇总');
    console.log('═══════════════════════════════════════════════════════════════');
    await querySystemStatus();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ 示例数据导入完成！');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('提示:');
    console.log('1. 现在可以访问 http://localhost:5173 查看前端界面');
    console.log('2. 运行 "npm run test-change-center-complete" 测试完整链路');
    console.log('3. 变更单审批角色: ADMIN, SUPERVISOR');
    console.log('4. 冲突时间窗: 24小时 (可在配置中修改)');
    console.log('5. 回滚说明: 必填 (可在配置中修改)\n');
  } catch (error) {
    console.error('\n❌ 导入过程中发生错误:', error.message);
    console.error('请确保服务器正在运行: npm run dev\n');
  }
}

main().catch(console.error);
