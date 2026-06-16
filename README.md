# 能源计量数据异常复核与修正系统

园区能耗抄表异常复核与修正台，处理每天导入的水电气读数，自动识别异常并支持复核修正。

## 功能特性

- **数据导入**：支持Excel/CSV格式批量导入水、电，气三类读数
- **异常识别**：自动检测跳变、缺失、回退等异常
- **复核修正**：支持修正、忽略、撤销操作，保留完整历史记录
- **规则配置**：阈值配置支持版本管理，可回滚到历史版本
- **数据导出**：支持明细导出和汇总报表导出（CSV格式）
- **离线交付包**：筛选记录打包成带清单的交付包，异步生成可下载文件
- **冲突检测**：多用户并发操作时版本冲突检测
- **数据持久化**：SQLite本地存储，系统重启后数据一致
- **完整审计**：所有操作留痕，支持权限隔离和越权访问检测
- **数据发布工单中心**：完整的申请、审批、执行、撤回、追溯链路

## 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS + Zustand
- **后端**：Express + sql.js (SQLite)
- **构建**：Vite

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

这将同时启动前端开发服务器（http://localhost:5173）和后端API服务器（http://localhost:3001）。

### 构建后端

```bash
npm run build:server
```

### 运行测试脚本

```bash
# 完整回归测试
node test-review-flow.cjs

# 跨天缺失检测专项测试
node test-missing-detection.cjs

# CSV导出功能验证测试
node test-csv-export.cjs

# 筛选导出数据范围验证测试
node test-filter-export.cjs

# 导出功能完整性测试（0条处理、操作日志、权限隔离）
node test-export-complete.cjs

# 离线交付包回归测试
node test-delivery-package.cjs

# 生成离线交付包示例数据
node generate-delivery-sample.cjs

# 离线交付包可复现验证
node verify-delivery-package.cjs
```

## 项目结构

```
├── api/                    # 后端API
│   ├── server.ts          # Express服务器
│   ├── database.ts       # SQLite数据库初始化
│   ├── batchService.ts    # 批次管理服务
│   ├── anomalyService.ts  # 异常检测服务
│   ├── correctionService.ts # 修正服务
│   ├── ruleService.ts     # 规则配置服务
│   ├── exportService.ts   # 导出服务
│   ├── deliveryPackageService.ts # 离线交付包服务
│   ├── types.ts           # 类型定义
│   └── sql.js.d.ts        # sql.js类型声明
├── src/                   # 前端代码
│   ├── components/        # UI组件
│   ├── pages/             # 页面组件
│   │   ├── Delivery.tsx   # 离线交付包页面
│   │   └── ...
│   ├── store/             # Zustand状态管理
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── data/                  # SQLite数据库文件（自动创建）
└── exports/               # 导出文件和交付包目录（自动创建）
```

## 离线交付包功能说明

### 功能概述

离线交付包模块允许业务人员筛选记录，打包成带清单的交付包，提交后异步生成可下载文件，并在页面里直接看到状态、失败原因和操作日志。

### 核心功能

1. **交付包管理**
   - 创建、查看、删除交付包
   - 筛选条件支持日期范围、能源类型、异常状态等
   - 交付包状态跟踪：待处理、排队中、生成中、已完成、失败、已取消

2. **文件生成**
   - 异步生成CSV格式的交付包文件
   - 包含交付清单和记录明细
   - 版本管理，历史记录完整保留
   - 并发控制，防止重复生成

3. **下载管理**
   - 下载记录完整保留
   - 支持版本回溯下载
   - 严格权限校验

4. **权限和审计**
   - 不同角色只能看到自己有权访问的交付包
   - 下载记录按角色过滤
   - 审计明细记录所有操作（包括越权尝试）
   - 越权访问明确拒绝并留痕

5. **服务重启恢复**
   - 服务启动时自动恢复中断的任务状态
   - 文件下载地址持久化
   - 配置信息完整保留
   - PROCESSING状态自动标记为FAILED

6. **并发控制**
   - 文件版本递增，不会覆盖
   - 操作锁防止并发生成
   - 历史记录完整可查
   - 撤销后重建版本号正确递增

### 权限说明

| 角色 | 创建包 | 查看包 | 修改包 | 删除包 | 查看审计 | 下载 |
|------|--------|--------|--------|--------|----------|------|
| 管理员 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 主管 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 复核员 | ✓ | 仅自己的 | 仅自己的 | ✗ | ✗ | ✓ |

### 数据库表结构

- `delivery_packages` - 交付包主表
- `delivery_package_records` - 交付包记录关联表
- `delivery_package_tasks` - 任务执行记录表
- `delivery_package_downloads` - 下载记录表
- `delivery_package_audit_logs` - 审计日志表
- `delivery_package_versions` - 版本历史表

### API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/delivery-packages | 创建交付包 |
| GET | /api/delivery-packages | 查询交付包列表 |
| GET | /api/delivery-packages/:id | 查询交付包详情 |
| POST | /api/delivery-packages/:id/records | 添加记录到交付包 |
| GET | /api/delivery-packages/:id/records | 查询交付包记录 |
| POST | /api/delivery-packages/:id/generate | 生成交付包文件 |
| GET | /api/delivery-packages/:id/download | 下载交付包 |
| POST | /api/delivery-packages/:id/cancel | 取消交付包 |
| POST | /api/delivery-packages/:id/rebuild | 重建交付包 |
| POST | /api/delivery-packages/:id/lock | 锁定交付包 |
| POST | /api/delivery-packages/:id/unlock | 解锁交付包 |
| GET | /api/delivery-packages/:id/tasks | 查询任务日志 |
| GET | /api/delivery-packages/:id/versions | 查询版本历史 |
| GET | /api/delivery-packages/:id/downloads | 查询下载记录 |
| GET | /api/delivery-packages/:id/lock-status | 查询操作锁状态 |
| GET | /api/delivery-packages/audit-logs | 查询审计日志 |
| GET | /api/delivery-packages/downloads | 查询下载记录（全局） |
| GET | /api/delivery-packages/system/recovery | 系统恢复接口（仅管理员） |

## 验证指南

### 成功验证场景

#### 1. 数据导入流程

1. 准备Excel文件，包含以下列：
   - `表计编号`：表计唯一标识
   - `日期`：读数日期（格式：YYYY-MM-DD）
   - `类型`：能源类型（水/电/气）
   - `读数`：表计读数值

2. 进入"数据导入"页面
3. 拖拽上传Excel文件或点击选择
4. 预览数据，确认无误后点击"确认导入"
5. 验证：批次列表显示新导入的批次，数据仪表盘更新

#### 2. 异常识别验证

1. 导入的数据会自动进行异常检测
2. **跳变异常**：当读数变化超过阈值（默认50%）时触发
3. **回退异常**：当本次读数低于上次读数时触发
4. **缺失异常**：当同一表计连续两个读数之间间隔超过配置天数（默认3天）时触发
5. 进入"异常复核"页面，查看待复核异常列表

#### 3. 跨天缺失检测验证

1. 进入"规则配置"页面，设置"缺失判定天数"为2
2. 准备Excel文件，导入同一表计间隔3天以上的读数（如6月12日和6月15日）
3. 验证：系统自动生成缺失异常，备注显示"与上次读数间隔3天"

**测试步骤**：
```bash
node test-missing-detection.cjs
```

#### 4. 复核修正流程

1. 在异常列表中选择一条待复核记录
2. 输入修正值，点击"修正"
3. 或输入备注，点击"忽略"
4. 验证：状态变更为"已修正"或"已忽略"，异常详情显示修正值

#### 5. 撤销操作验证

1. 选择一条已修正的记录
2. 点击"撤销操作"
3. **验证点**：
   - 状态恢复为"待复核"
   - **correctedValue 被清除**（不再显示旧修正值）
   - 历史修正记录保留在 correctionHistory 中
   - 汇总报表使用原始值计算

#### 6. 汇总报表验证

1. 进入"导出中心"页面
2. 点击"导出汇总"
3. **验证点**：
   - 已修正的异常：使用 correctedValue 计算
   - 已撤销的异常：使用 rawValue 计算
   - totalEffective 字段反映实际有效值

### 离线交付包验证

### 完整测试套件

```bash
# 运行完整测试套件（推荐）
run-delivery-tests.bat

# 或单独运行各项测试:
node test-delivery-complete.cjs      # 完整回归测试
node test-delivery-concurrency.cjs    # 并发场景测试
node test-delivery-permissions.cjs    # 权限隔离测试
node test-delivery-recovery.cjs      # 重启恢复测试
node verify-delivery-package.cjs      # 可复现验证
node generate-delivery-sample.cjs     # 示例数据生成
```

### 测试覆盖场景

1. **完整回归测试** (`test-delivery-complete.cjs`)
   - 环境准备和数据清理
   - 基础功能：创建、生成、下载
   - 权限隔离：角色可见性、操作限制
   - 取消和重建：状态转换、版本号递增
   - 版本管理：历史记录完整性
   - 锁定功能：锁定/解锁
   - 审计日志：操作记录、权限校验
   - 重启恢复：数据持久化验证

2. **并发场景测试** (`test-delivery-concurrency.cjs`)
   - 并发生成：同一交付包同时生成
   - 版本号：每次生成版本递增
   - 撤销重建：版本号正确处理
   - 历史记录：完整保留
   - 重复提交：数据去重

3. **权限隔离测试** (`test-delivery-permissions.cjs`)
   - 角色创建权限
   - 交付包可见性
   - 操作权限限制
   - 越权访问检测和审计
   - 复核员限制
   - 主管完整权限

4. **重启恢复测试** (`test-delivery-recovery.cjs`)
   - 中断任务检测
   - 状态自动恢复
   - 文件路径持久化
   - 版本历史保留
   - 重建失败任务

### 失败路径验证

#### 1. 重复导入检测

**测试步骤**：
1. 导入一批数据
2. 尝试再次导入相同数据

**预期结果**：
- 系统返回错误："检测到重复数据，数据中包含已存在的记录，请检查后重新导入"
- HTTP状态码：400

#### 2. 回退异常修正限制

**测试步骤**：
1. 确保"回退检测开关"已启用
2. 导入一条会导致回退异常的数据（本次读数低于上次）
3. 在修正页面尝试将值修正为更低的数字

**预期结果**：
- 系统返回错误："回退异常不能将读数修正为低于原始值"
- HTTP状态码：400

#### 3. 并发冲突检测

**测试步骤**：
1. 用户A获取异常详情，版本号为1
2. 用户A提交修正（版本号变为2）
3. 用户B使用旧版本号1尝试提交修正

**预期结果**：
- 用户B收到冲突提示："数据已被其他用户修改，请刷新后重试"
- HTTP状态码：409 Conflict

#### 4. 撤销后数据恢复

**测试步骤**：
1. 对一条异常记录进行修正
2. 执行撤销操作
3. 检查异常详情和汇总报表

**预期结果**：
- 异常状态恢复为"待复核"
- correctedValue 为 null（不显示旧修正值）
- 历史修正记录保留
- 汇总报表使用原始值

### 数据一致性验证

#### 系统重启后验证

1. 正常操作完成若干导入、修正、配置修改
2. 停止服务器（Ctrl+C）
3. 重新启动服务器：`npm run dev`
4. 验证以下数据一致：
   - 阈值配置保持最后一次修改的值
   - 已忽略的异常状态保持
   - 已撤销的异常 correctedValue 为 null
   - 导出记录历史完整
   - 交付包状态和文件路径完整保留
   - 汇总报表数据与界面显示一致

## API接口

### 批次管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/batches | 导入批次数据 |
| GET | /api/batches | 获取批次列表 |
| GET | /api/batches/:id | 获取批次详情 |
| DELETE | /api/batches/:id | 删除批次 |

### 异常管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/anomalies | 获取异常列表 |
| GET | /api/anomalies/:id | 获取异常详情 |
| POST | /api/anomalies/:id/correct | 修正异常 |
| POST | /api/anomalies/:id/ignore | 忽略异常 |
| POST | /api/anomalies/:id/revert | 撤销异常 |
| POST | /api/anomalies/detect-missing | 手动触发缺失检测 |

### 规则配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/rules | 获取当前规则 |
| PUT | /api/rules | 更新规则 |
| GET | /api/rules/history | 获取规则历史 |
| POST | /api/rules/:version/rollback | 回滚到指定版本 |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/export/detail | 导出明细（CSV） |
| POST | /api/export/summary | 导出汇总（CSV） |
| POST | /api/export/batch-compare | 导出批次对比（CSV） |
| POST | /api/export/replay | 导出异常回放（CSV） |
| POST | /api/export/filtered | 导出筛选结果（CSV，仅主管） |
| GET | /api/exports | 获取导出记录 |

### 离线交付包

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/delivery-packages | 创建交付包 |
| GET | /api/delivery-packages | 获取交付包列表 |
| GET | /api/delivery-packages/:id | 获取交付包详情 |
| POST | /api/delivery-packages/:id/records | 添加记录 |
| GET | /api/delivery-packages/:id/records | 获取记录列表 |
| POST | /api/delivery-packages/:id/generate | 生成文件 |
| GET | /api/delivery-packages/:id/download | 下载文件 |
| POST | /api/delivery-packages/:id/cancel | 取消交付包 |
| POST | /api/delivery-packages/:id/rebuild | 重建交付包 |
| POST | /api/delivery-packages/:id/lock | 锁定交付包 |
| POST | /api/delivery-packages/:id/unlock | 解锁交付包 |
| GET | /api/delivery-packages/:id/tasks | 获取任务日志 |
| GET | /api/delivery-packages/:id/versions | 获取版本历史 |
| GET | /api/delivery-packages/:id/downloads | 获取下载记录 |
| GET | /api/delivery-packages/audit-logs | 获取审计日志 |

## 样例数据

### 回退异常样例

| 表计编号 | 日期 | 类型 | 读数 |
|----------|------|------|------|
| M001 | 2024-01-15 | 电 | 1500 |
| M001 | 2024-01-16 | 电 | 1600 |
| M001 | 2024-01-17 | 电 | 1500 |
| W001 | 2024-01-15 | 水 | 500 |
| W001 | 2024-01-16 | 水 | 600 |

注意：M001在1月17日的读数（1500）低于1月16日（1600），会触发回退异常。

### 缺失异常样例

| 表计编号 | 日期 | 类型 | 读数 |
|----------|------|------|------|
| G001 | 2026-06-12 | 气 | 200 |
| G001 | 2026-06-15 | 气 | 220 |

注意：G001在6月12日到15日之间间隔3天，超过默认配置（3天），会触发缺失异常。

## 核心修复说明

### 已修复的问题

1. **缺失检测基于批次内间隔**：现在检查同一表计在导入批次中连续读数之间的间隔，而非"最后读数距今天数"
2. **撤销后 correctedValue 清除**：撤销修正时会将 correctedValue 设为 null，确保异常详情不显示旧修正值
3. **汇总报表正确计算**：汇总时只计算状态为 CORRECTED 的 correctedValue，其他情况使用 rawValue
4. **构建类型错误**：修复 sql.js 类型声明和 TypeScript 严格模式问题

### 离线交付包新增功能

1. **交付包模块完整实现**：创建、生成、下载全流程打通
2. **权限和审计系统**：角色隔离、越权拒绝、操作留痕
3. **服务重启恢复**：任务状态、下载地址、配置信息持久化
4. **并发控制**：版本管理、锁定规则、历史记录
5. **完整测试覆盖**：回归测试、可复现验证脚本

### 关键代码变更

- [api/database.ts](api/database.ts)：新增交付包相关表结构和迁移逻辑
- [api/deliveryPackageService.ts](api/deliveryPackageService.ts)：新增交付包业务逻辑
- [api/server.ts](api/server.ts)：新增交付包API路由
- [src/pages/Delivery.tsx](src/pages/Delivery.tsx)：新增交付包前端页面
- [src/utils/api.ts](src/utils/api.ts)：新增交付包API调用
- [src/components/Layout.tsx](src/components/Layout.tsx)：新增交付包导航入口

## 注意事项

1. **数据持久化**：所有数据存储在`data/energy_review.db`文件中，请勿删除
2. **导出文件**：导出的CSV文件保存在`exports/`目录，使用UTF-8编码
3. **并发操作**：系统使用版本号进行乐观锁，请避免同时修改同一记录
4. **规则生效**：规则修改仅影响后续导入的数据，不影响历史数据
5. **交付包文件**：交付包文件保存在`exports/`目录，建议定期清理

## 离线交付包验收指南

### 验收标准

1. **创建和生成**
   - ✓ 可以创建交付包，设置名称和筛选条件
   - ✓ 可以添加记录到交付包
   - ✓ 可以生成交付包文件（CSV格式）
   - ✓ 文件包含清单和记录明细
   - ✓ 并发生成时只有一个成功

2. **下载和记录**
   - ✓ 可以下载生成的交付包
   - ✓ 下载记录完整保留
   - ✓ 版本历史清晰可查
   - ✓ 每次生成版本号递增

3. **权限隔离**
   - ✓ 不同角色只能看到自己有权访问的交付包
   - ✓ 下载记录按角色过滤
   - ✓ 越权访问明确拒绝
   - ✓ 越权尝试被审计日志记录

4. **审计追踪**
   - ✓ 所有操作记录到审计日志
   - ✓ 主管可查看所有审计日志
   - ✓ 复核员无法访问审计日志
   - ✓ 越权访问有特殊标记

5. **重启恢复**
   - ✓ 交付包状态在重启后保持一致
   - ✓ 文件下载地址持久化
   - ✓ 配置信息完整保留
   - ✓ PROCESSING状态自动标记为FAILED

6. **并发控制**
   - ✓ 文件版本递增，不会覆盖
   - ✓ 锁定规则防止并发修改
   - ✓ 取消后可以重建
   - ✓ 重建后版本号正确递增

### 验收步骤

#### 1. 启动服务验证
```bash
npm run dev
```
**预期**：前端运行在 http://localhost:5173，后端运行在 http://localhost:3001

#### 2. 运行完整测试套件
```bash
# Windows
run-delivery-tests.bat

# 或逐个运行
node test-delivery-complete.cjs
node test-delivery-concurrency.cjs
node test-delivery-permissions.cjs
node verify-delivery-package.cjs
```
**预期**：所有测试通过

#### 3. 生成示例数据
```bash
node generate-delivery-sample.cjs
```
**预期**：创建测试数据和示例交付包

#### 4. 手动验证
1. 访问 http://localhost:5173
2. 进入"离线交付包"页面
3. 创建新的交付包
4. 添加记录并生成文件
5. 下载文件验证内容
6. 检查审计日志

### 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 交付包状态一直是"待处理" | 服务未正常响应 | 检查服务器日志 |
| 生成文件失败 | 没有添加记录 | 先添加记录再生成 |
| 并发生成时两个都失败 | 锁机制问题 | 检查操作锁状态 |
| 无法下载文件 | 文件路径无效或无权限 | 检查exports目录和用户权限 |
| 权限错误 | 角色配置错误 | 检查数据库users表 |
| 重启后状态丢失 | 数据库未保存 | 检查database.ts saveDatabase调用 |
| 版本号不正确 | 重建后未重新生成 | 重建后需要重新生成文件 |
| 越权访问未被记录 | 审计日志接口问题 | 检查审计日志查询 |

## 数据发布工单中心

### 功能概述

数据发布工单中心提供完整的变更管理生命周期，支持申请、审批、执行、撤回、追溯全链路管理。

### 核心功能

1. **工单管理**
   - 创建变更单（支持多种变更类型：SCHEMA_CHANGE、DATA_MIGRATION、CALCULATION_RULE、FIELD_MAPPING）
   - 变更单列表、详情、创建入口
   - 版本历史查看
   - 执行历史查看
   - 操作日志查询

2. **审批流程**
   - 提交审批
   - 审批通过/驳回
   - 审批角色从配置读取
   - 权限校验

3. **执行管理**
   - 执行变更单
   - 执行状态跟踪
   - 执行历史记录

4. **撤回功能**
   - 撤回变更单
   - 根据配置判断是否强制填写撤回说明
   - 撤回历史记录

5. **冲突检测**
   - 同一数据集在冲突时间窗内的变更单拦截
   - 冲突原因记录
   - 冲突时间窗从配置读取

6. **服务重启恢复**
   - 待执行和执行中的单子从SQLite恢复
   - 配置信息持久化

### API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/change-orders | 创建变更单 |
| GET | /api/change-orders | 查询变更单列表 |
| GET | /api/change-orders/:id | 查询变更单详情 |
| POST | /api/change-orders/:id/submit | 提交审批 |
| POST | /api/change-orders/:id/approve | 审批通过 |
| POST | /api/change-orders/:id/reject | 驳回审批 |
| POST | /api/change-orders/:id/execute | 执行变更单 |
| POST | /api/change-orders/:id/rollback | 撤回变更单 |
| POST | /api/change-orders/:id/withdraw | 撤销变更单 |
| GET | /api/change-orders/:id/versions | 查询版本历史 |
| GET | /api/change-orders/:id/execution-history | 查询执行历史 |
| GET | /api/change-orders/:id/audit-logs | 查询审计日志 |
| GET | /api/change-orders/:id/conflicts | 查询冲突记录 |
| POST | /api/change-orders/export-summary | 导出摘要 |
| GET | /api/change-orders/pending-execution | 查询待执行变更单 |
| GET | /api/change-orders/system/recovery | 系统恢复接口 |
| GET | /api/change-order-config | 查询配置 |
| PUT | /api/change-order-config | 更新配置 |

### 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| approval_roles | 可审批变更单的角色列表 | ADMIN,SUPERVISOR |
| auto_conflict_check | 是否自动检测冲突 | true |
| conflict_time_window_hours | 冲突检测时间窗口（小时） | 24 |
| max_effective_delay_hours | 最大生效延迟时间（小时） | 168 |
| require_rollback_description | 是否强制填写撤回说明 | true |
| rollback_retention_days | 撤回数据保留天数 | 30 |

### 验证指南

#### 完整链路验证

```bash
# 运行完整测试套件
node test-change-center-complete.cjs
```

#### 测试覆盖场景

1. **完整链路测试**：创建→提交→审批→执行→回滚
2. **冲突检测测试**：同一数据集在冲突时间窗内的变更单拦截
3. **权限隔离测试**：权限受限用户无法越权操作
4. **重启恢复测试**：服务重启后数据恢复
5. **配置管理测试**：配置读取和更新

#### 关键验证点

1. **创建变更单**：字段校验失败返回清晰错误信息（HTTP 400）
2. **冲突检测**：同一数据集在冲突时间窗内出现两张单子时拦截并记录原因
3. **权限控制**：ADMIN和SUPERVISOR可审批，REVIEWER不可审批
4. **撤回说明**：配置为true时必须填写撤回说明
5. **服务重启**：待执行和执行中的单子从SQLite恢复

### 测试脚本说明

**test-change-center-complete.cjs**：完整功能测试脚本，验证：
- 配置管理接口
- 创建、提交、审批、执行、回滚完整链路
- 冲突检测与拦截
- 权限隔离
- 重启恢复机制
- 导出摘要
- 撤回功能

### 页面入口

- **变更中心**：访问 http://localhost:5173/change-center
- 包含列表、详情、创建、历史查看入口

## License

MIT
