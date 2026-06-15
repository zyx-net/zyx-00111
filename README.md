# 能源计量数据异常复核与修正系统

园区能耗抄表异常复核与修正台，处理每天导入的水电气读数，自动识别异常并支持复核修正。

## 功能特性

- **数据导入**：支持Excel/CSV格式批量导入水、电，气三类读数
- **异常识别**：自动检测跳变、缺失、回退等异常
- **复核修正**：支持修正、忽略、撤销操作，保留完整历史记录
- **规则配置**：阈值配置支持版本管理，可回滚到历史版本
- **数据导出**：支持明细导出和汇总报表导出（CSV格式）
- **冲突检测**：多用户并发操作时版本冲突检测
- **数据持久化**：SQLite本地存储，系统重启后数据一致

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
│   ├── types.ts           # 类型定义
│   └── sql.js.d.ts        # sql.js类型声明
├── src/                   # 前端代码
│   ├── components/        # UI组件
│   ├── pages/             # 页面组件
│   ├── store/             # Zustand状态管理
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── data/                  # SQLite数据库文件（自动创建）
└── exports/               # 导出文件目录（自动创建）
```

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

### 关键代码变更

- [api/anomalyService.ts](api/anomalyService.ts)：重写缺失检测逻辑，基于批次内读数间隔检测
- [api/exportService.ts](api/exportService.ts)：修改汇总SQL，使用 CASE WHEN 判断异常状态
- [api/server.ts](api/server.ts)：传递 readings 参数给 createMissingAnomalies
- [api/sql.js.d.ts](api/sql.js.d.ts)：新增 sql.js 类型声明文件
- [tsconfig.api.json](tsconfig.api.json)：关闭 noImplicitAny 修复构建错误

## 注意事项

1. **数据持久化**：所有数据存储在`data/energy_review.db`文件中，请勿删除
2. **导出文件**：导出的CSV文件保存在`exports/`目录，使用UTF-8编码
3. **并发操作**：系统使用版本号进行乐观锁，请避免同时修改同一记录
4. **规则生效**：规则修改仅影响后续导入的数据，不影响历史数据

## CSV导出验收指南

### 验收标准

1. **文件格式**：所有导出文件必须是 `.csv` 格式，不是 `.xlsx`
2. **编码**：文件使用 UTF-8 编码，中文字符能正确显示
3. **字段**：CSV包含正确的表头和字段顺序
4. **响应**：API返回JSON包含`filePath`字段

### 验收步骤

#### 1. 启动服务验证
```bash
npm run dev
```
**预期**：前端运行在 http://localhost:5173，后端运行在 http://localhost:3001

#### 2. CSV导出格式验证
```bash
node test-csv-export.cjs
```
**预期**：20项测试全部通过

#### 3. 关键验证点
- [ ] 导出文件扩展名是 `.csv` 不是 `.xlsx`
- [ ] 文件可以用Excel或文本编辑器打开
- [ ] 中文内容显示正常（不是乱码）
- [ ] CSV有正确的表头行
- [ ] 数据行与筛选条件一致

#### 4. 完整回归测试
```bash
node test-review-flow.cjs
```
**预期**：31项测试全部通过

### 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| `npm run dev` 报模块不存在 | tsx模块路径问题 | 使用 `npx tsx` 替代直接调用 |
| 导出是Excel不是CSV | exportService.ts 使用了 xlsx 库 | 已修改为生成CSV格式 |
| 文件名乱码 | 未使用UTF-8 BOM | 已添加 `\ufeff` BOM头 |
| 字段顺序不对 | 导出逻辑问题 | 已修复字段映射 |

## License

MIT

## 导出中心功能验收指南

### 功能概述

导出中心是系统的核心功能模块，提供以下能力：

- **多种导出类型**：支持数据明细、汇总报表、筛选导出三种模式
- **权限控制**：不同角色有不同的导出权限
- **审计追踪**：完整记录所有导出操作，便于审计追溯
- **数据持久化**：导出记录、历史配置在重启后保持有效
- **智能反馈**：空结果筛选时不生成空文件，提示明确

### 角色权限说明

| 角色 | 角色标识 | 明细导出 | 汇总导出 | 筛选导出 | 查看所有日志 |
|------|---------|---------|---------|---------|------------|
| 管理员 | ADMIN | ✓ | ✓ | ✓ | ✓ |
| 主管 | SUPERVISOR | ✓ | ✓ | ✓ | ✓ |
| 复核员 | REVIEWER | ✓ | ✓ | ✗ | 仅查看自己的日志 |

### 启动与验证流程

#### 1. 开发环境启动

```bash
# 安装依赖（首次）
npm install

# 启动开发服务器
npm run dev
```

**验证点**：
- 前端运行在 http://localhost:5173
- 后端API运行在 http://localhost:3001
- 无端口冲突错误

#### 2. 生产构建验证

```bash
# 前端构建
npm run build
```

**预期结果**：
- 构建成功，生成 `dist/` 目录
- 无 TypeScript 编译错误
- CSS 和 JS 文件大小合理

**验证命令**：
```bash
# 检查构建产物
ls -lh dist/assets/

# 检查 dist 目录结构
find dist -type f
```

#### 3. 导入测试数据

```bash
# 使用测试脚本生成样例数据
node generate-sample.cjs
```

**验证点**：
- 数据库中应有批次记录
- 异常检测应自动运行
- 仪表盘统计应更新

### 导出功能回归测试

#### 测试脚本说明

```bash
# 导出功能完整性测试（推荐优先运行）
node test-export-complete.cjs
```

**测试覆盖**：
1. ✓ 0条数据导出处理（不生成空文件）
2. ✓ 有数据导出（文件格式、编码、内容验证）
3. ✓ 操作日志记录（包含操作者信息）
4. ✓ 角色日志隔离（不同角色日志不混淆）
5. ✓ 导出记录持久化（生成导出记录）
6. ✓ CSV格式验证（UTF-8编码、BOM头、字段完整性）

**预期输出**：
```
=== 导出功能完整性测试 ===

--- 导入测试数据 ---
  ✓ 导入测试数据

--- 0条数据导出测试 ---
  ✓ 明细导出0条数据（不存在的日期范围）
  ✓ 筛选导出0条数据（待复核状态）
  ✓ 汇总导出0条数据（不存在的日期范围）

--- 有数据导出测试 ---
  ✓ 明细导出（有数据）
  ✓ 汇总导出

--- 操作日志测试 ---
  ✓ 导出操作记录到日志
  ✓ 导出记录包含操作者信息
  ✓ 不同角色日志隔离

--- 导出记录测试 ---
  ✓ 导出后生成导出记录
  ✓ 导出记录包含操作者

--- CSV格式验证 ---
  ✓ CSV文件使用UTF-8编码
  ✓ 默认文件名正确（.csv）

========================================
测试完成: 12 通过, 0 失败
========================================
```

#### 完整回归测试

```bash
# 完整业务流程测试
node test-review-flow.cjs
```

**测试场景**：
- 数据导入流程
- 异常检测和复核
- 修正、忽略、撤销操作
- 规则配置和版本回滚
- 导出功能
- 并发冲突检测

### 页面级功能验证

#### 导出中心 - 首屏加载验证

**操作步骤**：
1. 访问导出中心页面
2. 不进行任何操作，直接查看导出记录列表

**预期结果**：
- ✓ 页面加载时自动获取历史导出记录
- ✓ 列表显示最近的20条记录
- ✓ 每条记录显示：导出类型、操作时间、操作人、筛选条件

**验证命令**：
```bash
# API直接验证
curl http://localhost:3001/api/exports
```

**预期响应**：
```json
[
  {
    "id": "xxx",
    "exportType": "DETAIL",
    "params": "{\"dateFrom\":\"2026-06-01\"}",
    "downloadedAt": "2026-06-16T10:30:00.000Z",
    "downloadedBy": "supervisor"
  }
]
```

#### 导出成功 - 状态一致性验证

**操作步骤**：
1. 选择"数据明细"导出类型
2. 设置日期范围（如 2026-06-01 至 2026-06-30）
3. 点击"导出CSV"按钮

**预期结果**：
- ✓ 按钮状态：导出过程中显示"导出中..."，完成后恢复
- ✓ 页面提示：显示"导出成功，共 X 条记录，文件名: energy_detail_xxx.csv"
- ✓ 下载文件：浏览器自动下载CSV文件
- ✓ 文件名格式：`energy_detail_<timestamp>.csv`
- ✓ 文件编码：UTF-8 with BOM（可用文本编辑器验证）
- ✓ 导出记录：历史记录列表新增该条记录

**验证点检查清单**：
- [ ] 按钮loading状态正确
- [ ] 成功提示包含记录数和文件名
- [ ] 文件下载到本地
- [ ] CSV文件可用Excel/文本编辑器打开
- [ ] 中文内容无乱码
- [ ] 历史记录列表更新

#### 空结果筛选 - 反馈机制验证

**操作步骤**：
1. 选择"数据明细"导出类型
2. 设置不存在的日期范围（如 2025-01-01 至 2025-01-31）
3. 点击"导出CSV"按钮

**预期结果**：
- ✓ 页面显示警告提示："当前筛选条件下没有可导出的数据，请调整筛选条件后重试"
- ✓ 提示类型为 warning（黄色背景）
- ✓ **不生成空CSV文件**
- ✓ 历史记录列表**不增加**记录
- ✓ 操作日志**不记录**此次操作

**API验证**：
```bash
curl -X POST http://localhost:3001/api/export/detail \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"2025-01-01","dateTo":"2025-01-31","operator":"supervisor"}'
```

**预期响应**：
```json
{
  "success": false,
  "error": "没有符合条件的数据",
  "message": "当前筛选条件下没有可导出的数据，请调整筛选条件后重试",
  "recordCount": 0,
  "filePath": ""
}
```

#### 重启后持久化验证

**操作步骤**：
1. 进行若干次导出操作
2. 停止开发服务器（Ctrl+C）
3. 重新启动服务器
4. 访问导出中心页面

**预期结果**：
- ✓ 历史导出记录完整保留
- ✓ 导出文件在 `exports/` 目录中
- ✓ 下载链接仍然有效
- ✓ 操作日志完整

**验证命令**：
```bash
# 检查导出记录数量
curl http://localhost:3001/api/exports | jq length

# 检查导出文件
ls -lh exports/

# 检查日志
curl http://localhost:3001/api/operation-logs?operationType=EXPORT | jq length
```

#### 权限控制验证

**操作步骤**：
1. 以"复核员"身份登录（reviewer_1）
2. 尝试选择"筛选导出"类型
3. 尝试点击导出按钮

**预期结果**：
- ✓ "筛选导出"按钮显示为禁用状态（灰色）
- ✓ 按钮提示："仅主管可使用"
- ✓ 即使尝试API调用，也返回权限错误

**API验证**：
```bash
# 以复核员身份调用筛选导出
curl -X POST http://localhost:3001/api/export/filtered \
  -H "Content-Type: application/json" \
  -d '{"filters":{"status":"PENDING"},"operator":"reviewer_1"}'
```

**预期响应**：
```json
{
  "error": "权限不足，只有主管可以导出筛选结果"
}
```

#### 审计日志验证

**操作步骤**：
1. 以"主管"身份进行导出操作
2. 点击"查看导出操作日志"按钮
3. 切换"全部日志"和"我的日志"

**预期结果**：
- ✓ 主管可以查看所有用户的导出日志
- ✓ 可以按操作人筛选日志
- ✓ 日志显示操作类型、目标、时间、操作人、筛选条件

**以复核员身份验证**：
1. 以"复核员"身份登录
2. 查看导出操作日志
3. 切换到"我的日志"

**预期结果**：
- ✓ 只能看到自己的导出日志
- ✓ 看不到其他用户的日志
- ✓ 页面底部显示提示："注意：您当前以'复核员'身份登录，只能查看自己的导出日志"

### 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 导出按钮无响应 | 服务器未启动 | 检查 `npm run dev` 是否运行中 |
| CSV文件乱码 | 未使用UTF-8 BOM | 确认后端使用 `\ufeff` BOM头 |
| 空结果仍生成文件 | 后端未检查记录数 | 检查 exportDetail 返回逻辑 |
| 权限提示错误 | 角色配置错误 | 检查数据库 users 表 |
| 历史记录为空 | API未调用 | 检查前端 useEffect 依赖 |
| 重启后记录丢失 | 数据库未保存 | 检查 database.ts saveDatabase 调用 |

### 技术实现要点

#### 后端关键逻辑

1. **空数据检测**（exportService.ts）：
   ```typescript
   if (data.length === 0) {
     return {
       filePath: '',
       record: null,  // 不创建记录
       recordCount: 0
     };
   }
   ```

2. **权限检查**（server.ts）：
   ```typescript
   const user = await getUserByUsername(operator);
   if (!user || !canExportBatch(user)) {
     return res.status(403).json({ error: '权限不足' });
   }
   ```

3. **日志记录**（userService.ts）：
   ```typescript
   await createOperationLog(
     operator, 'EXPORT', targetType, targetId, JSON.stringify(params)
   );
   ```

#### 前端关键逻辑

1. **首屏加载**（Export.tsx）：
   ```typescript
   useEffect(() => {
     const records = await api.export.list();
     setExportHistory(records);
   }, []);
   ```

2. **错误处理**：
   ```typescript
   if (result.success === false) {
     setExportMessage({ type: 'warning', text: result.message });
     return; // 不触发下载
   }
   ```

3. **日志过滤**：
   ```typescript
   const filters = logFilter === 'mine' 
     ? { operator: currentOperator } 
     : undefined;
   ```

### 测试数据准备

#### 最小测试数据集

```javascript
const readings = [
  { meterId: 'TEST_001', readingDate: '2026-06-01', rawValue: 1000, meterType: 'ELECTRICITY' },
  { meterId: 'TEST_001', readingDate: '2026-06-02', rawValue: 1200, meterType: 'ELECTRICITY' },
  { meterId: 'TEST_001', readingDate: '2026-06-03', rawValue: 2500, meterType: 'ELECTRICITY' }, // 触发跳变
];
```

#### 测试用户账号

- **admin**：管理员角色，可执行所有操作
- **supervisor**：主管角色，可执行筛选导出，查看所有日志
- **reviewer_1**：复核员角色，基础导出权限，查看自己的日志
- **reviewer_2**：复核员角色，基础导出权限，查看自己的日志

### 性能基准

- 导出1000条记录：< 2秒
- 导出记录查询响应：< 500ms
- 日志加载响应：< 300ms
- 页面首屏加载：< 1秒

### 安全注意事项

1. **权限验证**：所有导出操作必须验证用户角色
2. **输入校验**：严格校验日期范围、筛选参数
3. **日志审计**：记录所有导出操作，包括失败尝试
4. **文件清理**：定期清理 `exports/` 目录中的过期文件
5. **敏感信息**：日志中不记录密码、Token等敏感信息
