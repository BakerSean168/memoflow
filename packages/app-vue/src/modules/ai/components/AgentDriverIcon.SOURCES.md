# AgentDriverIcon 品牌字形来源证明（#457）

`AgentDriverIcon.vue` 渲染的每个品牌字形都必须来自**已核实允许再分发**的官方或开源资产；路径数据逐字节复制自下列来源，不做手绘或臆造修改。本文件是新增或修改 `agent-brand-glyphs.ts` 中任何字形时的强制伴随证据；无来源与许可证明的字形不得合入。

五个 `AgentDriverKind`（codex、claude、pi、dsh、mastra）全部使用已核实品牌字形；合同枚举之外的任意 driver 字符串回退到通用 Lucide `Bot` 占位。

## 已落地字形

### codex — OpenAI Codex mark

- 来源：`@lobehub/icons@5.23.1`，文件 `es/Codex/components/Mono.mjs`
  （<https://cdn.jsdelivr.net/npm/@lobehub/icons@5.23.1/es/Codex/components/Mono.mjs>）
- 上游许可：MIT，Copyright (c) 2023 LobeHub（包内 `LICENSE`；MIT 允许复制、修改与再分发，需保留版权与许可声明，本节即该声明的保留）
- 提取内容：Mono 组件 `<svg viewBox="0 0 24 24" fill="currentColor">` 内单一 `<path d="…">` 的完整 `d` 值，逐字节未修改；颜色沿用 `currentColor`，不再依赖上游 React 组件。
- 检索日期：2026-10-15

### claude — Anthropic Claude sunburst

- 来源：`@lobehub/icons@5.23.1`，文件 `es/Claude/components/Mono.mjs`
  （<https://cdn.jsdelivr.net/npm/@lobehub/icons@5.23.1/es/Claude/components/Mono.mjs>）
- 上游许可：MIT，Copyright (c) 2023 LobeHub（同上，声明在此保留）
- 提取内容：同 codex——Mono 组件单一路径 `d` 值，逐字节未修改。
- 检索日期：2026-10-15

### pi — Pi coding agent 官方方形徽标

- 来源：Pi 官方 Press Kit（<https://pi.dev/press-kit>），资产 `https://pi.dev/favicon.svg`
  （Press Kit 页面 "Open Brand files" 下的 "Badge SVG — Square mark for favicons and compact badges"）
- 上游许可：**MIT**，页面页脚明确标注 "Earendil Inc. & Contributors — Press Kit — MIT License"
- 提取内容：badge mark 的三段 `<path d="…">` 几何逐字节未修改（viewBox `0 0 560 560`）。原文件内嵌 `prefers-color-scheme` 的 `#111111`/`#f6f6f6` 显式明暗填充；组件内改为继承 `currentColor`，与整套字形一致并由父组件主题/强调色控制，几何不变。
- 检索日期：2026-10-15
- 备注：Pi 的 MIT 仓库（earendil-works/pi）与 npm 包 `@earendil-works/pi-coding-agent@1.2.0`（MIT）内均无 logo 资产，官方 Press Kit 是唯一可核实的许可来源。三色主 logo（`/logo-auto.svg`）同为该 Press Kit 提供，本轮未采用。

### dsh — DeepSeek whale（DeepSeek Harness）

- 来源：`@lobehub/icons@5.23.1`，文件 `es/DeepSeek/components/Mono.mjs`
  （<https://cdn.jsdelivr.net/npm/@lobehub/icons@5.23.1/es/DeepSeek/components/Mono.mjs>）
- 上游许可：MIT，Copyright (c) 2023 LobeHub（同上，声明在此保留）
- 提取内容：Mono 组件单一路径 `d` 值，逐字节未修改。DSH driver 对应 deepseek-ai/deepseek-harness（DeepSeek 官方 ACP harness，见 `docs/analysis/2026-10-10-local-dsh-acp-integration.md`），故使用 DeepSeek 品牌标志。
- 检索日期：2026-10-15

### mastra — Mastra mark

- 来源：`@lobehub/icons@5.23.1`，文件 `es/Mastra/components/Mono.mjs`
  （<https://cdn.jsdelivr.net/npm/@lobehub/icons@5.23.1/es/Mastra/components/Mono.mjs>）
- 上游许可：MIT，Copyright (c) 2023 LobeHub（同上，声明在此保留）
- 提取内容：Mono 组件两段路径 `d` 值（中心星形 + 圆环组合），逐字节未修改。
- 检索日期：2026-10-15
- 备注：mastra-ai/mastra 仓库为混合许可（`ee/` 目录除外），未直接采用其仓库资产；本字形经 MIT 许可的 LobeHub 分发渠道取得。

## 视觉尺寸统一

各品牌源字形的自然边界框不同（DeepSeek 为 24×17.66 的宽形，其余接近满幅）。为保证同一 CSS 尺寸下实际视觉尺寸一致，`brandGlyphTransform()` 把每个字形的实测边界框映射到 viewBox 边长的 20/24、居中放置——与相邻 Lucide 图标的视觉重量（24 单位网格、约 2 单位留白）对齐。因此组件在父级常用渲染尺寸（16px `size-4` / 20px `size-5`，以及 Composer 的 14px `size-3.5`）下，各品牌呈现统一的实际视觉尺寸；disabled/active、accent 颜色与尺寸仍完全由父组件的 class/style 控制。

### 边界框测量证据（2026-10-15，Chromium `SVGGraphicsElement.getBBox()`）

在无变换的原始 path 上测量（viewBox 单位）：

| 字形   | viewBox     | 实测 bbox (x, y, w, h)       |
| ------ | ----------- | ---------------------------- |
| codex  | 0 0 24 24   | 0, −0.001, 24, 24.001        |
| claude | 0 0 24 24   | 0, 0, 24, 24                 |
| pi     | 0 0 560 560 | 0, 0, 560, 560               |
| dsh    | 0 0 24 24   | 0, 3, 24, 17.66              |
| mastra | 0 0 24 24   | 0.084, 0.083, 23.811, 23.813 |

测量方式：把逐字节复制的 path 放入本地临时 HTML（无 transform、无 CSS 缩放），在 T3 Code 协作浏览器中执行 `getBBox()` 读取。测得值作为 `agent-brand-glyphs.ts` 中 `bbox` 常量的来源；`AgentDriverIcon.spec.ts` 回归验证 transform 与 bbox 的数学关系。

### 渲染级尺寸实测（同日，`getBoundingClientRect()`，含归一化 transform）

归一化后在浏览器中实际渲染并测量（长边/盒尺寸，居中偏移）：

| 字形   | 16px 盒                         | 20px 盒                    |
| ------ | ------------------------------- | -------------------------- |
| codex  | 13.33×13.33 px，偏移 (0,0)      | 16.67×16.67 px，偏移 (0,0) |
| claude | 13.33×13.33 px，偏移 (0,0)      | 16.67×16.67 px，偏移 (0,0) |
| pi     | 13.33×13.33 px，偏移 (0,0)      | 16.67×16.67 px，偏移 (0,0) |
| dsh    | 13.33×9.81 px（宽形，长边对齐） | 16.67×12.26 px             |
| mastra | 13.33×13.33 px，偏移 (0,0)      | 16.67×16.67 px，偏移 (0,0) |

五枚字形长边比例全部为 0.8333（= 20/24），与 Lucide 参照（`circle` r10 即 20/24）一致；同一 CSS 尺寸下实际视觉尺寸完全统一。

## 商标边界

以上字形分别是 OpenAI、Anthropic、Earendil（Pi）、DeepSeek 与 Mastra 的商标。MemoFlow 仅在与对应 Agent 集成的 UI 中以指示为目的（nominative use）原样呈现这些标志；MIT 许可覆盖资产版权的复制与再分发，不授予商标权本身，也不表示品牌方对 MemoFlow 的背书。

## 核实过但不采用的来源

- simple-icons（CC0）的 `pi.svg` 是通用希腊字母 π，不是 Pi coding agent 的官方标志。
- `@lobehub/icons` 的 `Pi` 组件是 Inflection 消费级聊天产品，与本仓 `pi` driver（Pi coding agent，earendil-works/pi）不是同一产品，不得用于本组件。
- simple-icons（CC0）当前版本（16.35.0）无 openai、mastra slug；OpenAI/Codex 与 Mastra 均经 LobeHub MIT 渠道取得。
- T3 Code 私有图标不复制、不参考。

## Antigravity (AGY) - 2026-10-17

- Source: `@lobehub/icons@5.23.1`, `es/Antigravity/components/Mono.mjs`.
- License retrieved from the same pinned package `LICENSE`: MIT, Copyright (c) 2023 LobeHub. The complete MIT notice above also applies to this glyph. Google owns the Antigravity trademark; this UI identifies the integrated Agent and does not imply endorsement.
- Single SVG path copied verbatim; viewBox `0 0 24 24`. No proprietary Agent executable is redistributed.
- Chromium `SVGGraphicsElement.getBBox()` on the untransformed source path: `x=0.00014519691467285156, y=1, w=23.999862670898438, h=22.108667373657227`. The existing 20/24 normalization and shared currentColor treatment are unchanged.
