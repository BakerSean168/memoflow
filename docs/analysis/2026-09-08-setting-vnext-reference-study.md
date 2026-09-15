---
tags:
  - analysis
  - setting
  - preferences
  - vscode
  - openfeature
  - unleash
  - oss-reference
description: Setting vNext 外部参考研究：VS Code 配置 scope/sync 与 OpenFeature/Unleash feature evaluation 边界
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
---

# Setting vNext — Reference Study

## 1. 研究目标

这轮外部参考不用于“照抄某个 Settings UI”，而是回答两个架构问题：

1. 成熟产品如何区分 user/machine/window/resource 等不同 setting scope？
2. Feature Flag / Experiment 为什么不应该建模成 `experimental.features: string[]` 用户设置？

参考：

- VS Code Settings: <https://code.visualstudio.com/docs/configure/settings>
- VS Code Contribution Points / configuration scope: <https://code.visualstudio.com/api/references/contribution-points>
- OpenFeature Flag Evaluation: <https://openfeature.dev/specification/sections/flag-evaluation/>
- OpenFeature Provider: <https://openfeature.dev/specification/sections/providers/>
- OpenFeature Evaluation Context: <https://openfeature.dev/specification/sections/evaluation-context/>
- Unleash Feature Flags: <https://docs.getunleash.io/concepts/feature-flags>
- Unleash Activation Strategies: <https://docs.getunleash.io/concepts/activation-strategies>

## 2. VS Code：Settings UI 不等于单一 persistence scope

VS Code 的一个重要启发不是 `settings.json` 文件本身，而是它明确承认：

```text
同样叫 Setting
≠ 同样的 scope
≠ 同样的同步规则
```

其 configuration contribution 支持不同 scope，例如：

```text
application
machine
machine-overridable
window
resource
language-overridable
```

并且 `machine` / `machine-overridable` 不参与 Settings Sync；还可以用 `ignoreSync` 明确禁止某项同步。

### 对 MemoFlow 的启发

我们不需要复制 VS Code 的全部 scope taxonomy，但应该采用核心原则：

> **scope 是 setting contract 的一部分，不应由“它出现在 Settings 页面”隐式决定。**

MemoFlow 对应：

```text
User Preference        ~ application/user scoped
Device Preference      ~ machine scoped
Window/UI state         ~ window scoped
Module-owned settings   ~ domain/resource capability scoped
```

## 3. VS Code：Sync 是单独的 policy

VS Code Settings Sync 可以跨机器同步 user settings、keyboard shortcuts 等内容，但同时保留 machine-specific settings 不同步的规则。

因此成熟设计不是：

```text
只要是 setting -> 一律 cloud sync
```

而是：

```text
setting semantic
+ scope
+ sync eligibility
```

共同决定 persistence/sync。

### MemoFlow adapt

MemoFlow 不需要照搬 VS Code 的 shortcuts sync 策略。

MemoFlow 当前跨：

```text
Windows Desktop
Web
Mobile
```

而 shortcut 语义还没有 canonical CommandRegistry。因此当前更安全的阶段性策略是：

```text
shortcut override = device scoped
```

以后若 CommandRegistry 稳定，再单独设计跨 Desktop 设备 keymap sync。

## 4. OpenFeature：Flag Evaluation 是独立 API

OpenFeature 把 feature flag 处理为：

```text
flag evaluation API
provider
context
```

应用调用 typed evaluation，并提供 default value；provider 决定如何从底层 flag system 获得结果。

关键思想：

> Feature availability 是一个 evaluation problem，不是“读取用户 settings string[] 看有没有这个 key”。

## 5. Evaluation Context

OpenFeature 的 evaluation context 用于承载 targeting 所需上下文，例如：

```text
user/application/host/locale/time
```

这进一步说明 feature state 可能取决于：

```text
user
subscription
host
rollout cohort
region
build/environment
```

而不是只有：

```text
user says enabled=true
```

## 6. Unleash：Activation Strategy 与 rollout

Unleash 把 feature flag 与 environment、activation strategy、targeting、gradual rollout、variants 等概念分开。

这类成熟模型表达：

```text
谁获得 feature
```

可能来自：

```text
100% rollout
percentage rollout
user/segment targeting
environment
variant allocation
```

因此 MemoFlow 当前：

```text
experimental.enabled
experimental.features[]
```

无法表达真实 feature rollout，也容易被 import/settings UI 绕过系统 policy。

## 7. Adopt / Adapt / Reject

| Reference idea                   | MemoFlow decision  | Reason                                                |
| -------------------------------- | ------------------ | ----------------------------------------------------- |
| Setting 有明确 scope             | **Adopt**          | 直接解决 user/device/window/module 混合               |
| Machine-specific 不默认 sync     | **Adopt**          | Desktop path、notification surface、window state 需要 |
| Settings UI 聚合多个 scope       | **Adopt**          | 当前 MemoFlow UI 已经如此                             |
| 所有 settings 存一份 JSON        | **Reject**         | ownership/concurrency 已经出现问题                    |
| Keyboard shortcut 立即跨平台同步 | **Adapt**          | 等 CommandRegistry 稳定后再决定                       |
| Feature 使用 evaluation API      | **Adopt semantic** | 禁止 string[] 作为 feature truth                      |
| Provider abstraction             | **Reference only** | 当前不要求引入 OpenFeature SDK                        |
| Environment/targeting/rollout    | **Adopt semantic** | future Labs/rollout 正确方向                          |
| 自建完整 feature management SaaS | **Reject now**     | 当前没有足够产品需求                                  |
| 任意 user toggle 可开启 feature  | **Reject**         | 会绕过 entitlement/rollout                            |

## 8. 对 Setting vNext 的直接落地

最终不是：

```text
Settings = one database aggregate
```

而是：

```text
Settings Hub
├── cross-device User Preference
├── module-owned capability
├── device/local preference
└── product/system policy
```

### 8.1 Cross-device User Preference

只保留当前明确有价值的：

```text
theme
language
time zone
date/time presentation
week starts on
```

### 8.2 Module-owned

```text
Notification delivery preference
AI provider/model
Knowledge source binding
Account profile/security
```

### 8.3 Device/local

```text
notification presentation
keyboard accelerator
window/sidebar state
local files path
```

### 8.4 Product/system

```text
feature flag
experiment assignment
entitlement
telemetry hard policy
```

## 9. 为什么不直接复用 VS Code/OpenFeature/Unleash

### VS Code

VS Code 是 editor/platform，scope taxonomy 比 MemoFlow 当前需要的更丰富。直接复制 `window/resource/language-overridable` 会过度设计。

我们借的是：

```text
scope + sync eligibility are first-class
```

### OpenFeature

未来真正出现多环境 rollout/provider 时，它是优先评估的标准化 abstraction。

当前没有必要为了删除一个 fake `experimental[]` 就先引入运行时依赖。

### Unleash

它是成熟 feature management 产品，可用于理解 rollout/strategy/variant，而不是当前必须部署的新基础设施。

## 10. Reference-driven architecture locks

本次研究最终转化为这些锁：

1. 每个 settings capability 必须能回答 owner/scope/sync policy；
2. device-specific 值不默认进入 cloud User Preferences；
3. Settings Hub 可以组合不同 owner；
4. arbitrary string[] 不能作为 feature assignment；
5. feature evaluation 与 user preference mutation 分离；
6. user opt-in 只对明确允许 opt-in 的已注册 feature 生效；
7. 不为了模仿成熟项目引入暂时不需要的 scope/vendor/system。
