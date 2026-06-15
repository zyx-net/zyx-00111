# 数据口径变更中心

## 概述

数据口径变更中心是一个完整的数据变更管理平台,用于管理业务数据口径变更的全生命周期。它提供了从变更申请、审批、执行到回滚的完整流程支持。

## 核心功能

### 1. 变更单管理

- **创建变更单**: 业务人员可以创建数据口径变更单
  - 选择受影响的数据集和字段
  - 填写变更详情和生效时间
  - 指定审批人和回滚说明
  
- **状态流转**: 完整的变更单状态机
  - `DRAFT` → 草稿状态,可编辑
  - `PENDING_APPROVAL` → 待审批
  - `APPROVED` → 已审批通过
  - `PENDING_EXECUTION` → 待执行(生效时间未到)
  - `EXECUTING` → 执行中
  - `COMPLETED` → 已完成
  - `REJECTED` → 已驳回
  - `WITHDRAWN` → 已撤回
  - `ROLLED_BACK` → 已回滚

### 2. 权限控制

系统实现了基于角色的权限控制:

| 角色 | 创建 | 审批 | 执行 | 回滚 | 查看日志 | 导出 |
|------|------|------|------|------|----------|------|
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| SUPERVISOR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| REVIEWER | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 3. 冲突检测

当提交变更单时,系统会自动检测是否存在时间窗口内的冲突变更:

- **冲突时间窗口**: 可配置(默认24小时)
- **冲突类型**: 同一数据集在相近时间有多个变更
- **冲突处理**: 
  - 阻止冲突变更单提交
  - 记录冲突历史
  - 提供冲突详情查看

### 4. 服务重启恢复

系统支持服务重启后自动恢复中断的任务:

- **待执行恢复**: 生效时间已到的变更单自动转为待执行
- **执行中恢复**: 超时(>5分钟)的执行中任务自动标记为完成
- **启动日志**: 恢复信息会在服务启动时输出

### 5. 版本管理

每个变更单都有完整的版本历史:

- 记录所有修改操作
- 保存字段变更的快照
- 支持查看历史版本

### 6. 审计日志

完整的操作审计追踪:

- 记录所有操作(创建、提交、审批、执行、回滚等)
- 包含操作人、时间和详情
- 按角色权限控制查看

### 7. 回滚保留

- **回滚说明**: 创建变更单时必须填写
- **保留时长**: 可配置(默认30天)
- **回滚历史**: 记录所有回滚操作

## 配置管理

系统提供可配置的参数:

```json
{
  "approval_roles": "ADMIN,SUPERVISOR",
  "conflict_time_window_hours": 24,
  "rollback_retention_days": 30,
  "auto_conflict_check": true,
  "require_rollback_description": true,
  "max_effective_delay_hours": 168
}
```

### 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| approval_roles | ADMIN,SUPERVISOR | 可审批变更单的角色 |
| conflict_time_window_hours | 24 | 冲突检测时间窗口(小时) |
| rollback_retention_days | 30 | 回滚数据保留天数 |
| auto_conflict_check | true | 是否自动检测冲突 |
| require_rollback_description | true | 是否必须填写回滚说明 |
| max_effective_delay_hours | 168 | 最大生效延迟时间(小时) |

## API 文档

### 变更单操作

#### 创建变更单
```
POST /api/change-orders
Content-Type: application/json

{
  "title": "变更单标题",
  "description": "变更描述",
  "orderType": "SCHEMA_CHANGE",
  "datasetId": "dataset_id",
  "datasetName": "数据集名称",
  "fieldChanges": [
    {
      "fieldName": "field_name",
      "fieldLabel": "字段标签",
      "previousValue": "原值",
      "newValue": "新值",
      "changeType": "MODIFY"
    }
  ],
  "effectiveTime": "2026-06-20T10:00:00.000Z",
  "createdBy": "supervisor",
  "priority": "NORMAL",
  "rollbackDescription": "回滚说明"
}
```

#### 查询变更单列表
```
GET /api/change-orders?operator=supervisor&status=PENDING_APPROVAL
```

#### 查询变更单详情
```
GET /api/change-orders/{id}?operator=supervisor
```

#### 提交变更单
```
POST /api/change-orders/{id}/submit
Content-Type: application/json

{
  "operator": "supervisor"
}
```

#### 审批变更单
```
POST /api/change-orders/{id}/approve
Content-Type: application/json

{
  "operator": "supervisor",
  "comment": "审批意见"
}
```

#### 驳回变更单
```
POST /api/change-orders/{id}/reject
Content-Type: application/json

{
  "operator": "supervisor",
  "comment": "驳回原因"
}
```

#### 执行变更单
```
POST /api/change-orders/{id}/execute
Content-Type: application/json

{
  "operator": "supervisor"
}
```

#### 撤回变更单
```
POST /api/change-orders/{id}/withdraw
Content-Type: application/json

{
  "operator": "supervisor",
  "reason": "撤回原因"
}
```

#### 回滚变更单
```
POST /api/change-orders/{id}/rollback
Content-Type: application/json

{
  "operator": "admin",
  "reason": "回滚原因"
}
```

### 其他接口

#### 冲突检测
```
POST /api/change-orders/check-conflicts
Content-Type: application/json

{
  "datasetId": "dataset_id",
  "effectiveTime": "2026-06-20T10:00:00.000Z"
}
```

#### 查询审计日志
```
GET /api/change-orders/{id}/audit-logs?operator=supervisor
```

#### 查询版本历史
```
GET /api/change-orders/{id}/versions?operator=supervisor
```

#### 查询冲突信息
```
GET /api/change-orders/{id}/conflicts?operator=supervisor
```

#### 查询待执行变更单
```
GET /api/change-orders/pending-execution?operator=supervisor
```

#### 导出变更单摘要
```
POST /api/change-orders/export-summary
Content-Type: application/json

{
  "operator": "supervisor"
}
```

#### 系统恢复
```
GET /api/change-orders/system/recovery?operator=admin
```

#### 查询配置
```
GET /api/change-orders/config
```

#### 更新配置
```
PUT /api/change-orders/config/{key}
Content-Type: application/json

{
  "value": "new_value",
  "operator": "admin"
}
```

## 使用流程

### 业务人员创建变更单

1. 登录系统,切换到"数据口径变更"页面
2. 点击"创建变更单"按钮
3. 填写变更单信息:
   - 标题和描述
   - 变更类型(Schema变更、数据迁移等)
   - 优先级
   - 数据集信息
   - 生效时间
   - 字段变更列表
   - 回滚说明
4. 点击"检测冲突"检查是否有冲突
5. 点击"创建"完成创建

### 提交变更单

1. 在变更单列表中找到草稿状态的变更单
2. 点击变更单查看详情
3. 确认信息无误后点击"提交变更单"
4. 状态将变为"待审批"

### 审批变更单

1. 主管或管理员登录系统
2. 在变更单列表中筛选"待审批"状态
3. 点击变更单查看详情
4. 填写审批意见
5. 选择"批准"或"驳回"

### 执行变更单

1. 已审批通过的变更单到达生效时间后
2. 主管或管理员点击"执行变更单"
3. 系统自动执行变更并记录执行历史
4. 状态变为"已完成"

### 回滚变更单

1. 对于已完成的变更单,如果需要回滚
2. 管理员点击"回滚变更单"
3. 填写回滚原因
4. 系统自动执行回滚操作
5. 状态变为"已回滚"

## 典型使用场景

### 场景1: 服务重启后恢复

**场景描述**: 服务在变更单执行过程中意外中断

**处理流程**:
1. 服务重启
2. 系统自动检测 `EXECUTING` 状态且执行时间超过5分钟的任务
3. 自动标记为 `COMPLETED`
4. 检测 `PENDING_EXECUTION` 状态且生效时间已到的任务
5. 自动转为 `APPROVED` 状态
6. 在启动日志中输出恢复信息

### 场景2: 冲突变更拦截

**场景描述**: 同一数据集在相近时间有多个变更需求

**处理流程**:
1. 用户创建变更单A,生效时间为 T
2. 用户创建变更单B,生效时间为 T+2小时
3. 在24小时冲突窗口内
4. 提交变更单B时系统检测到冲突
5. 阻止提交并提示冲突信息
6. 用户需要调整生效时间或取消冲突的变更单

## 测试

运行回归测试:

```bash
node test-change-center.cjs
```

测试覆盖:
- ✓ 创建变更单
- ✓ 状态流转
- ✓ 权限隔离
- ✓ 冲突检测
- ✓ 撤回功能
- ✓ 审计日志
- ✓ 版本历史
- ✓ 导出摘要
- ✓ 重启恢复

## 前端页面

访问路径: `/change-center`

功能:
- 变更单列表(支持状态筛选)
- 变更单详情查看
- 创建变更单表单
- 审批流程操作
- 冲突信息查看
- 审计日志查看
- 多角色切换

## 注意事项

1. **权限要求**: 
   - 只有 ADMIN 和 SUPERVISOR 可以审批和执行变更单
   - 只有 ADMIN 可以回滚和修改配置

2. **冲突检测**:
   - 默认时间窗口为24小时
   - 可在配置中调整

3. **回滚保留**:
   - 默认保留30天
   - 必须在创建时填写回滚说明

4. **生效时间**:
   - 可以设置未来的生效时间
   - 超过168小时(7天)的延迟需要特别确认

## 技术栈

- **后端**: Node.js, Express, SQL.js
- **前端**: React, TypeScript, Tailwind CSS
- **数据库**: SQLite (sql.js)
- **权限控制**: 基于角色的访问控制(RBAC)

## 开发者

本模块由 AI 代码助手 自动生成

## 版本

v1.0.0 - 初始版本
