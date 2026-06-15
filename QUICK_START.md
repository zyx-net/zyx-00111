# 数据口径变更中心 - 快速上手指南

## 一、启动服务

### 1. 编译后端代码
```bash
cd d:\workSpace\AI__SPACE\zyx-00111
npm run build:server
```

### 2. 启动后端服务器
```bash
node dist/api/server.js
```
服务器将运行在 http://localhost:3001

### 3. 启动前端开发服务器
```bash
npm run client:dev
```
前端将运行在 http://localhost:5173

### 4. 访问变更中心
在浏览器中打开: http://localhost:5173/change-center

## 二、快速测试

### 测试1: 创建并执行一个完整的变更单

1. **创建变更单**
   - 在变更中心页面,点击"创建变更单"
   - 填写表单:
     - 标题: "能源数据集Schema升级"
     - 描述: "扩展meter_id字段长度"
     - 变更类型: Schema变更
     - 数据集ID: dataset_energy_001
     - 数据集名称: 能源计量数据集
     - 生效时间: 明天或更晚的时间
     - 优先级: 普通
     - 字段变更: 
       - 字段名: meter_id
       - 字段标签: 表计编号
       - 变更类型: 修改
       - 原值: VARCHAR(50)
       - 新值: VARCHAR(100)
     - 回滚说明: 可通过ALTER TABLE改回VARCHAR(50)
   - 点击"创建"

2. **提交变更单**
   - 在列表中找到刚创建的变更单(状态为"草稿")
   - 点击变更单查看详情
   - 点击"提交变更单"
   - 状态将变为"待审批"

3. **审批变更单**
   - 使用主管或管理员身份(在页面右上角切换用户)
   - 在列表中找到"待审批"状态的变更单
   - 点击变更单查看详情
   - 填写审批意见
   - 点击"批准"
   - 状态将变为"已审批"

4. **执行变更单**
   - 当生效时间到达后(如果是未来时间)
   - 点击"执行变更单"
   - 状态将变为"已完成"
   - 执行历史将被记录

5. **回滚变更单(可选)**
   - 对于已完成的变更单
   - 填写回滚原因
   - 点击"回滚变更单"
   - 状态将变为"已回滚"

### 测试2: 冲突检测

1. **创建第一个变更单**
   - 数据集ID: dataset_test_conflict
   - 生效时间: 今天某个时间

2. **创建第二个冲突变更单**
   - 使用相同的数据集ID
   - 生效时间设置为第一个变更单的24小时之内

3. **提交第二个变更单**
   - 系统应该检测到冲突
   - 阻止提交并提示冲突信息

### 测试3: 多角色权限

1. **使用业务人员账号创建变更单**
   - 切换到 reviewer_1 或 supervisor
   - 创建变更单并提交

2. **切换到复核员账号**
   - 尝试审批业务人员提交的变更单
   - 应该可以批准或驳回

3. **测试权限限制**
   - 复核员应该能够查看和操作自己创建的变更单
   - 复核员不应该能查看其他人的所有变更单

## 三、运行自动化测试

### 导入示例数据
```bash
node import-change-center-samples.cjs
```
这将创建5个示例变更单。

### 运行回归测试
```bash
node test-change-center.cjs
```
运行完整的回归测试套件。

### 运行核心功能测试
```bash
node test-change-center-simple.cjs
```
运行简化版的核心功能测试。

## 四、配置管理

### 查看配置
1. 通过API: `GET /api/change-orders/config`
2. 或在前端页面查看(需要管理员权限)

### 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| approval_roles | ADMIN,SUPERVISOR | 可审批变更单的角色 |
| conflict_time_window_hours | 24 | 冲突检测时间窗口(小时) |
| rollback_retention_days | 30 | 回滚数据保留天数 |
| auto_conflict_check | true | 是否自动检测冲突 |
| require_rollback_description | true | 是否必须填写回滚说明 |
| max_effective_delay_hours | 168 | 最大生效延迟时间(小时) |

### 修改配置
```bash
curl -X PUT http://localhost:3001/api/change-orders/config/conflict_time_window_hours \
  -H "Content-Type: application/json" \
  -d '{"value": "48", "operator": "admin"}'
```

## 五、故障排除

### 数据库问题
**问题**: 测试失败,提示"变更单不存在"

**解决方案**:
1. 停止服务器
2. 删除 `data/energy_review.db`
3. 重启服务器

### 端口被占用
**问题**: "Port 3001 is already in use"

**解决方案**:
1. 查找占用端口的进程: `netstat -ano | findstr :3001`
2. 结束进程: `taskkill /PID <pid> /F`
3. 或使用其他端口

### 编译错误
**问题**: TypeScript编译失败

**解决方案**:
```bash
npm run build:server
```

## 六、API测试工具

可以使用curl测试API:

```bash
# 创建变更单
curl -X POST http://localhost:3001/api/change-orders \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试变更",
    "orderType": "SCHEMA_CHANGE",
    "datasetId": "test_dataset",
    "datasetName": "测试数据集",
    "fieldChanges": [{"fieldName": "field1", "fieldLabel": "字段1", "previousValue": "old", "newValue": "new", "changeType": "MODIFY"}],
    "effectiveTime": "2026-06-25T10:00:00.000Z",
    "createdBy": "supervisor"
  }'

# 查询变更单
curl http://localhost:3001/api/change-orders?operator=supervisor

# 提交变更单(替换 {id} 为实际ID)
curl -X POST http://localhost:3001/api/change-orders/{id}/submit \
  -H "Content-Type: application/json" \
  -d '{"operator": "supervisor"}'

# 审批变更单
curl -X POST http://localhost:3001/api/change-orders/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"operator": "supervisor", "comment": "同意"}'

# 执行变更单
curl -X POST http://localhost:3001/api/change-orders/{id}/execute \
  -H "Content-Type: application/json" \
  -d '{"operator": "supervisor"}'
```

## 七、数据库表结构

### 主要表

1. **change_orders** - 变更单主表
2. **change_order_audit_logs** - 审计日志表
3. **change_order_versions** - 版本历史表
4. **change_order_conflicts** - 冲突记录表
5. **change_order_execution_history** - 执行历史表
6. **change_order_config** - 配置表

详细表结构请参考 `api/database.ts` 中的 `createChangeCenterTables` 函数。

## 八、性能考虑

- 数据库使用SQLite,适合中小规模数据
- 冲突检测使用时间窗口过滤,性能良好
- 审计日志记录所有操作,建议定期清理历史数据
- 执行历史根据 `rollback_retention_days` 配置自动管理

## 九、常见用例

### 用例1: Schema变更
场景: 需要修改数据表的字段定义
- 变更类型: SCHEMA_CHANGE
- 添加字段变更记录
- 填写详细的回滚说明

### 用例2: 计算规则变更
场景: 需要调整数据计算逻辑
- 变更类型: CALCULATION_RULE
- 记录旧规则和新规则
- 确保回滚后可恢复

### 用例3: 数据迁移
场景: 需要迁移或转换数据
- 变更类型: DATA_MIGRATION
- 详细记录迁移前后数据格式
- 保留原始数据备份说明

## 十、后续功能

已实现的功能:
- ✓ 变更单全生命周期管理
- ✓ 状态流转
- ✓ 权限控制
- ✓ 冲突检测
- ✓ 审计日志
- ✓ 服务重启恢复
- ✓ 版本管理
- ✓ 配置管理

可能的后续功能:
- 邮件通知
- Webhook集成
- 更多数据源支持
- 变更单模板
- 批量操作
- 变更单统计报表

## 十一、帮助与支持

如有问题:
1. 查看服务器日志
2. 参考 `CHANGE_CENTER_README.md`
3. 查看 `TEST_RESULTS.md`
4. 运行测试脚本验证功能

祝使用愉快!
