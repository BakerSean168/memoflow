# AgentDriverIcon 品牌字形来源证明（#457）

`AgentDriverIcon.vue` 渲染的每个品牌字形都必须来自**已核实允许再分发**的官方或开源资产；路径数据逐字节复制自下列来源，不做手绘或臆造修改。本文件是新增或修改 `agentBrandGlyphs.ts` 中任何字形时的强制伴随证据；无来源与许可证明的字形不得合入。

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

## 视觉尺寸统一

各品牌源字形的自然边界框不同（例如 DeepSeek 为 24×17.66 的宽形，其余接近满幅）。为保证同一 CSS 尺寸下实际视觉尺寸一致，`brandGlyphTransform()` 把每个字形的实测边界框映射到 viewBox 边长的 20/24、居中放置——与相邻 Lucide 图标的视觉重量（24 单位网格、约 2 单位留白）对齐。因此组件在父级常用渲染尺寸（16px `size-4` / 20px `size-5`，以及 Composer 的 14px `size-3.5`）下，各品牌呈现统一的实际视觉尺寸；disabled/active、accent 颜色与尺寸仍完全由父组件的 class/style 控制。

### 边界框测量证据（2026-10-15，Chromium `SVGGraphicsElement.getBBox()`）

在无变换的原始 path 上测量（viewBox 单位）：

| 字形 | viewBox | 实测 bbox (x, y, w, h) |
| --- | --- | --- |
| codex | 0 0 24 24 | 0, −0.001, 24, 24.001 |
| claude | 0 0 24 24 | 0, 0, 24, 24 |

测量方式：把逐字节复制的 path 放入本地临时 HTML（无 transform、无 CSS 缩放），在 T3 Code 协作浏览器中执行 `getBBox()` 读取。测得值作为 `agentBrandGlyphs.ts` 中 `bbox` 常量的来源；`AgentDriverIcon.spec.ts` 回归验证 transform 与 bbox 的数学关系。

## 商标边界

以上字形分别是 OpenAI、Anthropic 及其他品牌所有者的商标。MemoFlow 仅在与对应 Agent 集成的 UI 中以指示为目的（nominative use）原样呈现这些标志；MIT 许可覆盖资产版权的复制与再分发，不授予商标权本身，也不表示品牌方对 MemoFlow 的背书。

## 尚未落地（后续批次）

以下 driver 暂保留原 Lucide 占位（`mastra`→Bot、`pi`→Pi、`dsh`→Zap，未知 driver→Bot）。它们的合规来源已在 2026-10-15 核实完毕，待后续批次落地：

- **pi**（Pi coding agent，earendil-works/pi）：官方 Press Kit（<https://pi.dev/press-kit>）明确标注 "Press Kit — MIT License"（Earendil Inc. & Contributors）。计划采用其单色方形徽标 `https://pi.dev/favicon.svg`（560×560，三段 path，显式 light/dark）；组件内将沿用 `currentColor` 以与整套字形一致。其 MIT 仓库（earendil-works/pi）与 npm 包 `@earendil-works/pi-coding-agent@1.2.0`（MIT）内均无 logo 资产，Press Kit 是唯一可核实的许可来源。
- **dsh**（DeepSeek Harness，deepseek-ai/deepseek-harness）：`@lobehub/icons@5.23.1 es/DeepSeek/components/Mono.mjs`（MIT，LobeHub），DeepSeek whale 单色 path，实测 bbox 0, 3, 24, 17.66。
- **mastra**（Mastra）：`@lobehub/icons@5.23.1 es/Mastra/components/Mono.mjs`（MIT，LobeHub），两段 path（中心星形 + 圆环），实测 bbox 0.084, 0.083, 23.811, 23.813。

核实过但**不采用**的来源，避免误用：

- simple-icons（CC0）的 `pi.svg` 是通用希腊字母 π，不是 Pi coding agent 的官方标志；lobehub 的 `Pi` 组件是 Inflection 消费级聊天产品，与本仓 `pi` driver（Pi coding agent）不是同一产品，一律不得用于本组件。
- T3 Code 私有图标不复制、不参考。
