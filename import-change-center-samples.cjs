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

async function importSampleData() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     数据口径变更中心示例数据导入                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const sampleOrders = [
    {
      title: '能源计量数据集 Schema 升级',
      description: '将 meter_id 字段长度从 VARCHAR(50) 扩展到 VARCHAR(100)，以适应新的表计编号规范',
      orderType: 'SCHEMA_CHANGE',
      datasetId: 'dataset_energy_metering',
      datasetName: '能源计量数据集',
      fieldChanges: [
        {
          fieldName: 'meter_id',
          fieldLabel: '表计编号',
          previousValue: 'VARCHAR(50)',
          newValue: 'VARCHAR(100)',
          changeType: 'MODIFY'
        },
        {
          fieldName: 'reading_timestamp',
          fieldLabel: '读数时间戳',
          previousValue: 'DATETIME',
          newValue: 'BIGINT',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor',
      priority: 'HIGH',
      rollbackDescription: '可通过 ALTER TABLE 语句回滚，将字段长度改回 VARCHAR(50)，数据类型改回 DATETIME'
    },
    {
      title: '水表数据计算规则变更',
      description: '调整水表数据的计算公式，从原来的 value * 1.1 改为 value * 1.05，以更准确地反映实际用水量',
      orderType: 'CALCULATION_RULE',
      datasetId: 'dataset_water_metering',
      datasetName: '水表计量数据集',
      fieldChanges: [
        {
          fieldName: 'calculation_formula',
          fieldLabel: '计算公式',
          previousValue: 'value * 1.1',
          newValue: 'value * 1.05',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'reviewer_1',
      priority: 'NORMAL',
      rollbackDescription: '可将计算公式改回 value * 1.1，并重新计算历史数据'
    },
    {
      title: '气表数据集新增字段',
      description: '在气表数据集中新增 pressure_correction 字段，用于记录压力校正系数',
      orderType: 'SCHEMA_CHANGE',
      datasetId: 'dataset_gas_metering',
      datasetName: '气表计量数据集',
      fieldChanges: [
        {
          fieldName: 'pressure_correction',
          fieldLabel: '压力校正系数',
          previousValue: '',
          newValue: 'DECIMAL(5,4)',
          changeType: 'ADD'
        },
        {
          fieldName: 'pressure_value',
          fieldLabel: '压力值',
          previousValue: 'DECIMAL(8,2)',
          newValue: 'DECIMAL(10,3)',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor',
      priority: 'LOW',
      rollbackDescription: '可删除 pressure_correction 字段，并将 pressure_value 改回 DECIMAL(8,2)'
    },
    {
      title: '多能源汇总数据集字段映射变更',
      description: '调整多能源汇总数据集中的字段映射关系，以适配新的数据源接口',
      orderType: 'FIELD_MAPPING',
      datasetId: 'dataset_multi_energy_summary',
      datasetName: '多能源汇总数据集',
      fieldChanges: [
        {
          fieldName: 'electricity_mapping',
          fieldLabel: '电力映射',
          previousValue: 'electricity_kwh',
          newValue: 'elec_reading',
          changeType: 'MODIFY'
        },
        {
          fieldName: 'water_mapping',
          fieldLabel: '水务映射',
          previousValue: 'water_cubic',
          newValue: 'water_reading',
          changeType: 'MODIFY'
        },
        {
          fieldName: 'gas_mapping',
          fieldLabel: '燃气映射',
          previousValue: 'gas_cubic',
          newValue: 'gas_reading',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'reviewer_1',
      priority: 'NORMAL',
      rollbackDescription: '可将字段映射关系改回原来的映射规则'
    },
    {
      title: '历史数据迁移 - 能耗计算精度提升',
      description: '将历史能耗数据的计算精度从 DECIMAL(10,2) 提升到 DECIMAL(14,6)，以支持更高精度的统计分析',
      orderType: 'DATA_MIGRATION',
      datasetId: 'dataset_energy_history',
      datasetName: '能源历史数据集',
      fieldChanges: [
        {
          fieldName: 'energy_value',
          fieldLabel: '能耗值',
          previousValue: 'DECIMAL(10,2)',
          newValue: 'DECIMAL(14,6)',
          changeType: 'MODIFY'
        },
        {
          fieldName: 'energy_unit',
          fieldLabel: '能耗单位',
          previousValue: 'kWh',
          newValue: 'MWh',
          changeType: 'MODIFY'
        }
      ],
      effectiveTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'supervisor',
      priority: 'URGENT',
      rollbackDescription: '需要保留原始精度数据备份，可通过备份数据恢复'
    }
  ];

  console.log('开始导入示例数据...\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sampleOrders.length; i++) {
    const order = sampleOrders[i];
    try {
      console.log(`导入示例 ${i + 1}/${sampleOrders.length}: ${order.title}`);
      
      const result = await apiRequest('POST', '/api/change-orders', order);
      
      if (result.data.success) {
        console.log(`  ✓ 成功创建变更单: ${result.data.order.orderNo}`);
        successCount++;
      } else {
        console.log(`  ✗ 失败: ${result.data.error}`);
        failCount++;
      }
      
      await sleep(100);
    } catch (err) {
      console.log(`  ✗ 错误: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  导入完成: ${successCount} 成功, ${failCount} 失败                         ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (successCount > 0) {
    console.log('\n导入的变更单状态均为"草稿(DRAFT)"，可在变更中心页面查看和管理。\n');
    console.log('建议操作流程:');
    console.log('1. 查看所有变更单状态');
    console.log('2. 提交需要审批的变更单');
    console.log('3. 使用主管账号审批');
    console.log('4. 执行已审批的变更单');
    console.log('5. 如需要可回滚已完成的变更单\n');
  }

  return { successCount, failCount };
}

importSampleData().then(result => {
  console.log('\n示例数据导入完成!');
  process.exit(result.failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
