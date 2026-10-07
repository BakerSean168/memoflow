---
tags: [plan, active, mcp, verification]
description: EAG-05 首个 OAuth 只读版本的真实客户端与 prod-like 交付验证
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-05：只读版本验收

状态：明确延期。用户于 2026-10-07 将本次先交付范围改为 PAT + 6 个只读工具；真实 OAuth 只读验收不作为本次交付前置。原验收要求保留供后续实施。依赖：EAG-03、EAG-04。入口：[总方案](../2026-10-07-external-agent-gateway.md)。

## 交付行为

一个可以具体演示、复现和撤销的 OAuth + 6 read tools 版本；正式写工具仍关闭。

## 实施步骤

1. 构建当前 SHA 的本地 prod-like 镜像，记录 OCI revision/digest、有效配置与 HTTPS dev origin；执行仓库 validate-local-deploy 流程。
2. 用 Codex 和 Claude Code 分别完成添加 URL、OAuth、发现工具、查询本周 occurrence、读取 Goal、翻页与重连；记录客户端精确版本和实际 protocol profile。
3. 同一连接撤销后重试、账户切换、错 audience、只给一类 read scope 等 negative journeys。验证无 Origin CLI 正常认证、有非法 Origin 则拒绝。
4. 多实例下重复 read、限流、auth store 故障、服务关闭和重启；观察 timeout、retryAfter、可检索 audit，避免每个进程各一份无限预算。
5. 写面向用户的连接指南，只使用环境变量示例，不写真实 token；提供撤销路径、支持版本、当前工具范围与未支持能力。
6. 输出 `docs/analysis/YYYY-MM-DD-eag-read-release-evidence.md`：EAC-01～05、11、14 的逐项结果与未验证项。若需要后续公开发布，按既有 release workflow 单列 rollout evidence。

## 保护契约

客户端授权是用户真实动作；不能绕过登录、精确 callback 或 audience 检查以便测试。SSH devbox 回调失败必须查真实网络路径，不能把 redirect 改成 wildcard。服务支持某协议不代表所有客户端扩展可用。

## 验收与验证

- 两个真实客户端各有完整 OAuth read、撤销与重连记录；仅 curl 成功不算完成。
- R1 tools 输入输出、权限隔离、分页和 owner 事实一致；MCP 不调用 Assistant/provider LLM。
- write flag 关闭时即使手工构造 tool 名也不能执行。
- 本地容器验证、治理、docs 和相关受影响 targets 通过；报告明确测试 SHA、制品和环境。

## 回退与移交

关闭 read/public lane 并保留连接撤销入口，用户原业务不受影响。只读验收通过后，EAG-06 开始单独写能力变更，不复用早期 read SHA 的证据宣称 write 已验收。
