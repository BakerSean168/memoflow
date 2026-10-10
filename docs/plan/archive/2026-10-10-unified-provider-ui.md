---
tags: [plan, archive, ai, ui]
description: 整合已交付 BYOA 与 Figma Providers 设置、T3 聊天输入区
created: 2026-10-10T00:00:00Z
updated: 2026-10-10T00:00:00Z
---

# Providers 设置与聊天输入区域整合

基线：main 506e1cad12c，BYOA #439 与 DSH #441 已合入，v0.17.0 已发布。旧本地 main 上的 UI 修改尚未整合，本轮从最新 main 开始，保留原目录和未提交文档。

1. 合并既有 Figma 设置布局与 T3 输入框修改，保留已实现原生运行时行为。
2. 同一 Providers 列表显示 API 连接与 Codex、Claude、Pi、DSH 连接；顶部主色 + 与重新检查，无搜索与分组。选中后显示对应真实配置，保存沿用 owner 接口与 revision 校验。
3. 新建入口统一列出可添加 Provider；Web 不显示不可用的本地运行时能力。
4. 将已有运行时和原生模型选择放入聊天输入底栏，保留取消、审批、默认选择、附件及引用能力；不增加后端未支持的思考级别或 Full access 设置。
5. 验证混合列表选择、保存失败保留草稿、启停、删除、检查与模型目录竞态；运行相关 app-vue 测试、typecheck、lint、治理和 Provider E2E。

状态：本轮 UI 实施及 GCP/Linux 验证完成。后续 PR/CI、Windows 实机检查、合并与发布分别记录，不将本地验证视为生产上线。

## 实施结果与验证

- API 连接与 Codex、Claude Code、Pi、DSH 连接使用同一个 Providers 列表、添加入口与选择详情；主色加号、右侧重新检查，无 Provider 搜索或类别分组。
- 复用原生 owner 保存、revision 校验、登录/模型探测、删除及写入授权。保存失败保留草稿；异步保存不会夺回已经切换的选择；禁用 Provider 不进入内置模型目录。
- 已有原生运行时选择器移入输入框底栏，保留原生模型精确 ID、默认选择和刷新；附件、发送/取消、输入法、引用与逐次审批沿用已有行为。
- 本轮不是重新实现 BYOA；其源码已由 #439/#441 合入基线，v0.17.0 已发布。本轮 UI 变更尚待独立 PR 交付。

验证记录（2026-10-10，gcp-dev-01，最终工作树）：

- app-vue 五个相关 spec：72/72 通过，包含原生配置保存、空白名称校验、CAS 失败草稿、启停、移除、重新检查、DSH 新建、保存后的选择竞态及底栏原生模型选择。
- app-vue:typecheck 通过；app-vue/Desktop lint 通过；memoflow:governance-check 通过；test inventory 已更新；git diff --check HEAD 通过。
- web:e2e:ai-provider：1 passed / 1 skipped。HTTPS mock 真实注册、加密连接创建与替换、模型刷新、显式连接测试通过；深浅主题 1600/1280 与 375px 宽度检查通过。真实外部模型测试未启用。
- 混合列表与原生输入底栏通过独立 Vue 浏览器测试数据夹具截图检查；四种原生入口、新建、浅色主题稳定状态与 375px 无横向溢出均验证。夹具没有发起模型请求。
- desktop:package 通过，ASAR 校验 80 个运行时包。使用仓库现有 run-linux-packaged-smoke-with-keyring.sh 完成真实 Electron smoke：1/1 通过，30.5 秒；Codex/Claude/Pi/DSH 缺 CLI 的保存、探测、完整进程重启保留和移除均通过。
- 首次仅用 Xvfb 运行时，Linux 安全存储不可用导致 Profile 初始化退出；Playwright 的清理错误掩盖了原错误。最小启动复现及日志定位后，按现有隔离 Keyring 验收车道重跑成功，产品安全存储约束保持有效。

## PR CI 补充验证

PR #442 首轮完整 CI 发现四张聊天壳层基线仍使用旧输入框，以及一条共享设置组件测试仍要求 Providers 使用旧卡片布局。人工检查截图差异后，只更新四张聊天基线；调整旧布局断言，保留状态、弹窗与 owner 边界检查，Provider 行为由 AISettings.spec.ts 覆盖。视觉矩阵连续两轮比较通过（各 57/57），设置组件测试 10/10 通过，零像素差异阈值保持不变。

本轮未取得 Windows 新 UI 实机证据；既有 v0.17.0 BYOA 平台验收不冒充本轮 UI 的验收。
