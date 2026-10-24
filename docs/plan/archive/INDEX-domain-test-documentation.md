---
tags:
  - index
  - navigation
  - documentation
description: 领域层测试系统文档索引
created: 2026-04-26T22:20:00
---

# 领域层测试系统文档索引

**索引日期：** 2026-04-26  
**当前进度：** 67% 完成（8/12 模块达成 80%+）

---

## 📖 文档地图

### 🚀 快速开始（新手必读）

```
├─ 2026-04-26-domain-test-quick-reference.md
│  └─ 5 分钟快速上手
│     ├─ 当前进度概览
│     ├─ 常用命令速查
│     ├─ TDD 测试模式范例
│     ├─ 常见坑位与解决方案
│     └─ 下周行动清单
│
└─ CHECKPOINT-domain-test-system.md
   └─ 10 分钟完成回顾
      ├─ 已生成文档体系
      ├─ 代码产出与配置优化
      ├─ 当前进度数据
      ├─ 待办事项
      └─ 文档导航指南
```

**推荐路径：** 先读快速参考卡 → 再读检查点总结 → 找到你的任务

---

### 📊 深度分析与规划

#### 1. 完整实现报告

**文件：** `2026-04-26-domain-test-system-implementation-report.md` (13.5 KB, 30+ 分钟)

**适合对象：** 想理解完整实施路径的人

**核心内容：**

- **执行摘要** → 当前 67% 完成，下一步行动
- **工作目标与范围** → 12 个核心模块、80% 阈值、治理策略
- **基线摸底** → 扫描方法、关键发现、优秀基线、需补充模块
- **核心完成部分**
  - AI 模块（52% → 84.72%）：68 个测试，3 个关键发现
  - Authentication（71% → 84.01%）：32 个测试，异步工厂 + 约束设计
- **进行中模块**
  - Schedule（58% → 77.93%）：28 个测试，差 2% 缺口分析
  - Reminder（52% → 59.73%）：20% 缺口分析与补充策略
- **技术决策与最佳实践**
  - 覆盖率配置战略（一行改动跳 23%）
  - TDD 三层测试模式（工厂 + 操作 + 约束）
  - 异步工厂与 mock 策略
- **覆盖率治理机制**
  - include/exclude 规则
  - 80/80/80/70 阈值
  - 强制 CI 门禁
- **已产出文件清单** → 6 个文件，128 个新测试
- **工作流与命令参考** → 本地开发、CI、排障
- **常见问题与回答** → 为什么 80%、为什么排除 enum、等

**快速导航：**

- 想了解 AI 模块的完整实现？→ 搜索"AI 模块"
- 想看时间戳精度问题的解决？→ 搜索"时间戳精度"
- 想了解为什么排除 enum？→ 搜索"排除策略"
- 想了解 TDD 三层模式？→ 搜索"TDD 测试模式"

---

#### 2. 基线扫描报告

**文件：** `baseline-report.md` (11.5 KB, 25+ 分钟)

**适合对象：** 需要全景数据、工作计划的人

**核心内容：**

- **全景总览** → 覆盖率分布表、优先级划分
- **详细数据**（按优先级）
  - P1 无需补充：account, task, goal, notification, editor, domain-shared
  - P2 立即补充：ai, authentication, reminder, schedule, governance
  - P3 后续补充：editor, setting
- **工作分解结构** → 3 个阶段、预计工时、预期成果
- **成功标准** → DoD、覆盖率阈值、验收条件
- **关键统计** → 12 个模块、250-350 个测试、20-25 小时工时

**快速导航：**

- 想知道 reminder 需要补充什么？→ 搜索"reminder"
- 想看 schedule 的详细缺口？→ 搜索"schedule"
- 想了解工作量分布？→ 搜索"工作分解"
- 想查看成功标准？→ 搜索"成功标准"

---

### 🔧 参考资料与实例

#### 测试代码范例

```
已有的测试文件（可直接参考复用）：

AI 模块：
├─ packages/ai/src/domain-server/aggregates/__tests__/ai-conversation.spec.ts
│  └─ 24 个测试，覆盖消息管理、Token 追踪、事件发射
├─ packages/ai/src/domain-server/entities/__tests__/message.spec.ts
│  └─ 20 个测试，覆盖内容验证、时间戳、ID 格式
└─ packages/ai/src/domain-server/value-objects/__tests__/token-usage.spec.ts
   └─ 24 个测试，覆盖用量计算、边界检验、超额状态

Authentication 模块：
├─ packages/authentication/src/domain-server/entities/__tests__/password-credential.spec.ts
│  └─ 25 个测试，覆盖状态转换、密码比较、年龄计算
└─ packages/authentication/src/domain-server/aggregates/__tests__/auth-identity.spec.ts
   └─ +7 个新测试，覆盖生命周期、OAuth 绑定、移除约束

Schedule 模块：
└─ packages/schedule/src/domain-server/entities/__tests__/schedule-execution.spec.ts
   └─ 28 个测试，覆盖状态转换、结果管理、序列化
```

**使用建议：**

1. 仿照这些文件的结构补充 Schedule + Reminder
2. 复用三层测试模式（create + operations + constraints）
3. 注意时间戳、ID 格式、异步工厂等坑位

---

#### 配置参考

**文件：** `vitest.shared.ts` (workspace root)

**关键行号：**

- Line 58-72：coverage include 路径定义
- Line 83-93：coverage exclude 规则
- Line 98-102：GOVERNED_DOMAIN_COVERAGE_THRESHOLDS 定义

**重点改动：**

```typescript
// Line 63: 添加 entities 路径
include: [
  'src/domain-server/aggregates/**',
  'src/domain-server/entities/**', // ← 新增
  'src/domain-server/services/**',
  'src/domain-server/value-objects/**',
];

// Lines 83-93: 排除无逻辑的文件
exclude: [
  '**/index.ts',
  '**/*.d.ts',
  '**/*.{test,spec}.ts',
  '**/value-objects/*-status.ts', // Enum
  '**/schedule/src/domain-server/aggregates/schedule.ts', // Re-export
];

// Lines 98-102: 设置阈值
const GOVERNED_DOMAIN_COVERAGE_THRESHOLDS = {
  statements: 80,
  lines: 80,
  functions: 80,
  branches: 70,
};
```

---

## 🎯 快速导航按场景

### 场景 1：我是新手，想快速上手

```
1. 读 2026-04-26-domain-test-quick-reference.md（5 min）
   ↓
2. 找到你的任务模块（ai/auth/schedule/reminder）
   ↓
3. 查看该模块的测试范例代码
   ↓
4. 参考三层 TDD 模式补充测试
   ↓
5. 运行 pnpm nx run <module>:test:coverage 验证
```

### 场景 2：我是 PM/架构师，想了解全景

```
1. 读 CHECKPOINT-domain-test-system.md（10 min）
   ↓
2. 查看 baseline-report.md 的工作分解结构（15 min）
   ↓
3. 了解当前进度与剩余工作量
   ↓
4. 查阅 2026-04-26-domain-test-system-implementation-report.md
    的成功标准部分（5 min）
```

### 场景 3：我要补充 Schedule 或 Reminder，但不知道从何下手

```
1. 读 baseline-report.md 中对应模块的详细分析
   ↓
2. 查看该模块已有的测试文件（e.g., schedule-execution.spec.ts）
   ↓
3. 看 2026-04-26-domain-test-quick-reference.md 的"三层 TDD 模式"
   ↓
4. 新建或补充 aggregate 测试文件
   ↓
5. 运行 pnpm nx run <module>:test:watch 进行 TDD 开发
```

### 场景 4：我在排障，测试通不过或覆盖率不达标

```
1. 查看 2026-04-26-domain-test-quick-reference.md 的"常见坑位"
   ↓
2. 如果是时间戳问题 → 加 2ms 延迟
   如果是 ID 格式 → 检查前缀
   如果是异步工厂 → 确保 mock 了依赖
   ↓
3. 仍未解决？→ 查看对应模块的测试范例找灵感
   ↓
4. 查看 2026-04-26-domain-test-system-implementation-report.md
    的"关键技术发现"部分
```

### 场景 5：我想了解为什么采用这种设计

```
1. 查看 2026-04-26-domain-test-system-implementation-report.md 的
   "关键技术决策"部分（"设计决策 1/2/3"）
   ↓
2. 查看"覆盖率治理机制"部分了解阈值与排除规则
   ↓
3. 查看"常见问题与回答"部分
```

---

## 📈 指标速查表

### 模块覆盖率现状

| 模块           | 基线 | 现状   | 目标 | 状态              |
| -------------- | ---- | ------ | ---- | ----------------- |
| account        | 95%  | 95%    | ✅   | 无需补充          |
| ai             | 52%  | 84.72% | ✅   | 已完成            |
| authentication | 71%  | 84.01% | ✅   | 已完成            |
| domain-shared  | 100% | 100%   | ✅   | 无需补充          |
| editor         | 0%   | 0%     | ⏳   | P3，待启动        |
| goal           | 92%  | 92%    | ✅   | 无需补充          |
| governance     | 78%  | 78%    | ⏳   | 差 2%，P2 后续    |
| notification   | 89%  | 89%    | ✅   | 无需补充          |
| reminder       | 52%  | 59.73% | ⏳   | 差 20%，P2 进行中 |
| schedule       | 58%  | 77.93% | ⏳   | 差 2%，P2 进行中  |
| setting        | 21%  | 21%    | ⏳   | P3，待启动        |
| task           | 86%  | 86%    | ✅   | 无需补充          |

### 新增测试统计

| 模块           | 新增测试 | 覆盖范围                 |
| -------------- | -------- | ------------------------ |
| ai             | 68       | 3 个 aggregate/entity/VO |
| authentication | 32       | 2 个 entity/aggregate    |
| schedule       | 28       | 1 个 entity              |
| 合计           | **128**  | **6 个文件**             |

### 工时估算

| 阶段     | 内容                  | 工时           |
| -------- | --------------------- | -------------- |
| Phase 1  | ai + auth + schedule  | 9-12 小时      |
| Phase 2  | reminder + governance | 5-7 小时       |
| Phase 3  | editor + setting      | 7-9 小时       |
| **总计** |                       | **20-25 小时** |

---

## 🔗 文件位置总览

```
docs/plan/active/
├─ 2026-04-26-domain-test-system-implementation-report.md (完整报告，13.5 KB)
├─ 2026-04-26-domain-test-quick-reference.md (快速卡，6.7 KB)
├─ baseline-report.md (基线扫描，11.5 KB)
├─ CHECKPOINT-domain-test-system.md (检查点总结，5.7 KB)
└─ [当前文件] (索引，你在这里)

配置文件：
└─ vitest.shared.ts (workspace root, Line 58-102)

测试代码范例：
├─ packages/ai/src/domain-server/aggregates/__tests__/ai-conversation.spec.ts
├─ packages/ai/src/domain-server/entities/__tests__/message.spec.ts
├─ packages/ai/src/domain-server/value-objects/__tests__/token-usage.spec.ts
├─ packages/authentication/src/domain-server/entities/__tests__/password-credential.spec.ts
├─ packages/schedule/src/domain-server/entities/__tests__/schedule-execution.spec.ts
└─ [更多文件...]

项目治理：
└─ AGENT.md (repository 级别规范)

测试架构文档：
└─ docs/test/architecture.md (已有文档，可参考更新)
```

---

## ✅ 使用清单

- [ ] 已阅读快速参考卡（2026-04-26-domain-test-quick-reference.md）
- [ ] 已查看基线报告（baseline-report.md）
- [ ] 已找到我的任务模块（ai/auth/schedule/reminder/其他）
- [ ] 已查看该模块的测试范例代码
- [ ] 已理解三层 TDD 测试模式
- [ ] 已了解常见坑位与解决方案
- [ ] 已确认 vitest.shared.ts 的配置改动

---

## 📝 文档维护

**最后更新：** 2026-04-26 22:20  
**下次更新计划：**

- Schedule 达成 80% 时 → 更新进度、索引、检查点
- Reminder 达成 80% 时 → 同上
- 所有 12 个模块达成时 → 生成最终总结

**问题反馈：**
如发现文档不完整、不清晰或有误，请：

1. 查看该文档的"快速导航"部分
2. 搜索对应关键字
3. 如仍未解决，参考另外两份报告查证

---

**快速链接：**

- 📖 [完整实现报告](2026-04-26-domain-test-system-implementation-report.md)
- 🚀 [快速参考卡](2026-04-26-domain-test-quick-reference.md)
- 📊 [基线扫描报告](baseline-report.md)
- 🔔 [检查点总结](CHECKPOINT-domain-test-system.md)
