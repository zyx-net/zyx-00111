# 数据口径变更中心 - 快速参考卡

## 🚀 启动命令

```bash
# 编译后端
npm run build:server

# 启动服务器(终端1)
node dist/api/server.js

# 启动前端(终端2)
npm run client:dev

# 访问地址
http://localhost:5173/change-center
```

## 📋 快速操作

### 创建变更单
1. 点击"创建变更单"
2. 填写: 标题、描述、变更类型、数据集信息
3. 添加字段变更(字段名、旧值、新值、变更类型)
4. 设置生效时间
5. 填写回滚说明
6. 点击"创建"

### 审批流程
1. 提交 → 状态变为"待审批"
2. 主管审批 → 批准/驳回
3. 生效时间到达 → 可执行
4. 执行 → 状态变为"已完成"
5. 需要时 → 回滚

## 🔐 角色权限

| 操作 | admin | supervisor | reviewer |
|------|-------|------------|----------|
| 创建 | ✓ | ✓ | ✓ |
| 审批 | ✓ | ✓ | ✗ |
| 执行 | ✓ | ✓ | ✗ |
| 回滚 | ✓ | ✗ | ✗ |
| 查看日志 | ✓ | ✓ | ✗ |

## 🔗 API端点

### 变更单操作
```bash
POST   /api/change-orders                    # 创建
GET    /api/change-orders                   # 列表
GET    /api/change-orders/:id              # 详情
PUT    /api/change-orders/:id              # 更新
DELETE /api/change-orders/:id              # 删除

POST   /api/change-orders/:id/submit       # 提交
POST   /api/change-orders/:id/approve      # 批准
POST   /api/change-orders/:id/reject       # 驳回
POST   /api/change-orders/:id/execute      # 执行
POST   /api/change-orders/:id/withdraw     # 撤回
POST   /api/change-orders/:id/rollback    # 回滚
```

### 其他接口
```bash
GET    /api/change-orders/config            # 查询配置
PUT    /api/change-orders/config/:key      # 修改配置
GET    /api/change-orders/:id/audit-logs  # 审计日志
GET    /api/change-orders/:id/versions    # 版本历史
GET    /api/change-orders/:id/conflicts   # 冲突信息
POST   /api/change-orders/check-conflicts  # 冲突检测
GET    /api/change-orders/pending-execution # 待执行
GET    /api/change-orders/system/recovery # 系统恢复
POST   /api/change-orders/export-summary   # 导出摘要
```

## ⚙️ 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| approval_roles | ADMIN,SUPERVISOR | 可审批角色 |
| conflict_time_window_hours | 24 | 冲突检测窗口 |
| rollback_retention_days | 30 | 回滚保留天数 |
| auto_conflict_check | true | 自动冲突检测 |
| require_rollback_description | true | 必须填回滚说明 |

## 📊 变更单状态

```
DRAFT → PENDING_APPROVAL → APPROVED → PENDING_EXECUTION 
    ↓           ↓              ↓
  WITHDRAWN  REJECTED     EXECUTING → COMPLETED
                                        ↓
                                   ROLLED_BACK
```

## 🧪 测试命令

```bash
# 导入示例数据
node import-change-center-samples.cjs

# 完整测试
node test-change-center.cjs

# 核心测试
node test-change-center-simple.cjs

# 调试API
node debug-api.cjs
```

## 📁 项目文件

| 文件 | 说明 |
|------|------|
| api/changeOrderService.ts | 业务逻辑 |
| api/server.ts | API路由 |
| api/database.ts | 数据库 |
| api/types.ts | 类型定义 |
| src/pages/ChangeCenter.tsx | 前端页面 |
| CHANGE_CENTER_README.md | 详细文档 |
| QUICK_START.md | 快速上手 |
| TEST_RESULTS.md | 测试结果 |
| PROJECT_SUMMARY.md | 项目总结 |

## 🐛 常见问题

**Q: 测试失败提示冲突?**  
A: 使用更远的生效时间(如7天后),或重置数据库

**Q: 端口被占用?**  
A: `netstat -ano \| findstr :3001` 查找并结束进程

**Q: 如何重置数据库?**  
A: 停止服务器,删除 `data/energy_review.db`,重启服务器

## 📞 更多信息

详细文档: `CHANGE_CENTER_README.md`  
快速上手: `QUICK_START.md`  
测试结果: `TEST_RESULTS.md`  
项目总结: `PROJECT_SUMMARY.md`

---

💡 **提示**: 使用 Ctrl+C 停止服务器,数据库会自动保存
