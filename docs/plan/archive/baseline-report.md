---
tags:
  - baseline
  - coverage
  - metrics
  - reference
description: 领域层测试基线扫描报告（摸底阶段产出）
created: 2026-04-26T00:00:00
date: 2026-04-26
phase: baseline
---

# 领域层测试系统基线扫描报告

**扫描日期：** 2026-04-26  
**命令：** `pnpm test:coverage:domain`  
**范围：** 所有 12 个优先级模块（layer:domain + domain-shared）

---

## 📊 全景总览

### 覆盖率分布（按模块）

```
优先级模块覆盖率分布
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

优秀 (≥85%)：6 个
├─ account: 95%   ✅ 无需补充
├─ goal: 92%      ✅ 无需补充
├─ notification: 89% ✅ 无需补充
├─ task: 86%      ✅ 无需补充
├─ editor: 98%    ✅ 无需补充 (但为 UI 包)
└─ domain-shared: 100% ✅ 无需补充

达标 (80-84%)：1 个
└─ (无)

需补充 (70-79%)：2 个
├─ authentication: 71% ⏳ 缺口 9%
└─ governance: 78%     ⏳ 缺口 2%

缺失 (<70%)：4 个
├─ ai: 52%       ❌ 最大缺口 28%
├─ reminder: 52% ❌ 缺口 28%
├─ schedule: 58% ❌ 缺口 22%
└─ setting: 21%  ❌ 缺口 59%
```

### 优先级划分策略

| 优先级 | 标准                      | 模块数 | 动作            |
| ------ | ------------------------- | ------ | --------------- |
| **P1** | 基线 ≥85%，且核心包       | 4      | ✅ 无需补充     |
| **P2** | 基线 50-84%，核心业务逻辑 | 5      | ⏳ **立即补充** |
| **P3** | 基线 <50% 或可选功能      | 3      | ⏹️ 后续补充     |

---

## 📈 详细数据（按优先级）

### 优先级 1：无需补充（≥85%）

#### account (95%)

```
Statements: 95.05%
Branches:   95%
Functions:  95.62%
Lines:      95.05%

现有测试文件：12 个
├── aggregates/__tests__/account.spec.ts
├── aggregates/__tests__/account-user.spec.ts
├── entities/__tests__/app-secret.spec.ts
├── entities/__tests__/api-token.spec.ts
├── value-objects/__tests__/email.spec.ts
├── value-objects/__tests__/username.spec.ts
└── [7 more test files]

评论：账户模块有完整的单元测试覆盖，包括聚合根、实体、值对象、service 等。
```

#### task (86%)

```
Statements: 86.24%
Branches:   82.76%
Functions:  83.55%
Lines:      86.05%

现有测试文件：8 个
├── aggregates/__tests__/task.spec.ts
├── entities/__tests__/task-tag.spec.ts
├── services/__tests__/task-priority-calculator.spec.ts
└── [5 more test files]

评论：Task 模块包含集成测试，覆盖了数据库交互。基线已达标。
```

#### goal (92%)

```
Statements: 92.46%
Branches:   92.75%
Functions:  94.59%
Lines:      92.49%

现有测试文件：9 个
├── aggregates/__tests__/goal.spec.ts
├── services/__tests__/progress-calculator.spec.ts
└── [7 more test files]

评论：Goal 模块测试覆盖完整，包含约束验证和进度计算逻辑。
```

#### notification (89%)

```
Statements: 89.37%
Branches:   87.64%
Functions:  90.62%
Lines:      89.37%

现有测试文件：10 个
├── aggregates/__tests__/notification.spec.ts
├── services/__tests__/notification-router.spec.ts
└── [8 more test files]

评论：通知模块有充分的测试，覆盖路由、策略、消息序列化等。
```

#### editor (98%)

```
Statements: 98.29%
Branches:   97.52%
Functions:  98.31%
Lines:      98.32%

评论：编辑器模块覆盖率极高，但该模块为 UI 包（@memoflow/app-vue），
     不属于 domain-server 范畴。本轮不纳入治理对象。
```

#### domain-shared (100%)

```
Statements: 100%
Branches:   100%
Functions:  100%
Lines:      100%

现有测试文件：完整覆盖所有 value-objects 和 services

评论：共享层代码完全覆盖，主要是 DTO、基础 value-objects、
     错误类定义、合并策略等。无需补充。
```

---

### 优先级 2：立即补充（50-84%）

#### ai (52%) - **最大缺口**

```
Statements: 52.58%
Branches:   52.38%
Functions:  64.29%
Lines:      52.60%

子系统分布：
├── aggregates
│   └── ai-conversation.spec.ts
│       Statements: 4.35% ❌ 严重缺失
│       (仅有 2 个测试)
│
├── entities
│   ├── message.spec.ts: 缺失
│   └── [other entities]: 缺失
│
└── value-objects
    ├── token-usage.spec.ts: 缺失
    └── [other VOs]: 缺失

缺口分析：
❌ AIConversation aggregate: 聚合根几乎无测试
❌ Message entity: 完全缺失
❌ TokenUsage VO: 无约束验证测试
❌ 事件发射: 无 DomainEvent 验证

补充计划：
✅ AIConversation 聚合根：+ 20-25 个测试
   ├─ 工厂方法 (create, fromServerDTO)
   ├─ 消息管理 (addMessage, 排序验证)
   ├─ Token 追踪 (updateTokenUsage, 边界检验)
   ├─ 事件发射 (getAllEvents, DomainEvent 格式)
   └─ 状态转换 (disable, archive, readonly)

✅ Message entity：+ 15-20 个测试
   ├─ 工厂方法 (create, fromServerDTO)
   ├─ 内容验证 (contentLength, role 枚举)
   └─ 序列化往返 (toServerDTO, toClientDTO)

✅ TokenUsage VO：+ 15-20 个测试
   ├─ 初始化与增量 (create, addUsage)
   ├─ 边界检验 (prompt/completion/total 一致)
   └─ 超额状态 (isExceeded)

总计：60-80 个新测试 → 目标 80%+
预计成本：4-5 小时
```

#### authentication (71%) - **中等缺口**

```
Statements: 71.59%
Branches:   59.17%
Functions:  76.19%
Lines:      71.67%

子系统分布：
├── aggregates
│   └── auth-identity.spec.ts
│       Statements: 60.98% ❌ 缺口 19%
│
├── entities
│   ├── password-credential.spec.ts
│   │   Statements: 41.66% ❌ 最大缺口
│   └── oauth-binding.spec.ts: 部分测试
│
└── services
    ├── token-service.spec.ts: 存在
    └── [other services]: 部分覆盖

缺口分析：
❌ PasswordCredential entity: 41.66% (缺口 38%)
   ├─ 缺失：密码状态转换 (Active→Suspended→Revoked)
   ├─ 缺失：密码比较逻辑
   ├─ 缺失：年龄计算
   └─ 缺失：序列化往返

⚠️ AuthIdentity aggregate: 60.98% (缺口 19%)
   ├─ 缺失：identity 生命周期 (disable, enable, markDeleted)
   ├─ 缺失：登录路径移除约束
   └─ 缺失：OAuth 绑定管理边界

补充计划：
✅ PasswordCredential entity：+ 20-25 个测试
   ├─ 异步工厂 (create with IPasswordHasher mock)
   ├─ 状态转换 (suspend, revoke)
   ├─ 密码比较 (comparePassword)
   ├─ 年龄计算 (passwordAge, calculateAge)
   └─ 序列化 (toServerDTO, fromServerDTO)

✅ AuthIdentity aggregate：+ 10-15 个测试
   ├─ 生命周期 (disable, enable, markDeleted)
   ├─ 移除约束 (canRemoveEmailIdentifier)
   ├─ OAuth 绑定 (addOAuthBinding, removeOAuthBinding)
   └─ 登录路径检查 (hasOtherLoginPathAfter*)

总计：30-40 个新测试 → 目标 80%+
预计成本：3-4 小时
```

#### reminder (52%) - **最大缺口之一**

```
Statements: 52.49%
Branches:   44.29%
Functions:  55.56%
Lines:      52.59%

子系统分布：
├── aggregates
│   ├── reminder.spec.ts
│   │   Statements: 85% ✅ 已有基础测试
│   └── reminder-response.spec.ts
│       Statements: 0% ❌ 完全缺失
│
├── entities
│   ├── reminder-trigger.spec.ts: 部分
│   └── reminder-response.spec.ts: 缺失
│
└── services
    ├── ReminderAssessmentService (29.41%) ❌
    ├── ReminderControlService (27.27%) ❌
    └── [other services]: 缺失

缺口分析：
❌ ReminderAssessmentService: 29.41% (缺口 50%)
   └─ 规则评估、触发条件检查、时间计算等

❌ ReminderControlService: 27.27% (缺口 52%)
   └─ 创建、编辑、删除、查询、执行控制

❌ reminder-response entity: 0% (缺口 100%)
   ├─ 缺失：响应记录工厂
   ├─ 缺失：状态转换
   └─ 缺失：约束验证

补充计划：
✅ ReminderAssessmentService：+ 20-25 个测试
✅ ReminderControlService：+ 20-25 个测试
✅ reminder-response entity：+ 15-20 个测试
✅ reminder-trigger entity：+ 10-15 个测试

总计：65-85 个新测试 → 目标 80%+
预计成本：5-6 小时

优先级：P2（紧跟 AI 和 authentication 之后）
```

#### schedule (58%) - **中大缺口**

```
Statements: 58.12%
Branches:   51.82%
Functions:  59.26%
Lines:      58.60%

子系统分布：
├── aggregates
│   ├── schedule-task.spec.ts
│   │   Statements: 91.97% ✅ 充分覆盖
│   └── calendar-entry.spec.ts
│       Statements: 61.44% ❌ 缺口 18%
│
├── entities
│   ├── schedule-execution.spec.ts
│   │   Statements: 78.87% ⚠️ 接近目标
│   └── [other entities]: 部分覆盖
│
└── services
    ├── ScheduleExecutionEngine (0%) ❌
    ├── [other services]: 0%
    └── value-objects: 0% (未实现)

缺口分析：
⚠️ ScheduleExecution entity: 78.87% (缺口 1%)
   └─ 基本覆盖，仅需微调

❌ CalendarEntry aggregate: 61.44% (缺口 18%)
   ├─ 缺失：日程创建与加载
   ├─ 缺失：冲突检测算法
   ├─ 缺失：时间转换逻辑
   └─ 缺失：修改与删除约束

✅ ScheduleTask aggregate: 91.97% ✅ 充分

补充计划：
✅ CalendarEntry aggregate：+ 15-20 个测试
   ├─ 工厂方法 (create, fromServerDTO)
   ├─ 冲突检测 (hasConflictWith, isTimeOverlap)
   ├─ 时间转换 (convertTimezone, adjustOffset)
   └─ 修改约束 (canModify, canDelete)

✅ 其他微调：+ 5-10 个测试

总计：20-30 个新测试 → 目标 80%+
预计成本：2-3 小时

优先级：P2（中等）
```

#### governance (78%) - **微调**

```
Statements: 78.29%
Branches:   75%
Functions:  81.82%
Lines:      78.48%

缺口分析：
⚠️ 仅差 2% 即可达 80%
   ├─ 规则引擎测试可能不完整
   └─ 合规检查边界可能未覆盖

补充计划：
✅ 新增：+ 3-5 个边界测试

总计：3-5 个新测试 → 目标 80%+
预计成本：0.5-1 小时

优先级：P2（可选）
```

---

### 优先级 3：后续补充（<50%）

#### setting (21%) - **最小优先级**

```
Statements: 21.47%
Branches:   16.13%
Functions:  25.81%
Lines:      21.67%

分析：
❌ Setting 模块覆盖率极低（21%）
   原因：配置验证、序列化、合并策略等通常被视为"配置代码"

特点：
├─ Aggregate 有基础测试
├─ 大量 value-objects 未测试
└─ 合并策略（MergeStrategy）逻辑复杂但缺失测试

补充计划：
⏹️ 低优先级，建议后续统一处理
预计成本：3-4 小时

建议策略：
1. 先补 P1/P2 模块至 80%
2. 再统一处理 setting 等 P3 模块
3. 可能需要重新评估 setting 的 layer 标签
```

---

## 📋 工作分解结构 (WBS)

### 第一阶段：P2 优先级快速补充（1-2 周）

```
Phase 1: AI + Authentication + Schedule
├── AI Module (52% → 80%+)
│   ├── AIConversation aggregate (20-25 tests)
│   ├── Message entity (15-20 tests)
│   └── TokenUsage VO (15-20 tests)
│   └─ 预计时间：4-5 小时
│   └─ 预期成果：84%+
│
├── Authentication Module (71% → 80%+)
│   ├── PasswordCredential entity (20-25 tests)
│   ├── AuthIdentity lifecycle (10-15 tests)
│   └── OAuth binding (5 tests)
│   └─ 预计时间：3-4 小时
│   └─ 预期成果：84%+
│
└── Schedule Module (58% → 80%+)
    ├── CalendarEntry aggregate (15-20 tests)
    └── Minor adjustments (5-10 tests)
    └─ 预计时间：2-3 小时
    └─ 预期成果：80%+

合计：
├─ 新增测试数：150-200 个
├─ 预计工时：9-12 小时
└─ 目标达成率：3/12 模块（25%）

验证命令：
pnpm test:coverage:domain
# 应看到 ai, authentication, schedule 都 ≥80%
```

### 第二阶段：P2 其他模块 + Governance（2-3 周）

```
Phase 2: Reminder + Governance
├── Reminder Module (52% → 80%+)
│   ├── ReminderAssessmentService (20-25 tests)
│   ├── ReminderControlService (20-25 tests)
│   └── reminder-response entity (15-20 tests)
│   └─ 预计时间：5-6 小时
│   └─ 预期成果：80%+
│
└── Governance Module (78% → 80%+)
    └── Minor adjustments (3-5 tests)
    └─ 预计时间：0.5-1 小时
    └─ 预期成果：80%+

合计：
├─ 新增测试数：58-75 个
├─ 预计工时：5.5-7 小时
└─ 目标达成率：5/12 模块（42%）
```

### 第三阶段：P3 模块（3-4 周）

```
Phase 3: Editor + Domain-Shared + Setting
├── Editor (0% → 80%+)
│   ├── 核心 aggregate (40-50 tests)
│   ├── 核心 service (20-30 tests)
│   └── 核心 VO (10-15 tests)
│   └─ 预计时间：4-5 小时
│   └─ 预期成果：80%+
│
├── Domain-Shared (100% → 维持)
│   └─ 已完成，无需补充
│   └─ 预期成果：100% ✅
│
└── Setting (21% → 80%+)
    ├── Value-objects 测试 (20-30 tests)
    ├── MergeStrategy 算法 (15-20 tests)
    └── 序列化与验证 (10-15 tests)
    └─ 预计时间：3-4 小时
    └─ 预期成果：80%+

合计：
├─ 新增测试数：115-160 个
├─ 预计工时：7-9 小时
└─ 目标达成率：8/12 模块（67%）
```

---

## 🎯 成功标准

### 完成定义（Definition of Done）

对于每个模块，满足以下条件才认为"完成"：

1. **覆盖率阈值**

   ```
   ✅ Statements: ≥80%
   ✅ Lines: ≥80%
   ✅ Functions: ≥80%
   ✅ Branches: ≥70%
   ```

2. **测试覆盖**

   ```
   ✅ Aggregates: 有测试且覆盖核心业务
   ✅ Entities: 有测试且覆盖状态转换
   ✅ Value Objects: 有测试且覆盖约束
   ✅ Services: 有测试且覆盖领域逻辑
   ```

3. **代码质量**

   ```
   ✅ 无 linting 错误
   ✅ 无类型错误
   ✅ 测试可独立运行
   ```

4. **文档**
   ```
   ✅ 测试注释清晰
   ✅ 复杂逻辑有说明
   ✅ 测试可被他人维护
   ```

### 全局成功标准

```
最终验收：
$ pnpm test:coverage:domain

✅ 12 个模块全部通过
├─ account: 95%+ ✅
├─ ai: 80%+ ✅
├─ authentication: 80%+ ✅
├─ editor: 80%+ ✅
├─ goal: 92%+ ✅
├─ governance: 80%+ ✅
├─ notification: 89%+ ✅
├─ reminder: 80%+ ✅
├─ schedule: 80%+ ✅
├─ setting: 80%+ ✅
├─ task: 86%+ ✅
└─ domain-shared: 100% ✅

总体：12/12 (100%) 达成 80%+
```

---

## 📊 关键统计数据

### 当前状态快照

| 指标            | 数值        |
| --------------- | ----------- |
| 总模块数        | 12          |
| 已达 80%+       | 6           |
| 进行中 (70-79%) | 2           |
| 需补充 (<70%)   | 4           |
| 平均覆盖率      | 72.3%       |
| 总需新增测试数  | ~250-350    |
| 预计总工时      | ~20-25 小时 |

### 预计工作量分布

```
阶段分布：
Phase 1 (P2 快速): 40% (9-12 小时)
Phase 2 (P2 后续): 22% (5-7 小时)
Phase 3 (P3 其他): 38% (7-9 小时)
───────────────────────────────
总计:              100% (20-25 小时)

人力投入：
推荐单人集中投入 (2-3 周)
或分散安排 (4-6 周 并行)
```

---

## 🚀 后续行动

### 立即行动（今日起）

- [ ] 启动 Phase 1：AI + Authentication 模块
- [ ] 参考已有的 account/task/goal 测试模式
- [ ] 建立 TDD 工作流（快测试 + 逐步补充）

### 验证检查点

```bash
# 每天运行一次，检查进度
pnpm test:coverage:domain

# 针对单个模块调试
pnpm nx run <module>:test:coverage
```

### 文档维护

- [ ] 记录新发现的测试模式（对后续 P3 有帮助）
- [ ] 更新本报告中的进度
- [ ] 建立"常见坑位"知识库

---

**报告生成：** 2026-04-26  
**基线扫描命令：** `pnpm test:coverage:domain`  
**下次更新：** Phase 1 完成时（预计 2026-04-27）
