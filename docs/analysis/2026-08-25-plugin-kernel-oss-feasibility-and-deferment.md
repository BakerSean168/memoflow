---
tags:
  - analysis
  - plugin
  - microkernel
  - cordis
  - deepseek-harness
  - open-source
  - architecture
  - deferred
description: MemoFlow 全面插件化、Cordis/DeepSeek Harness 等开源方案复用可行性与暂缓决策；明确未来重新启动的触发条件和 Compatibility Spike 边界
created: 2026-08-25T19:05:00+08:00
updated: 2026-08-25T19:05:00+08:00
---

# MemoFlow Plugin Kernel 开源复用可行性与暂缓决策

> 调研日期：2026-08-25  
> 当前状态：**Deferred / 暂缓，不进入 active implementation**  
> 关键取舍：保留“一切可组合、模块尽量可插拔”的长期方向，但现在不实现 Plugin Kernel、不引入 Cordis、不建设 Plugin SDK / Marketplace。等真实扩展压力出现后再做隔离 Compatibility Spike。

## 1. Executive Summary

此前讨论的长期目标很有吸引力：

```text
MemoFlow Kernel
  + Account Plugin
  + Goal Plugin
  + Task Plugin
  + Reminder Plugin
  + Wallet Plugin
  + AI Plugin
```

甚至把 Auth、Notification、Scheduler、Storage 等能力做成可跨项目复用的 package/provider。

当前代码也已经具备不少“插件化前置结构”：

```text
createXxxModule()
host composer
ServerModuleHandle / IElectronModule
RuntimeContribution { start, stop }
typed event ports
feature packages
transport registration
```

因此 MemoFlow 并不是一个必须先“大重构”才能模块化的 monolith。真正尚未拥有的是完整 Plugin Runtime：dependency resolver、service registry、effect ownership、loader、manifest、runtime enable/disable、UI contribution registry、migration ownership、sandbox/permission 等。

开源调研确认：**Cordis 是目前最值得未来验证的可复用 kernel，DeepSeek Harness 确实建立在 Cordis 上。** 这意味着未来不应该优先自己造 `PluginScope / Fiber / ServiceRegistry / EffectRegistry`。

但是同一轮调研也确认：

1. 上游 `cordis` 当前仍处于 4.0 RC 快速迭代阶段；
2. DeepSeek Harness 自身仍是 developer preview，并明确存在 breaking changes；
3. DSH 的“Everything is a Plugin”不只是 Cordis Core，还包含 profile/bundle/loader、browser client module loading、UI plugin graph 等大量产品级基础设施；
4. MemoFlow 是有 DB schema、PowerSync、Desktop/Web/Mobile、Auth、durable scheduler/notification 的状态型个人应用，插件安装/卸载比 Agent Harness 的 tool/model plugin 更难；
5. 当前尚没有足够业务压力证明这些复杂度值得今天支付。

因此正式决策是：

> **插件化长期方向保留，但暂时搁置。当前不建立 Plugin Active Plan，也不通过 EventBus 重构“顺手”引入 Cordis。**

---

## 2. 当前 MemoFlow 已经有多少“插件化基础”

### 2.1 Feature package 已经是清晰模块边界

当前 Goal / Task / Reminder / Notification / Schedule / Account / AI 等都已经是独立 workspace packages，并通过宿主组合。

它们不是“所有代码都塞在 app 目录”的 monolith。

### 2.2 Runtime lifecycle 已经存在

多个模块已经采用类似：

```ts
interface RuntimeContribution {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

并且一些 composite runtime 已经做到 partial-start failure 时逆序 rollback。

这本质上已经是 plugin lifecycle 的雏形。

### 2.3 Host composition 目前是显式、手写的

API / Desktop host 仍需要：

```text
import composeGoal
import composeTask
import composeReminder
...

compose...
register...
```

Web router/navigation/DI 也存在静态 module list。

所以当前更准确的描述是：

> **MemoFlow 已经是 modular architecture + hand-written composition，而不是完整 Plugin Runtime。**

这也是为什么“现在不做插件内核”不会阻塞现有业务继续演进。

---

## 3. DeepSeek Harness / Cordis 到底复用了什么

DeepSeek Harness 官方架构说明：

> Cordis 是 DSH 底层 framework；插件向共享 Context 贡献 services、typed events 和 reversible effects。模型 adapter、tool registry、session log、agent loop 都是插件，插件卸载时相应 effect 会撤销。

参考：

- <https://github.com/deepseek-ai/deepseek-harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>

Cordis 解决的确实是我们此前差点准备自己设计的一批问题：

```text
Context
Plugin Registry
Service / Dependency Injection
Lifecycle
Fiber / Effect ownership
Automatic cleanup
Typed events
Plugin unload / reload
Loader ecosystem
```

因此如果未来 MemoFlow 真进入 Plugin Kernel 阶段，第一原则应该是：

> **先验证 Cordis 能否当 kernel；不能证明不适合之前，不自己实现同类 runtime。**

---

## 4. 为什么“DSH 用 Cordis”不等于 MemoFlow 今天也该全面插件化

### 4.1 Cordis 解决 kernel，不自动解决 MemoFlow 的所有 plugin product problems

即使有：

```ts
ctx.plugin(walletPlugin);
```

MemoFlow 仍然必须回答：

```text
Wallet 的数据库表谁 migrate？
卸载 Wallet 是否删除数据？
PowerSync schema 如何变化？
Web Vue route 如何动态贡献？
Mobile React Native UI 如何贡献？
Desktop preload/IPC capability 如何授权？
Plugin 是否能读账户/文件/AI key？
第三方 plugin 怎么 sandbox？
版本不兼容怎么启动？
备份/导出是否包含 plugin data？
```

这些不是换一个 kernel 就自动消失的问题。

### 4.2 DSH Browser plugin loading 也是专门建设出来的

DSH 后续为 browser client 建立了自己的 client module/plugin loading model；也就是说“Server 端有 Cordis”并不自动获得“浏览器里可以动态安装 React/Vue plugin”。

参考：

<https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-23-client-plugin-loading-model.md>

MemoFlow 还同时存在 Vue Web/Desktop renderer 与 React Native Mobile，因此 UI contribution 会比单一 browser framework 更复杂。

### 4.3 上游仍快速变化

截至 2026-08-25，npm `cordis` 最新为 `4.0.0-rc.8`；DeepSeek Harness 自己也明确标记 developer preview / breaking changes expected。

参考：

- <https://www.npmjs.com/package/cordis>
- <https://github.com/deepseek-ai/deepseek-harness>

这不代表 Cordis 不好，而代表：

> 现在适合做未来 Compatibility Spike，不适合为了“架构看起来先进”立即让 MemoFlow 全仓绑定一个快速变化的 plugin runtime。

---

## 5. 其他开源项目能学什么

### 5.1 Backstage

值得学习：

```text
ServiceRef
ExtensionPoint
Plugin Module
small extension points
explicit initialization dependency
```

但它的 backend plugin runtime 强烈绑定 Backstage 产品与 deployment model，不适合为 MemoFlow 整体引入。

### 5.2 Medusa

值得学习：

```text
Module = 单领域/基础设施能力
Plugin = 一组可复用 customization package
Provider = 某个 capability 的可替换 implementation
```

它对 Event/Notification/File/Cache 等 infrastructure modules 的 provider 设计也非常适合作为 MemoFlow 未来 capability abstraction 参考。

但 Medusa runtime 是电商 framework 的一部分，不应为了 Plugin Kernel 把整个 framework 搬进 MemoFlow。

### 5.3 VS Code

值得学习的是 declarative contribution points：

```text
commands
views
menus
configuration
authentication
```

MemoFlow 未来如果进入 UI plugin phase，可以把 `routes / navigation / settings / commands / dashboard widgets` 做成类似 contribution registry。

但 VS Code Extension Host 不是一个能直接 npm install 到 MemoFlow 的通用 kernel。

---

## 6. 当前明确不实施的内容

本轮把以下事项全部设为 **out of scope / deferred**：

1. 不创建 `@memoflow/plugin-sdk`；
2. 不引入 `cordis` 或 `@deepseek-ai/cordis` dependency；
3. 不把现有 Goal/Task/Reminder 等包装成 plugin；
4. 不把 Web router/navigation 改成动态 plugin loader；
5. 不建设 runtime marketplace；
6. 不支持任意 npm package 动态安装；
7. 不建设第三方 plugin permission/sandbox/signature；
8. 不设计 plugin-owned DB migration framework；
9. 不为 pluginization 重写 EventBus；
10. 不让当前业务 ADR 等待 plugin kernel。

尤其是第 9 点已经通过本轮 EventBus 决策落实：EventBus 直接用 Emittery，和 Cordis 分开。

---

## 7. 哪些“扩展点”仍然可以正常实施

暂缓全面 Plugin Kernel **不等于暂停模块化**。

例如 ADR-061 的：

```text
SchedulingPort
Handler Registry
```

仍然值得实施，因为它解决的是已经存在的 closed-world switch / central routing 问题。

类似地，未来 Notification Channel Registry、AI Tool Registry、Data Exporter Registry 如果有真实需求，也可以作为局部 extension point 演进。

关键区别：

```text
局部 Registry / Port
= 解决当前明确耦合

全面 Plugin Runtime
= 解决任意模块发现、依赖、装载、卸载、权限、迁移、UI contribution
```

前者不需要等待后者。

---

## 8. 未来什么时候重新启动 Pluginization

不按“有空了”这种模糊条件，而按工程信号重新评估。出现以下多个信号时，才值得恢复：

```text
A. 出现 3+ 个真正 optional first-party modules
   Wallet / Finance / Health / Knowledge 等需要独立 enable/disable

B. Host manual composition 成为高频痛点
   每新增模块都要改 API + Desktop + Web 多个 central registry

C. 出现真实 runtime enable/disable 需求
   而不只是开发期 build-time composition

D. Lifecycle cleanup 开始重复出错
   timer/listener/service registration 很难安全卸载

E. 跨项目 capability reuse 成为稳定需求
   Auth / Notification / Storage 等需要被多个产品独立消费

F. 第三方生态成为产品目标
   需要外部开发者安装 plugin，而不是仅第一方 package
```

如果只是：

> “Wallet 模块想独立一点。”

现有 package + module + composer + extension registry 通常已经足够，不需要完整 kernel。

---

## 9. 未来 Cordis Compatibility Spike 的严格边界

重新启动时，第一步不是“建立 Plugin Architecture Active Plan”，而是一个可以随时丢弃的 spike。

### Experiment A — 包一个低风险现有模块

例如 Setting：

```text
Cordis plugin wrapper
       ↓
existing composeSetting()
       ↓
existing runtime start/stop
```

要求 Domain / Repository / API contract 零修改。

### Experiment B — 一个 service dependency

例如 mock scheduler capability：

```text
service absent  → plugin pending
service present → plugin active
service dispose → dependent plugin cleanup
```

验证 Cordis 是否真的比现有 hand-written wiring 更简单。

### Experiment C — 无数据库 Wallet demo

只做：

```text
Wallet plugin
├─ provides wallet service
├─ consumes notification capability
└─ registers one disposable handler
```

验证 enable/disable 后 listeners/handlers/services 是否完全清理。

### Stop conditions

只要发现必须为了让 Cordis 工作而先：

```text
改 Domain
改 DB schema
重写 EventBus
重写 Router
重写所有 DI
```

就停止 spike，继续当前 modular architecture。

---

## 10. 如果未来 Spike 通过，优先采用什么范围

第一阶段最多采用：

```text
Build-time / Boot-time first-party plugins
```

即：package 在 build/install 时已经存在，启动时由 manifest/profile 组合。

不要第一步就做：

```text
运行中的 MemoFlow
→ 用户点击 Marketplace
→ 下载任意 plugin
→ API/Desktop/Web/Mobile 全部热加载
```

后者会立刻引入 sandbox、signature、compatibility、dynamic UI loading、migration rollback 等独立项目级复杂度。

---

## 11. Auth 等跨项目复用怎么办

Auth 可复用仍是合理方向，但不需要等待 Plugin Kernel。

更稳妥的拆分是 package-level reuse：

```text
identity/auth contracts
       ↓
generic auth core
       ↓
Better Auth adapter
       ↓
HTTP / client adapters

MemoFlow Account profile semantics
       ↓
MemoFlow-specific package
```

也就是说：

> “可复用 package” 与 “runtime plugin” 是两件不同的事。

先把标准能力做成低耦合 package，往往已经能解决 BodySense / Digital Biome 等其他项目的复用问题；没有必要为了复用 Auth 先建设整个 Marketplace Kernel。

---

## 12. 与本轮 EventBus 的关系

两项讨论正式拆开：

```text
EventBus
→ 当前 observed problem 清晰
→ 有成熟 Emittery 可直接替换
→ 小范围、可测、现在实施

Plugin Kernel
→ 长期收益可能很大
→ 但 product/runtime/migration/UI 问题很多
→ Cordis 候选值得保留
→ 当前不实施
```

这意味着不会出现：

```text
为了未来也许会用 Cordis
→ 今天把 EventBus 改成 Cordis Events
→ 反过来迫使整个项目进入 plugin runtime migration
```

当前 EventBus 使用 Emittery，未来 Cordis 若被采用，也可以通过 adapter 重评；不存在必须一次决定到底的技术锁定。

---

## 13. 决策状态

### 现在执行

```text
Runtime EventBus → Emittery
继续业务模块边界重构
继续局部 Port / Registry extension points
继续 OSS-first 复用标准能力
```

### 现在暂缓

```text
Cordis adoption
MemoFlow Plugin SDK
Everything-is-a-Plugin migration
runtime plugin loader
client plugin loader
plugin marketplace
third-party sandbox / permission
plugin-owned schema migration platform
```

### 文档治理

本调研文档是 **Deferred research record**，不是 Active Plan，也不创建“全面插件化 ADR”。

理由是 ADR 应记录已经准备约束实现的架构决策；当前唯一正式决策只是“**暂缓，不绑定 kernel**”。待未来 Compatibility Spike 给出真实证据后，再决定是否创建正式 Plugin Architecture ADR。

## 14. 最终判断

全面插件化不是一个应该为了“架构优雅”立即支付的大重构。

MemoFlow 当前已经有足够好的 module/package/composition boundaries，可以继续快速做业务；Cordis 的存在又意味着未来真需要 Plugin Kernel 时，很可能不需要从零造轮子。

因此最优策略是：

> **现在把插件化放入经过调研的 deferred backlog；未来由真实扩展压力触发 Cordis Compatibility Spike。Spike 通过再立 ADR/Active Plan，失败则保持当前 modular architecture。**
