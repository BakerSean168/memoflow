> Superseded by `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`. 本文仅保留为 P0-1 阶段方案归档。

# P0-1 澄清式 Goal 创建 - 完整方案总结

**项目**：memoflow
**优先级**：P0（基础产品流）  
**技术方案**：Route 2 - Unified AI Workflow Orchestrator  
**完成日期**：2026-04-28

---

## 📍 任务概述

在用户直接生成 goal draft 之前，增加一个 **clarification 阶段**。

### 背景

- 当前 Chat Goal Tool 是唯一的主产品入口
- 用户输入的信息可能不足，导致生成的 goal 过于模糊
- 需要系统主动补齐信息缺口

### 目标

- 系统先判断用户输入是否足够
- 信息不足时返回澄清问题（而不是直接出 draft）
- 用户回答后，信息并入下一轮规划
- 工作流状态可恢复（刷新页面后）

### 验收标准

- ✅ 模糊 idea → 系统返回澄清问题
- ✅ 前端显示问题列表 & 收集回答
- ✅ 继续生成 goal draft
- ✅ 刷新页面，澄清状态恢复

---

## 🏗 完整的分层架构

### 数据流（完整视图）

```
用户在前端输入 idea + 点击"生成 Goal Draft"
  ↓
AIChatView.generateGoalDraftFromConversation()
  ├─ 阶段 1：询问是否需要澄清（enableClarification=true）
  │  ↓
  │  AIClientService.generateGoal({
  │    idea, includeKeyResults, enableClarification: true, ...
  │  })
  │  ↓
  │  POST /api/ai/goal-planning
  │  ↓
  │  backend-automation-tool-executor
  │    → goal_planning_service.clarify()
  │    → Python LLM
  │  ↓
  │  响应：{ state: "clarification", questions: [...] }
  │         或 { state: "draft", goal: {...} }
  │
  └─→ 前端接收响应
      ├─ state="clarification" → 显示澄清问题卡片
      │  用户填写答案 → 点击"继续"
      │  ↓
      │  阶段 2：重新调用（enableClarification=false, clarificationAnswers=[...])
      │
      └─ state="draft" → 显示 goal draft 卡片
         用户可编辑 → 创建

localStorage: 持久化澄清状态
  → 刷新页面时恢复当前工作流阶段
```

### 分层改动清单

| 层级       | 文件                                          | 改动                   | 代码量  |
| ---------- | --------------------------------------------- | ---------------------- | ------- |
| **Python** | `goals.py`                                    | 新增 Schema            | 50 行   |
|            | `goal_planning_service.py`                    | 新增方法 + 提示词      | 150 行  |
| **API**    | `backend-automation-tool-executor.adapter.ts` | 路由澄清逻辑           | 30 行   |
| **TS**     | `ai-client-service.ts`                        | 扩展方法签名           | 20 行   |
| **Vue**    | `AIChatView.vue`                              | 新增状态 + UI + 持久化 | 150 行  |
| **总计**   |                                               |                        | ~400 行 |

---

## 📚 已生成的文档

位置：`docs/guides/ai/`

### 1. **p0-1-clarification-implementation-plan.md**

- 任务概述和验收标准
- 分阶段任务清单
- 时间估算和风险评估
- **使用场景**：项目管理，跟踪进度

### 2. **p0-1-python-implementation-guide.md**

- 逐步可执行的 Python 编码指南
- 5 个具体步骤（复制即用）
- 测试验证方法
- **使用场景**：立即开始 Python 实现

### 3. **code-review-python-p0-1.md**

- Python 层深度代码审查
- 当前架构分析
- 5 大改动点的设计理由
- 提示词设计注意事项
- **使用场景**：理解设计，讨论方案

### 4. **code-review-frontend-p0-1.md**

- Vue 前端深度代码审查
- 当前工作流流程
- 5 大改动点（状态、函数、UI、持久化）
- 与其他组件的关系
- **使用场景**：理解前端架构，规划 UI

### 5. **p0-1-澄清式-goal-创建-完整方案总结.md**

- 本文档
- 快速参考和导航

---

## 🚀 快速开始

### 路径 A：立即编码（推荐）

1. **打开**：`p0-1-python-implementation-guide.md`
2. **执行**：5 个步骤，按顺序复制代码
3. **验证**：运行 Python 测试
4. **输出**：Python 层完成

**耗时**：1.5-2 小时

### 路径 B：先深入理解

1. **阅读**：
   - `code-review-python-p0-1.md`（Python 架构）
   - `code-review-frontend-p0-1.md`（前端架构）
2. **讨论**：确认设计决策
3. **实现**：按照 implementation guide 执行

**耗时**：2-3 小时

### 路径 C：分块并行

1. **一人**：执行 Python 实现指南（1.5-2h）
2. **另一人**：设计前端 UI 和本地化字符串（1-1.5h）
3. **一起**：集成和测试（1-2h）

**耗时**：6-10 小时（分工）

---

## 📊 关键指标

### 复杂度评估

| 维度         | 评估   | 说明                     |
| ------------ | ------ | ------------------------ |
| **后端逻辑** | ⭐⭐   | 两个新方法，逻辑清晰     |
| **前端状态** | ⭐⭐⭐ | 引入新阶段，状态管理复杂 |
| **API 设计** | ⭐     | 基本路由，无复杂逻辑     |
| **UI 实现**  | ⭐⭐   | 新卡片，类似现有 UI      |
| **测试覆盖** | ⭐⭐⭐ | E2E + localStorage 恢复  |
| **总体**     | ⭐⭐⭐ | **中等复杂度**           |

### 时间分解

| 阶段     | 任务            | 单人      | 双人         |
| -------- | --------------- | --------- | ------------ |
| 1        | Python 澄清逻辑 | 2-3h      | 2-3h         |
| 2        | API 路由        | 1-2h      | 1-2h         |
| 3        | 前端集成        | 2-3h      | 1-1.5h       |
| 4        | 测试优化        | 1-2h      | 0.5-1h       |
| **总计** |                 | **6-10h** | **4.5-7.5h** |

### 风险评估

| 项目         | 等级  | 说明                 | 缓解                        |
| ------------ | ----- | -------------------- | --------------------------- |
| 澄清逻辑隔离 | 🟢 低 | 不改现有方法         | 新增独立方法                |
| 前端状态管理 | 🟡 中 | 状态转换复杂         | 充分 E2E 测试               |
| 提示词质量   | 🟡 中 | 澄清准确性           | 迭代优化 + regression cases |
| 向后兼容     | 🟢 低 | Response schema 扩展 | 默认值设计                  |
| Token 成本   | 🟢 低 | 额外 API 调用        | 可选澄清 + 缓存             |

---

## 🎯 详细任务清单

### 阶段 1：Python 澄清逻辑

**负责人**：后端工程师  
**文件**：

- `apps/ai-service/src/ai_service/schemas/goals.py`
- `apps/ai-service/src/ai_service/services/goal_planning_service.py`

**具体任务**：

- [ ] 阅读 `code-review-python-p0-1.md` 理解设计
- [ ] 按 `p0-1-python-implementation-guide.md` 第 1-4 步执行
- [ ] 运行第 5 步的测试
- [ ] 提交 PR 或 commit

**完成标准**：Python 测试全部绿灯

---

### 阶段 2：API 路由和包装

**负责人**：后端 / 全栈工程师  
**文件**：

- `apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`
- `packages/ai/src/application-client/ai-client-service.ts`

**具体任务**：

- [ ] 修改 API 路由，添加澄清判断逻辑
- [ ] 扩展 AIClientService 方法签名
- [ ] 用 curl 测试 API 端点
- [ ] 验证响应格式正确

**完成标准**：API 端点返回正确的两种响应

---

### 阶段 3：前端集成

**负责人**：前端工程师  
**文件**：

- `packages/app-vue/src/modules/ai/views/AIChatView.vue`

**具体任务**：

- [ ] 新增 ref 状态（6 个）
- [ ] 改进 `generateGoalDraftFromConversation()` 方法
- [ ] 添加澄清问题 UI 卡片
- [ ] 修改 localStorage 持久化逻辑
- [ ] 手动测试工作流

**完成标准**：澄清流程可用，状态恢复正确

---

### 阶段 4：测试和优化

**负责人**：全员  
**具体任务**：

- [ ] E2E 测试（各种 idea 类型）
- [ ] localStorage 恢复测试
- [ ] 错误处理测试
- [ ] UI 细节和本地化
- [ ] 集成到测试套件

**完成标准**：所有测试通过，可发布

---

## 📖 学习资源

### 技术背景

- **Route 2 方案**：`route-2-unified-ai-workflow-orchestrator-plan.md`
- **学习指南**：`memoflow-ai-goal-learning-guide.md`
- **功能 Backlog**：`memoflow-ai-goal-feature-backlog.md`

### 相关实现

- **聊天流式实现**：`ai-chat-streaming-current-implementation.md`
- **当前工作流**：`ai-goal-creation-current-workflow.md`

---

## 📝 本地化字符串

需要添加到 i18n 配置：

```
aiAssistant.chatPage.workflow.clarificationRequired = "澄清所需"
aiAssistant.chatPage.workflow.clarifyYourGoal = "澄清你的目标"
aiAssistant.chatPage.workflow.clarificationDescription = "我们需要更多信息来更好地规划你的目标"
aiAssistant.chatPage.workflow.enterAnswer = "输入你的回答..."
aiAssistant.chatPage.workflow.continueWithAnswers = "继续"
aiAssistant.chatPage.workflow.skipClarification = "跳过澄清"
aiAssistant.dialogs.generateGoal.clarifying = "正在澄清..."
```

---

## 🔗 依赖关系

```
p01-python-clarification ✅
  ↓
p01-api-routing
  ↓
p01-ts-client
  ↓
p01-vue-ui
  ↓
p01-state-persistence
  ↓
P0-1 完成 ✅
  ↓
后续 P0 项目（P0-2, P0-3, P0-4）
  ↓
P1 项目（Unified AI Workflow Orchestrator）
```

---

## 🎓 关键学习点

完成 P0-1 后，你将学到：

1. **多轮 AI 工作流设计**
   - 两阶段规划逻辑
   - 状态机管理
   - 前后端协调

2. **提示词工程**
   - 澄清检查提示词
   - JSON schema 约束
   - 模型返回格式控制

3. **前端状态管理**
   - 复杂工作流阶段管理
   - localStorage 持久化
   - 会话级状态恢复

4. **工程化能力**
   - 两阶段 LLM 调用成本管理
   - 错误处理和降级策略
   - 向后兼容性设计

---

## 🚦 下一步

选择你的路径：

### 🟢 立即开始

```bash
# 打开编码指南
cat docs/guides/ai/p0-1-python-implementation-guide.md

# 开始第 1 步
# 编辑：apps/ai-service/src/ai_service/schemas/goals.py
```

### 🟡 先讨论设计

```bash
# 阅读代码审查文档
cat docs/guides/ai/code-review-python-p0-1.md
cat docs/guides/ai/code-review-frontend-p0-1.md

# 与团队讨论设计决策
```

### 🟣 查看任务管理

```bash
# 查看完整的任务清单
cat docs/guides/ai/p0-1-clarification-implementation-plan.md
```

---

## 📞 问题排查

### Q: 应该从哪里开始？

**A**: 推荐顺序：

1. Python（底层）→ API → 前端（表现层）
2. 理由：从下往上，依赖关系清晰

### Q: 如果澄清 LLM 调用失败怎么办？

**A**: 前端应该降级：

- 捕获异常
- 提示用户
- 给予"跳过澄清"选项
- 直接进入 draft 生成

### Q: Token 成本如何管理？

**A**: 建议措施：

- 澄清检查可选（default=true，但可关闭）
- 监控 usage 字段
- 考虑缓存同一 idea 的澄清结果
- 用 local LLM 做澄清检查

### Q: 如果提示词效果不好怎么办？

**A**: 迭代步骤：

1. 收集失败 cases
2. 调整提示词
3. 运行 regression tests
4. 部署新版本

---

## ✨ 总结

P0-1 是 Route 2 路线的**第一个可交付产品增强**。完成它之后：

- ✅ Chat Goal Tool 支持澄清流程
- ✅ 用户体验提升（信息不足不再直接生成）
- ✅ 系统更可靠（生成的 goal 质量更高）
- ✅ 为后续 P0 项目打下基础

**预计总投入**：6-10 小时  
**预期收益**：

- 学习 AI 工作流设计
- 积累两阶段规划经验
- 为求职作品增加亮点

---

**文档更新日期**：2026-04-28  
**状态**：就绪，可开始实现  
**下一步**：选择路径 A/B/C，开始编码！
