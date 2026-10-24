---
tags:
  - plan
  - archive
  - handoff
  - windows
  - residual
description: Windows 本机收尾 vault-repo active plan 的 agent 任务提示词（Residual 1338+）
created: 2026-07-25T00:00:00
updated: 2026-07-26T00:00:00
---

---

> **归档结果（2026-07-26）**：Windows 本机收尾完成（§13.2 15/15 + multi-engine Host E2E）；handoff 历史材料。  
> 主 vault plan 已迁 [`./2026-07-16-obsidian-vault-repository-optimization.md`](./2026-07-16-obsidian-vault-repository-optimization.md)。  
> 当前主目标：[`./2026-07-26-codebase-elegance-foundation.md`](./2026-07-26-codebase-elegance-foundation.md)（PR #189）。

# Windows 本机收尾：vault-repo residual handoff（Residual 1338+）

> **用法**：在 Windows 主机上 `git pull` 本分支后，把 **§ 任务提示词（可整段交给 agent）** 整节交给本机 agent 执行。  
> **主计划**：[`2026-07-16-obsidian-vault-repository-optimization.md`](./2026-07-16-obsidian-vault-repository-optimization.md) §13.2。  
> **相关计划**：[`2026-07-17-unified-assistant-agent-host.md`](2026-07-17-unified-assistant-agent-host.md)（ADR-035 multi-engine durable）。
> **远程 tip 基线**：`2db22956d`（residual 1337）及之前 1335–1336；分支 `feat/obsidian-vault-repository-optimization`。

---

## 背景（人类可读摘要）

远程 Linux 已完成可自动化外围 E2E 与门禁主线；§13.2 仍 **12 [x] / 3 [ ]**，PR readiness **no**。  
剩余更适合 Windows 本机：交互式 GitHub OAuth 登录同意、Windows 原生 Desktop 产品 E2E 证据、（克制）Agent durable/跨端产品证据。  
不要重做远程已绿套件当主交付；每轮写 Residual 1338+ 与 open-items surface；**只有证据充分才改 checkbox**。

---

## 任务提示词（可整段交给 agent）

```text
# 任务：Windows 本机收尾 vault-repo active plan（Residual 1338+）

## 身份与真值
你是本仓库协作 agent。唯一规范入口：`AGENT.md`。
真值顺序：当前代码/配置/测试 > 根配置 > `docs/` > 历史材料。
主计划：`docs/plan/archive/2026-07-16-obsidian-vault-repository-optimization.md`（§13.2）。
本 handoff 文件：`docs/plan/archive/2026-07-25-windows-vault-repo-residual-handoff.md`。
相关但独立：`docs/plan/active/2026-07-17-unified-assistant-agent-host.md`（ADR-035 multi-engine durable 产品路径）。

## 起点（远程 Linux 已完成，不要重做）
分支：`feat/obsidian-vault-repository-optimization`
tip 至少包含：`2db22956d`（residual 1337）及之前 1335–1336 修复。

远程已绿证据（勿宣称需要重跑才能开始，可作 smoke 复验）：
- workspace lint 36/36、typecheck 34/34、标准 test 30/30
- governance-check GOV_EXIT:0
- `web:e2e` 默认 testMatch **71/71**
- `web:e2e:shell` **8/8**、`web:e2e:ai-workspace` **8/8**、`web:e2e:sync` **3/3**
- `desktop:e2e` **1/1**（Linux xvfb 路径）
- prod-like `pnpm docker:local:up` 六服务 healthy
- `desktop:test:live-github` **1/1**（App install 148867606 / fixture repo）
- e2e-mock OAuth 已有；**真人交互式 GitHub OAuth 登录同意**被明确延后到 Windows

§13.2 当前诚实状态：**12 [x] / 3 [ ]**，PR readiness **no**。
未打勾三项（只有充分证据才可改 checkbox）：
1. 账密、GitHub 和访客入口均可用 — **部分**（缺交互式浏览器 GitHub OAuth 用户同意 E2E）
2. Agent 上下文不能逃逸 Vault… — **部分**（缺 durable multi-engine / 跨端产品 E2E；大量 unit/fixture 已在）
3. 相关 lint/typecheck/test/Web·Desktop E2E/governance/prod-like — **部分**（远程门禁与多套 E2E 已绿，但「全量 PR 门禁一揽子」与交互式 OAuth 未宣称）

## 目标（优雅完整实施，不是堆 patch）
在 Windows 上完成剩余可本地完成证据，使 active plan 能诚实收口或诚实 handoff：
- 优先关闭 §13.2 第 1 项缺口：交互式 GitHub OAuth 登录同意（Web 主路径；Desktop 若有真实 OAuth UI 一并覆盖）
- 尽量补齐 Windows 原生 Desktop 产品 E2E 证据（不要只依赖远程 xvfb）
- Agent 项：仅在有真实跨端/durable multi-engine 产品证据时增强；**不要**用更多 unit 假绿翻勾；完整 ADR-035 durable 可指向 agent-host plan，vault plan 不强行翻勾
- 全量门禁项：Windows 上复跑关键子集 + 记录本机 Desktop/OAuth 证据；仍禁止无证据宣称 PR ready
- 每轮结束写 **Residual 1338+** 到主 plan + 更新 `packages/app-vue/src/views/section-13-2-dod-open-items.surface.spec.ts`
- **只有证据充分才改 §13.2 checkbox**；否则保持 12/15 与 PR readiness no，但要把「Windows 已做/未做」写清楚
- 本 handoff 文件可追加「Windows 执行记录」小节，但 §13.2 checkbox 真值仍以主 plan 为准

## 硬约束
- 用 `pnpm` / `pnpm nx ...`；优先离改动最近的 target
- 不引入临时 shim、双轨兼容；根因修复
- 不提交密钥、`.env*.local`、Playwright report 二进制/HTML 产物、trace/webm/png
- 不 force-push；常规 commit + push 当前功能分支
- 不把 e2e-mock OAuth 当成「交互式 OAuth 已完成」
- 不把远程 71/71 或 shell/sync 再跑一遍当作本轮主要交付（可选 smoke）
- 计划状态与 checkbox 必须诚实；优雅收口 = 证据闭环 + 文档一致 + 可复跑命令，不是勾选表演

## Windows 环境准备
1. `git fetch && git checkout feat/obsidian-vault-repository-optimization && git pull`
2. 确认 tip ≥ `2db22956d`（随后可能已有本 handoff 文档提交，以 pull 后 tip 为准）
3. `pnpm install`（若需要）
4. 确认本机已有 gitignored 凭据（不要提交、不要打印 secret）：
   - `.env.test.local` / `.env.development.local` 中的 `GITHUB_OAUTH_CLIENT_ID/SECRET`
   - GitHub App / live-github 相关 fixture（远程已用过 `memoflow-dev-test`、installation 路径）
5. OAuth App 回调 URL 必须覆盖本机 Web 源（常见 `http://127.0.0.1:5173` / e2e web origin）；缺则先改 GitHub OAuth App 设置再测
6. Desktop：确保 Electron 能在本机启动；日志目录参考 AGENT.md（MemoFlow-Dev logs）

## 推荐执行顺序（严格按序，失败先修再往下）

### A. 基线 smoke（短）
pnpm nx run memoflow:governance-check
pnpm nx run app-vue:test -- section-13-2-dod-open-items
可选：`pnpm nx run web:e2e` 或更小 auth 子集（非主交付）。

### B. 交互式 GitHub OAuth（本轮 P0，关闭 §13.2 入口缺口）
目标故事（同一用户会话可证明）：
1. 打开 Web Auth（AuthApp / 硬跳转路径，不是死 shell AuthView）
2. 点击真实 GitHub 登录（非 mock provider）
3. 浏览器完成 GitHub 同意 / 授权
4. 回调落地，建立已登录 session（`hasOAuth` / identity 可见）
5. **证明** GitHub 登录 ≠ knowledge-repo App 授权（身份与仓库授权解耦；已有 matrix step 可对照）
6. 可选：登录后进入 shell，做一次轻量已认证页面断言

实现策略（按可行性选最干净的一条，优先可重复）：
- 若已有 headed Playwright + 真实 provider 路径：扩展/新增 spec（注意 `playwright.config.ts` 当前 exclude 了 `auth-oauth.spec.ts` 的 mock 路径；不要把 mock 与 real 混为一谈）
- 若自动化 consent 不稳定：允许 **半自动**（Playwright headed + 人工点同意一次）或 **手动 checklist + 截图/日志证据**，但必须写入 plan 的可复核步骤与结果
- 禁止：只跑 mock `Authentication - GitHub OAuth (mock provider)` 就宣称入口 DoD 完成

相关代码入口（先读再改）：
- `apps/web/src/auth/useWebAuth.ts`（getOAuthUrl / completeGithubOAuth）
- `apps/web/src/auth/WebAuthView*.ts*`
- `apps/web/e2e/authentication/*`
- `packages/app-vue` three-login matrix / AuthPlatformEntry
- API env：`GITHUB_OAUTH_*`（schema 在 `apps/api` env）

验收：
- 至少 1 条 **真实** OAuth 登录成功证据（自动化优先）
- 文档写明命令、origin、是否 headed、是否人工步骤
- 若因此入口项可诚实打勾：更新 §13.2 第 1 项为 [x] 并写清证据边界；否则保持 [ ] 并写清差什么

### C. Windows Desktop 产品 E2E（P0/P1）
pnpm nx run desktop:e2e
pnpm nx run web:e2e:shell
- 修复 Windows 特有失败（路径、`GIT_CONFIG_GLOBAL`、safeStorage、权限、端口）
- 目标：本机 production Electron 账密/访客路径可重复绿
- 若只需补证据：把 Windows EXIT 与日志摘要写入 residual，不必扩张 scope

### D. Agent / multi-engine（P1，克制）
- 复跑已有 focused：ADR-035 multi-engine / capability isolation（远程曾 45 tests 级）
- **仅当**能做出跨端或 durable 产品级证据时，才增强 §13.2 Agent 项
- 完整 durable Turn Engine / 统一助手产品化：优先推进或交叉引用 `2026-07-17-unified-assistant-agent-host.md`，不要在 vault plan 里伪造「已证明」

### E. 全量门禁项诚实收口（P1）
在 Windows 记录：
- 本机 Desktop/OAuth 结果
- 是否复跑 prod-like（Docker Desktop 可用则 `pnpm docker:local:up`；不可用则诚实写「本机无 prod-like，沿用远程 1333/1335 证据」）
- 综合是否仍只能「部分验证」

仅当同时满足时才考虑把第 3 项打勾并讨论 PR readiness：
- 交互式 OAuth 已闭环（或明确降级并改 DoD 文案——默认不降级）
- Web E2E 主路径 + Desktop Windows E2E 可重复
- governance + 关键 lint/typecheck/test 无回归
- plan/open-items/surface 一致
否则：**PR readiness 继续 no**。

### F. 文档与锁（每轮必做）
1. 更新主 plan：
   - §13.2 顶部 Residual 条
   - 对应未打勾项 handoff
   - 文末「残留一千三百三十八轮…」执行记录（命令、EXIT、根因、是否改 checkbox）
2. 更新 `section-13-2-dod-open-items.surface.spec.ts` 断言新 residual 字符串
3. 跑：
   pnpm nx run app-vue:test -- section-13-2-dod-open-items
4. Commit 风格对齐历史：
   - `fix(...)` / `docs(plan): residual 1338 — ...`
   - 正文写清绿的套件与仍 open 的项
5. `git push -u origin HEAD`
6. 可选：在本 handoff 文件末尾追加「Windows 执行记录」时间线

## 明确非目标
- 不重开已收口 dual-track 大清理
- 不把 Playwright report 目录提交进 git
- 不在无真实 OAuth 时把第 1 项打勾
- 不用更多 surface 单测代替 E2E 缺口
- 不把 vault plan 与 agent-host plan 的完成定义混成一次假关闭

## 完成定义（本 Windows 任务）
优雅完整实施 = 下列之一：
**A. 理想收口**：§13.2 三项均可诚实证明 → checkbox 更新 → PR readiness 可改为 yes（需 plan 明示）→ 准备 PR；或
**B. 诚实优雅 handoff**：Windows 已穷尽可做项，剩余仅外部/跨 plan 阻塞，checkbox 仍部分但证据与命令完整，PR readiness no，并写清「可开 PR 但 DoD 未满」还是「勿开 PR」。

默认追求：**先完成 B 的最高质量证据，能 A 则 A**。

## 开始时先做
1. 读 §13.2 三个 `[ ]` 项全文与 residual 1337 handoff
2. `git status` / tip 确认
3. 探测本机 OAuth 是否配置成功（list providers / 按钮可见）
4. 按 B→C→D→E→F 推进
5. 每有可提交增量就提交推送，避免大爆炸

开跑。
```

---

## Windows 执行记录

（本机 agent 追加；远程创建时为空。）

| 日期       | tip                         | 摘要                                                                                                                                                                                                                                                                          | §13.2     | PR readiness |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ |
| —          | —                           | 尚未在 Windows 开始                                                                                                                                                                                                                                                           | 12/15     | no           |
| 2026-07-25 | `a1b59fb35` (residual 1338) | Windows: `desktop:e2e` 1/1 EXIT:0；governance GOV_EXIT:0；open-items 3/3；ADR-035 multi-engine 4/33；真实交互式 OAuth **外部阻塞**（缺 `GITHUB_OAUTH_CLIENT_SECRET`；e2e-mock 不计入）；Docker Desktop 不可用→沿用远程 prod-like 1333/1335；**不改 checkbox**；诚实 handoff B | 12/15     | no           |
| 2026-07-25 | residual 1339               | 冲 A：入库 `web:e2e:oauth-real` host-dev 真 provider；ADR-035 6/51；docker:local:up npipe 失败；仍缺 CLIENT_SECRET；**不改 checkbox**                                                                                                                                         | 12/15     | no           |
| 2026-07-25 | residual 1340               | `web:e2e:oauth-real` **1/1** 真 GitHub 同意 `hasOAuth`；翻勾 §13.2 入口项；Agent/门禁仍 open                                                                                                                                                                                  | **13/15** | no           |
| 2026-07-25 | residual 1341               | prod-like 六服务 healthy + 探针 200；governance GOV_EXIT:0；desktop:e2e 1/1；翻勾门禁项；仅剩 Agent                                                                                                                                                                           | **14/15** | no           |
| 2026-07-25 | residual 1342               | Web multi-engine Host e2e **2/2**；翻勾 Agent；§13.2 **15/15**                                                                                                                                                                                                                | **15/15** | **yes**      |
