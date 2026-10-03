# 说明：本文档保留为工程实现参考，不是当前 canonical plan。历史统一方案见 `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`；当前真值以代码、配置和仍留在 `docs/plan/active` 的计划为准。

> **PVC-AI-8121 retirement:** 本文代码片段是迁移前的历史审查记录。AI-owned Goal/Task editors、visibility flags 与 toggle 已退役；当前使用 GoalDialog、完整 TaskPlanDialog 与 Repository native review。支持性 Task/Knowledge overlays、澄清与恢复保留。以 [当前 AI 模块](../../product/modules/ai.md) 为准。

# P0-1 代码审查 - Vue 前端层

详细的前端代码审查、架构分析和改动建议。

---

## 历史前端架构

### AIChatView.vue 核心状态管理

```
四大状态组：

1. 聊天核心状态
   - chatMessage: 输入框文本
   - chatLoading: 聊天中状态
   - chatConversationId: 当前会话 ID
   - chatTimeline: 消息流
   - conversationList: 会话列表

2. 工作流模式状态
   - toolMode: 'chat' | 'goal' | 'knowledge-note'
   - 对应不同的 workflow 入口

3. Goal 工作流专属状态
   - goalDraftLoading: 生成中
   - goalDraft: 已生成的 draft
   - creatingGoal: 创建中
   - showGoalDraftEditor: 编辑器是否展示
   - editableGoal: 可编辑的表单
   - editableKeyResults: 可编辑的关键结果

4. Knowledge Note 工作流专属状态
   - noteCreating
   - noteSummary
```

### Goal 工作流的当前流程

```
用户切换到 Goal 模式
  ↓
显示 "生成 Goal Draft" 按钮
  ↓
用户点击按钮 → generateGoalDraftFromConversation()
  ↓
service.generateGoal({
    idea: buildConversationTranscript(),
    includeKeyResults: true,
    providerId, model
  })
  ↓
API 返回 GoalDraft
  ↓
applyGoalDraft(draft)
  ↓
显示 Goal Draft 卡片（名字 + 描述 + KR 标签）
  ↓
用户可以：
  - 编辑
  - 直接创建
  - 重新生成
```

### 状态持久化机制

**存储位置**：localStorage  
**存储键**：`ai:conversation-workflow-map`

**结构**：

```typescript
{
  [conversationId]: PersistedWorkflowEntry {
    mode: 'goal' | 'knowledge-note' | 'chat'
    goalDraft: GoalDraft | null
    editableGoal: { name, description, ... }
    editableKeyResults: [...]
    noteSummary: NoteSummary | null
    showGoalDraftEditor: boolean
  }
}
```

**时机**：

- 创建会话后
- 生成 draft 后
- 编辑 draft 后
- 消息发送时

---

## P0-1 需要的前端改动

### 改动 1：扩展状态管理

在 `ref` 声明部分新增：

```typescript
// Goal 澄清流程相关状态
const goalClarificationRequired = ref(false);
const goalClarificationQuestions = ref<Array<{ question: string; context?: string }>>([]);
const goalClarificationAnswers = ref<string[]>([]);
const goalClarificationLoading = ref(false);

// 澄清流程阶段
type GoalWorkflowStage =
  | 'input'
  | 'clarifying'
  | 'clarification-required'
  | 'draft-generating'
  | 'draft-ready'
  | 'creating';
const goalWorkflowStage = ref<GoalWorkflowStage>('input');
```

**在 PersistedWorkflowEntry 中新增**：

```typescript
type PersistedWorkflowEntry = {
  // ... 现有字段

  // 新增字段
  goalClarificationQuestions?: Array<{ question: string; context?: string }>;
  goalClarificationAnswers?: string[];
  goalWorkflowStage?: GoalWorkflowStage;
};
```

---

### 改动 2：改进 generateGoalDraftFromConversation

当前实现很简单：

```typescript
async function generateGoalDraftFromConversation() {
  // 1. 调用 service.generateGoal()
  // 2. 应用 draft
  // 3. 显示编辑器
}
```

新的实现（两阶段）：

```typescript
async function generateGoalDraftFromConversation(skipClarification: boolean = false) {
  if (!selectedModel.value || !hasWorkflowUserMessages.value) {
    return;
  }

  // Step 1：Check if clarification is needed
  if (!skipClarification && !goalDraft.value) {
    goalWorkflowStage.value = 'clarifying';
    goalClarificationLoading.value = true;
    try {
      const response = await service.generateGoal({
        idea: buildConversationTranscript(),
        includeKeyResults: true,
        providerId: selectedModel.value.providerId,
        model: selectedModel.value.modelId,
        enableClarification: true, // 新参数
      });

      // Check response state
      if (response.state === 'clarification') {
        goalClarificationRequired.value = true;
        goalClarificationQuestions.value = response.clarification?.questions ?? [];
        goalWorkflowStage.value = 'clarification-required';
        persistWorkflowState(chatConversationId.value);
        scrollMessagesToBottom();
        return;
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, 'aiAssistant.dialogs.generateGoal.clarificationFailed'));
      goalWorkflowStage.value = 'input';
      return;
    } finally {
      goalClarificationLoading.value = false;
    }
  }

  // Step 2：Generate draft (either after clarification or if skipped)
  goalWorkflowStage.value = 'draft-generating';
  goalDraftLoading.value = true;
  try {
    const draft = (await service.generateGoal({
      idea: buildConversationTranscript(),
      includeKeyResults: true,
      providerId: selectedModel.value.providerId,
      model: selectedModel.value.modelId,
      enableClarification: false,
      clarificationAnswers: goalClarificationAnswers.value.length
        ? goalClarificationAnswers.value
        : undefined,
    })) as GoalDraft;

    applyGoalDraft(draft);
    goalWorkflowStage.value = 'draft-ready';
    goalClarificationRequired.value = false;
    showGoalDraftEditor.value = false;
    await maybeRenameCurrentConversation(editableGoal.value.name || conversationTitle.value);
    toast.success(t('aiAssistant.dialogs.generateGoal.draftGenerated'));
    persistWorkflowState(chatConversationId.value);
    scrollMessagesToBottom();
  } catch (error) {
    toast.error(getAIErrorMessage(error, 'aiAssistant.dialogs.generateGoal.generateFailed'));
    goalWorkflowStage.value = 'input';
  } finally {
    goalDraftLoading.value = false;
  }
}

// 用户提交澄清回答时调用
async function submitGoalClarifications(answers: string[]) {
  goalClarificationAnswers.value = answers;
  goalClarificationRequired.value = false;
  // 继续生成 draft，但这次传入澄清答案
  await generateGoalDraftFromConversation(true); // skipClarification=true
}
```

---

### 改动 3：新增澄清问题 UI 组件

在模板中，goal draft 卡片之前添加澄清问题展示：

```vue
<!-- Clarification Questions Section -->
<section
  v-if="toolMode === 'goal' && goalWorkflowStage === 'clarification-required'"
  class="rounded-3xl border bg-card p-5"
>
  <div class="flex flex-col gap-4">
    <div class="space-y-2">
      <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('aiAssistant.chatPage.workflow.clarificationRequired') }}
      </p>
      <h2 class="text-lg font-semibold text-foreground">
        {{ t('aiAssistant.chatPage.workflow.clarifyYourGoal') }}
      </h2>
      <p class="text-sm leading-6 text-muted-foreground">
        {{ t('aiAssistant.chatPage.workflow.clarificationDescription') }}
      </p>
    </div>

    <!-- Questions List -->
    <div class="space-y-3">
      <div v-for="(q, index) in goalClarificationQuestions" :key="`q-${index}`" 
           class="rounded-lg border bg-muted/30 p-3">
        <label class="flex items-start gap-2">
          <span class="mt-0.5 text-sm font-medium text-foreground">Q{{ index + 1 }}:</span>
          <span class="flex-1 text-sm text-foreground">{{ q.question }}</span>
        </label>
        <div v-if="q.context" class="mt-1 ml-6 text-xs text-muted-foreground">
          {{ q.context }}
        </div>
        <textarea
          v-model="goalClarificationAnswers[index]"
          :placeholder="t('aiAssistant.chatPage.workflow.enterAnswer')"
          class="mt-2 min-h-10 w-full rounded border bg-background p-2 text-sm"
          @keydown.enter.ctrl="submitGoalClarifications(goalClarificationAnswers)"
        />
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap gap-2">
      <Button
        :disabled="goalClarificationLoading || !goalClarificationAnswers.every(a => a?.trim())"
        @click="submitGoalClarifications(goalClarificationAnswers)"
      >
        {{
          goalClarificationLoading
            ? t('aiAssistant.dialogs.generateGoal.generating')
            : t('aiAssistant.chatPage.workflow.continueWithAnswers')
        }}
      </Button>
      <Button
        variant="outline"
        @click="generateGoalDraftFromConversation(true)"
      >
        {{ t('aiAssistant.chatPage.workflow.skipClarification') }}
      </Button>
    </div>
  </div>
</section>

<!-- Existing Goal Draft Section (updated condition) -->
<section
  v-if="toolMode === 'goal' && goalDraft && goalWorkflowStage !== 'clarification-required'"
  class="rounded-3xl border bg-card p-5"
>
  <!-- ... 保持不变 ... -->
</section>
```

---

### 改动 4：更新底部操作区

条件判断需要考虑新的工作流阶段：

```vue
<template v-if="toolMode === 'goal'">
  <!-- Clarification Stage -->
  <template v-if="goalWorkflowStage === 'clarification-required'">
    <!-- 澄清问题已在上面单独显示 -->
  </template>

  <!-- Input / Clarifying Stage -->
  <template v-else-if="!goalDraft">
    <Button
      variant="outline"
      :disabled="goalDraftLoading || !canRunWorkflowActions"
      @click="generateGoalDraftFromConversation"
    >
      {{
        goalClarificationLoading
          ? t('aiAssistant.dialogs.generateGoal.clarifying')
          : goalDraftLoading
            ? t('aiAssistant.dialogs.generateGoal.generating')
            : t('aiAssistant.chatPage.workflow.generateGoalDraft')
      }}
    </Button>
  </template>

  <!-- Draft Ready Stage -->
  <template v-else>
    <Button :disabled="creatingGoal" @click="handleCreateGoalFromDraft">
      {{
        creatingGoal
          ? t('aiAssistant.goalDraft.creatingGoal')
          : t('aiAssistant.chatPage.workflow.createGoalDirectly')
      }}
    </Button>
    <Button variant="outline" @click="toggleGoalDraftEditor">
      {{
        showGoalDraftEditor
          ? t('aiAssistant.chatPage.workflow.hideGoalEditor')
          : t('aiAssistant.chatPage.workflow.editGoalBeforeCreate')
      }}
    </Button>
    <Button
      variant="ghost"
      :disabled="goalDraftLoading || !canRunWorkflowActions"
      @click="generateGoalDraftFromConversation"
    >
      {{ t('aiAssistant.chatPage.workflow.regenerateGoalDraft') }}
    </Button>
  </template>
</template>
```

---

### 改动 5：持久化澄清状态

修改 `snapshotWorkflowEntry()` 和 `restoreWorkflowState()`：

```typescript
function snapshotWorkflowEntry(): PersistedWorkflowEntry | null {
  if (toolMode.value === 'chat') {
    return null;
  }

  return {
    mode: toolMode.value,
    goalDraft: goalDraft.value,
    editableGoal: {/* ... */},
    editableKeyResults: [/* ... */],
    noteSummary: createStoredNoteSummary(noteSummary.value),
    showGoalDraftEditor: showGoalDraftEditor.value,

    // 新增
    goalClarificationQuestions: goalClarificationQuestions.value,
    goalClarificationAnswers: goalClarificationAnswers.value,
    goalWorkflowStage: goalWorkflowStage.value,
  };
}

function restoreWorkflowState(conversationId: string) {
  const entry = readWorkflowStorage()[conversationId];
  resetWorkflowArtifacts();

  if (!entry) {
    toolMode.value = 'chat';
    return;
  }

  toolMode.value = entry.mode;
  goalDraft.value = entry.goalDraft;
  editableGoal.value = {/* ... */};
  editableKeyResults.value = [/* ... */];
  noteSummary.value = entry.noteSummary ? createStoredNoteSummary(entry.noteSummary) : null;
  showGoalDraftEditor.value = Boolean(entry.showGoalDraftEditor);

  // 新增
  goalClarificationQuestions.value = entry.goalClarificationQuestions ?? [];
  goalClarificationAnswers.value = entry.goalClarificationAnswers ?? [];
  goalWorkflowStage.value = entry.goalWorkflowStage ?? 'input';
}
```

---

## 关键设计观察

### 1. 当前 Goal Draft 流程已经优化完善

- 消息流式追加
- 工作流状态与会话关联
- 本地状态持久化完整
- 编辑器与预览分离

### 2. 澄清流程需要的改动相对轻量

- 只需在状态中新增 3-4 个 ref
- 核心 UI 改动是新增一个"澄清问题卡片"
- 兼容现有的持久化机制

### 3. 状态恢复机制是关键

- 当前已经支持会话级工作流恢复
- 澄清状态可以自然地扩展进现有机制
- 用户刷新页面时能恢复到"澄清问题"步骤（如果还未提交）

### 4. 两阶段 LLM 调用的前端协调

- 第一次调用是澄清检查（可选，`enableClarification=true`）
- 第二次调用是 draft 生成（带澄清答案）
- 前端需要清楚地管理这两个阶段的状态转换

---

## 与其他组件的关系

### 与 AIGoalDraftEditor.vue 的关系

- 澄清问题 UI 是 **独立的卡片**，不在 editor 内
- editor 的用途是修改 draft 细节（名字、KR 等）
- 澄清问题是 draft 之前的前置步骤

### 与 API Client Service 的关系

- 需要扩展 `AIClientService.generateGoal()` 的签名
  - 新增 `enableClarification?: boolean`
  - 新增 `clarificationAnswers?: string[]`
- 响应需要支持两种状态：`state: 'clarification' | 'draft'`

---

## 本地化字符串需求

新增以下 i18n key：

```
aiAssistant.chatPage.workflow.clarificationRequired
aiAssistant.chatPage.workflow.clarifyYourGoal
aiAssistant.chatPage.workflow.clarificationDescription
aiAssistant.chatPage.workflow.enterAnswer
aiAssistant.chatPage.workflow.continueWithAnswers
aiAssistant.chatPage.workflow.skipClarification
aiAssistant.dialogs.generateGoal.clarifying
```

---

## 测试要点

### 单元测试（组件逻辑）

- `generateGoalDraftFromConversation()` 处理澄清响应
- `submitGoalClarifications()` 正确传递答案
- 状态转换逻辑正确

### E2E 测试（工作流）

1. 输入模糊 idea → 系统返回澄清问题
2. 填写答案 → 系统继续生成 draft
3. 刷新页面 → 澄清问题恢复显示
4. 跳过澄清 → 直接生成 draft

---

## 一句话总结

P0-1 的前端改动是：**在现有 Goal 工作流中插入澄清问题卡片 UI，管理澄清阶段状态，支持两阶段 LLM 调用，并确保澄清状态能在会话中正确持久化和恢复**。
