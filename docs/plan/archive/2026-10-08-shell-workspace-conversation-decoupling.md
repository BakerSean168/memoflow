---
tags: [plan, archive]
description: Shell 全局业务工作区与 AI 会话生命周期解耦
created: 2026-10-08
---

# Shell 工作区与会话解耦

用户已授权实施；基于 main，在独立分支和 worktree 中完成。

## 范围与约束

- AppShell 管理全局业务 Tab、路由、面板显隐和几何偏好；AI 会话不拥有这些状态。
- 删除按 conversationId 保存/恢复布局的路径，以及新建会话回 Home 的联动。
- 全局用户布局偏好独立持久化，窄屏 focus 仅临时生效，空间恢复后遵从用户偏好。
- 用户确认收敛范围：取消历史 Workflow 自动打开原生审核/已完成 Goal 详情；原生审核草稿绑定与离开保护维持现状，跨会话保留审核草稿另行设计。普通 chat 生命周期不触发无关业务表单的离开确认。
- 保留 8 Tab 上限、KeepAlive、路由恢复、关闭确认、脏表单保护、业务引用和会话 Workflow。
- 沿用原 Shell 存储键和 Tab 记录；旧会话布局字段退休，无迁移或兼容层。

## 执行与验收

1. 在 AppShell 公共事件与路由组件实例上复现会话切换、新建、删除导致布局或业务导航变化。
2. 收敛 store 与 Shell 会话处理器；同步检查路由入口对布局的自动派生。
3. 验证草稿、滚动、路由、Tab、宽度、面板显隐与组件实例在会话操作后保持不变。
4. 验证真实 Pinia 持久化恢复全局偏好与既有 Tab；viewport focus 不写入长期偏好。
5. 运行最近 Nx 验证和仓库 validate-local-deploy，记录证据；完成后归档。

## 完成结果

- 删除会话布局 map、draft 暂存与恢复 watcher；新建会话不再重置布局或回 Home。
- 全局 layoutPreference 继续使用原 Shell 存储键；实际布局与 viewport 约束不持久化。
- 普通 Chat/Knowledge Q&A 的会话操作不触发无关业务离开确认；历史 Goal/Task/Knowledge Workflow 只恢复 AI 投影，原生审核由用户显式打开。实时 Goal 完成导航保留。
- 原生 Workflow 审核仍使用现有 busy/dirty 离开保护；跨会话保留审核草稿未纳入本次任务。
- 行为回归先红后绿：Shell 会话操作导致布局重置、历史 Workflow 自动开页、普通 Chat 被无关 dirty 表单拦截均有复现测试。
- 测试覆盖 split/focus × 面板显示/隐藏 × 切换/新建/删除，验证草稿、滚动、路由、宽度、Tab 与组件实例；同时覆盖旧 Tab 存储、全局布局持久化、窄屏恢复、实时完成导航与审核保护。
- `pnpm nx affected -t lint --base=main`：6 projects，通过。
- `pnpm nx affected -t typecheck --base=main`：Vue/Web/Desktop 与 30 个依赖任务，通过。
- `pnpm nx affected -t test --base=main`：6 projects，通过。
- `pnpm nx run memoflow:governance-check`：通过；新增测试清单已由 `pnpm test:inventory` 更新。
- 仓库 validate-local-deploy：pass，无 warnings/blockingIssues；此改动未触发 Docker 验证。最终机器报告与人类报告位于 `reports/local-deploy-validation/latest.json` / `latest.md`。
