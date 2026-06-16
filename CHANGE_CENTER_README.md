# 数据变更单治理台

## 概述

数据变更单治理台是一个完整的数据变更管理平台，提供从创建、审批、执行、撤销到追溯的全生命周期管理。系统支持版本历史、冲突检测与拦截、服务重启恢复、权限隔离等企业级功能。

### 核心特性

- ✅ **完整链路**：创建 → 提交 → 审批 → 执行 → 回滚
- ✅ **版本历史**：记录变更单的所有版本，支持回滚到历史版本
- ✅ **冲突检测**：同一数据集在冲突时间窗内出现多张变更单时自动拦截并记录
- ✅ **重启恢复**：服务重启后自动恢复待执行和执行中的变更单
- ✅ **权限隔离**：基于角色的权限控制，确保用户只能操作有权限的变更单
- ✅ **配置灵活**：审批角色、冲突时间窗、回滚说明要求等均可配置
- ✅ **审计日志**：完整的操作日志，支持追溯和审计

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm run dev
```

这将同时启动：
- 前端开发服务器：http://localhost:5173
- 后端 API 服务器：http://localhost:3001

### 导入示例数据

```bash
node import-change-center-samples.cjs
```

这将创建：
- 3个示例批次数据（含异常检测）
- 3个示例变更单
- 2个冲突测试变更单

### 运行完整测试

```bash
node test-change-center-complete.cjs
```

## 功能说明

### 1. 变更单状态流转

```
┌─────────┐    提交    ┌──────────────────┐    审批    ┌──────────┐
│  草稿   │ ─────────> │   待审批(PENDING) │ ─────────> │  已审批  │
│ (DRAFT) │             │   _APPROVAL      │            │(APPROVED)│
└─────────┘             └──────────────────┘            └──────────┘
      │                        │                              │
      │ 撤回                  │ 驳回                          │ 执行
      v                       v                               v
┌──────────┐            ┌──────────┐                   ┌──────────────────┐
│ 已撤回   │            │  已驳回  │                   │   待执行(PENDING) │
│(WITHDRAWN)            │(REJECTED)│                   │   _EXECUTION     │
└──────────┘            └──────────┘                   └──────────────────┘
                                                           │
                                                           │ 时间到达
                                                           v
                                                       ┌──────────┐
                                                       │ 已完成   │
                                                       │(COMPLETED)│
                                                       └──────────┘
                                                           │
                                                           │ 回滚
                                                           v
                                                       ┌────────────┐
                                                       │ 已回滚     │
                                                       │(ROLLED_BACK)│
                                                       └────────────┘
```

### 2. 变更单操作权限

| 角色 | 创建 | 提交 | 审批 | 执行 | 撤回 | 回滚 | 删除 |
|------|------|------|------|------|------|------|------|
| 管理员 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 主管 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 复核员 | ✓ | ✓ | ✗ | ✗ | 仅自己的 | ✗ | 仅草稿 |

### 3. 冲突检测机制

系统在同一数据集的冲突时间窗（默认24小时）内检测到多张变更单时：
1. 提交时会拦截并提示冲突
2. 冲突记录保存到 `change_order_conflicts` 表
3. 可以在详情页查看冲突变更单列表

### 4. 重启恢复机制

服务启动时自动执行以下恢复操作：
1. **待执行变更单**：检查生效时间，如果已到达则自动执行
2. **执行中变更单**：检查执行超时（5分钟），超时则标记为已完成

## API 接口

### 变更单管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/change-orders` | 创建变更单 |
| GET | `/api/change-orders` | 查询变更单列表 |
| GET | `/api/change-orders/:id` | 查询变更单详情 |
| PUT | `/api/change-orders/:id` | 更新变更单 |
| DELETE | `/api/change-orders/:id` | 删除变更单 |
| POST | `/api/change-orders/:id/submit` | 提交变更单 |
| POST | `/api/change-orders/:id/approve` | 审批通过 |
| POST | `/api/change-orders/:id/reject` | 驳回变更单 |
| POST | `/api/change-orders/:id/execute` | 执行变更单 |
| POST | `/api/change-orders/:id/withdraw` | 撤回变更单 |
| POST | `/api/change-orders/:id/rollback` | 回滚变更单 |

### 版本与历史

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/change-orders/:id/versions` | 查询版本历史 |
| GET | `/api/change-orders/:id/audit-logs` | 查询审计日志 |
| GET | `/api/change-orders/:id/execution-history` | 查询执行历史 |
| GET | `/api/change-orders/:id/conflicts` | 查询冲突记录 |

### 冲突检测

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/change-orders/check-conflicts` | 检测冲突 |
| GET | `/api/change-orders/pending-execution` | 查询待执行变更单 |
| GET | `/api/change-orders/system/recovery` | 系统恢复（仅管理员） |

### 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/change-orders/config` | 查询所有配置 |
| GET | `/api/change-orders/config/:key` | 查询单个配置 |
| PUT | `/api/change-orders/config/:key` | 更新配置（仅管理员） |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/change-orders/export-summary` | 导出变更单摘要 |

## 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| approval_roles | ADMIN,SUPERVISOR | 可审批变更单的角色列表 |
| conflict_time_window_hours | 24 | 冲突检测时间窗口（小时） |
| rollback_retention_days | 30 | 回滚数据保留天数 |
| auto_conflict_check | true | 是否自动检测冲突 |
| require_rollback_description | true | 是否必须填写回滚说明 |
| max_effective_delay_hours | 168 | 最大生效延迟时间（小时） |

## 数据库表结构

### 核心表

- `change_orders` - 变更单主表
- `change_order_audit_logs` - 审计日志表
- `change_order_versions` - 版本历史表
- `change_order_conflicts` - 冲突记录表
- `change_order_execution_history` - 执行历史表
- `change_order_config` - 配置表

### 索引

- `idx_change_orders_status` - 按状态查询
- `idx_change_orders_dataset` - 按数据集查询
- `idx_change_orders_created_by` - 按创建人查询
- `idx_change_orders_effective_time` - 按生效时间查询

## 测试验证

### 验证场景

1. **创建 → 审批 → 执行 → 回滚**
   ```bash
   node test-change-center-complete.cjs
   ```

2. **冲突检测与拦截**
   ```bash
   # 导入冲突测试数据
   node import-change-center-samples.cjs
   
   # 查看冲突检测
   # 同一数据集在24小时内出现两张变更单时会被拦截
   ```

3. **权限隔离测试**
   ```bash
   # 使用不同角色用户测试权限限制
   # 复核员无法审批变更单
   # 用户只能撤回自己创建的变更单
   ```

4. **重启恢复测试**
   ```bash
   # 1. 创建待执行的变更单（生效时间设置为未来某个时间）
   # 2. 停止服务器 (Ctrl+C)
   # 3. 等待生效时间到达
   # 4. 重新启动服务器
   # 5. 检查变更单状态是否自动变为"已完成"
   ```

### 测试用例

完整的测试脚本会验证以下场景：

| 测试编号 | 测试场景 | 预期结果 |
|---------|---------|---------|
| T1 | 配置查询 | 返回所有配置项 |
| T2 | 创建变更单 | 创建成功，返回变更单号 |
| T3 | 提交变更单 | 状态变为待审批 |
| T4 | 审批通过 | 状态变为已审批 |
| T5 | 执行变更单 | 状态变为已完成 |
| T6 | 回滚变更单 | 状态变为已回滚 |
| T7 | 撤回变更单 | 状态变为已撤回 |
| T8 | 驳回变更单 | 状态变为已驳回 |
| T9 | 冲突检测 | 检测到冲突变更单 |
| T10 | 权限限制 | 未授权用户无法审批 |
| T11 | 重启恢复 | 待执行变更单自动执行 |
| T12 | 导出摘要 | 生成CSV文件 |

## 前端使用说明

### 页面导航

1. **数据口径变更中心** - 管理和追踪数据口径变更的全生命周期
2. **变更单列表** - 查看所有变更单，支持状态筛选
3. **变更单详情** - 查看详情、执行操作、查看审计日志
4. **创建变更单** - 填写变更单信息并提交

### 操作流程

#### 创建变更单

1. 点击"创建变更单"按钮
2. 填写基本信息：
   - 标题（必填）
   - 描述（可选）
   - 变更类型
   - 优先级
3. 填写数据集信息：
   - 数据集ID（必填）
   - 数据集名称（必填）
4. 设置生效时间
5. 添加字段变更（至少一条）
6. 填写回滚说明（必填）
7. 点击"创建"

#### 审批变更单

1. 在列表中选择状态为"待审批"的变更单
2. 查看变更单详情
3. 填写审批意见
4. 点击"批准"或"驳回"

#### 执行变更单

1. 确认变更单状态为"已审批"或"待执行"
2. 点击"执行变更单"
3. 系统自动记录执行历史

#### 回滚变更单

1. 选择状态为"已完成"的变更单
2. 填写回滚原因（必填）
3. 点击"回滚变更单"

## 项目结构

```
├── api/                          # 后端 API
│   ├── server.ts                # Express 服务器
│   ├── database.ts              # 数据库初始化
│   ├── changeOrderService.ts    # 变更单业务逻辑
│   ├── types.ts                # 类型定义
│   └── ...
├── src/                         # 前端代码
│   ├── pages/
│   │   ├── ChangeCenter.tsx    # 变更单治理台页面
│   │   └── ...
│   └── ...
├── test-change-center-complete.cjs  # 完整测试脚本
├── import-change-center-samples.cjs   # 示例数据导入脚本
├── data/                       # SQLite 数据库文件
└── exports/                    # 导出文件目录
```

## 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS
- **后端**：Express + sql.js (SQLite)
- **构建**：Vite

## 注意事项

1. **数据持久化**：所有数据存储在 `data/energy_review.db` 文件中
2. **冲突检测**：仅在同一数据集的冲突时间窗内生效
3. **权限控制**：严格遵循角色权限，禁止越权操作
4. **版本管理**：每次变更操作都会创建版本快照
5. **审计追踪**：所有操作都有完整的日志记录

## 常见问题

### Q: 变更单提交时提示冲突怎么办？

A: 这是系统的正常行为。同一数据集在冲突时间窗（默认24小时）内只能有一张变更单。您可以：
1. 调整生效时间，避开冲突时间窗
2. 等待已存在的变更单执行完成
3. 联系管理员处理冲突记录

### Q: 服务重启后待执行的变更单会自动执行吗？

A: 是的。服务启动时会自动检查待执行的变更单，如果生效时间已到达，会自动执行。

### Q: 如何修改审批角色？

A: 通过配置管理接口修改 `approval_roles` 配置项：
```bash
curl -X PUT http://localhost:3001/api/change-orders/config/approval_roles \
  -H "Content-Type: application/json" \
  -d '{"value": "ADMIN,SUPERVISOR,REVIEWER", "operator": "admin"}'
```

### Q: 回滚后可以恢复吗？

A: 是的，可以再次执行变更单。但需要注意，回滚操作本身会记录到执行历史和审计日志中。

## 许可证

MIT License
