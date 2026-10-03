# AI Chat information architecture V2

## Product role

The AI surface is a conversation-first workspace, not another dashboard and not the owner of Goal/Task/Knowledge state.

The shell is intentionally split into three responsibilities:

1. **Conversation history** — left shell sidebar. It answers “where was I?” and owns only chat navigation.
2. **Conversation canvas** — center AI column. It answers “what are we discussing?” and renders user turns, safe Markdown assistant output, attachments, status, and lightweight message actions.
3. **Workbench** — right shell surface. It answers “what structured thing is being created or reviewed?” and hosts Goal, Task, Knowledge, and workflow artifacts.

The global composer remains the single command/input surface. Referenced goals, tasks, notes, files, and model selection stay attached to the composer because they affect the next turn, not the whole conversation history.

## Information hierarchy

### Conversation canvas

- Assistant prose is primary and is rendered as safe Markdown: headings, lists, code, tables, links, and quotes are readable instead of flattened into plain text.
- User turns remain compact soft bubbles so prompts are distinguishable without competing visually with answers.
- Message actions are secondary and appear on hover/focus. Copy is the first action; retry/edit should be added only when the runtime exposes an authoritative operation.
- Error/aborted state remains directly attached to the affected message.

### Welcome state

The empty state is not a card dashboard. It presents one conversational entry point plus compact workflow affordances (Goal, Task, Knowledge Capture, Knowledge Q&A) with one-line descriptions.

### Workbench

“Context” was overloaded: composer references are context, while the right panel contains structured workflow artifacts. The right surface is therefore named **Workbench**. Context remains reserved for references attached to a turn.

## Runtime boundaries

This refactor does not change Mastra workflow ownership, conversation persistence, model routing, Shell KeepAlive behavior, or GlobalComposer hosting. UI structure can evolve without creating a second workflow state machine.

## Security

Assistant Markdown reuses the existing `renderSafeMarkdown` boundary. Raw HTML is disabled and unsafe link protocols are rejected. The chat renderer does not introduce an independent Markdown implementation.
