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
