import type { Meta, StoryObj } from '@storybook/vue3-vite';
import KnowledgeMarkdownPreview from './KnowledgeMarkdownPreview.vue';

const noteMarkdown = `---
title: 事件驱动架构评审
tags:
  - architecture
  - review
---

# 事件驱动架构评审

本次评审聚焦 **事件契约** 与投递语义，结论如下。

## 决策

- 事件载荷保持版本化，消费者按 \`schemaVersion\` 兼容读取。
- 重试策略统一走可靠消息层，业务侧不再自行实现退避。
- 内部链接使用 [[领域事件目录]] 维护索引。

> [!note] 待办
> 补充死信队列的告警阈值，并在下一次评审确认。

## 观测指标

| 指标 | 目标 | 现状 |
| --- | --- | --- |
| 投递成功率 | ≥ 99.95% | 99.97% |
| 平均延迟 | < 120ms | 96ms |

\`\`\`ts
export type DeliveryOutcome = 'delivered' | 'retried' | 'dead-lettered';
\`\`\`

详见 [可靠消息设计](https://example.com/reliable-messaging)。
`;

const meta = {
  title: 'Business/Repository/KnowledgeMarkdownPreview',
  component: KnowledgeMarkdownPreview,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div style="max-width: 760px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; background: hsl(var(--background));"><story /></div>',
    }),
  ],
  argTypes: {
    markdown: { description: '原始 Markdown（含 frontmatter）' },
    title: { description: '笔记标题；与首个 H1 一致时自动去重' },
  },
} satisfies Meta<typeof KnowledgeMarkdownPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { markdown: noteMarkdown, title: '事件驱动架构评审' },
};

const longMarkdown = `${noteMarkdown}

## 背景

过去两个季度，跨模块事件的数量增长了三倍。原有的点对点回调在高峰期出现重复消费与顺序错乱，
排障需要同时对照多个服务的日志。

### 现状问题

1. 契约没有版本字段，消费者只能靠字段探测猜测结构。
2. 重试逻辑分散在三个业务模块，退避参数互不一致。
3. 死信没有统一入口，失败消息只能靠人工排查。

## 方案

统一由可靠消息层负责投递、重试与死信归档；业务模块只声明事件契约和处理器。

- **契约**：每个事件携带 \`schemaVersion\`，新增字段必须向后兼容。
- **重试**：指数退避，最大 5 次，超过后进入死信队列。
- **观测**：投递成功率、P95 延迟、死信数量三项指标进入统一看板。

### 迁移步骤

1. 在不改变行为的前提下接入可靠消息层。
2. 逐个模块切换写入路径，保留旧回调一个发布周期。
3. 删除旧回调，收敛配置与告警阈值。

## 风险

- 事件体量增长可能推高存储成本，需要评估归档周期。
- 消费者升级节奏不一致，必须保证旧版本可读。

## 结论

方案通过评审。下一步补充死信告警阈值，并在下一次评审确认压测结果。
`;

export const LongNote: Story = {
  args: { markdown: longMarkdown, title: '事件驱动架构评审' },
  parameters: {
    docs: {
      description: { story: '长文档验证滚动、标题层级与代码块排版。' },
    },
  },
};

export const WithoutHeading: Story = {
  args: {
    markdown: '一段没有标题的速记：先验证缓存命中率，再决定是否拆分读取路径。',
    title: '速记',
  },
};

export const Empty: Story = {
  args: { markdown: '' },
};
