<template>
  <div
    ref="viewport"
    class="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable px-4 py-5 @md/ai:px-6 @xl/ai:px-10"
    data-testid="ai-message-panel"
  >
    <div
      class="mx-auto flex w-full max-w-[52rem] flex-col gap-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <!-- Message timeline -->
      <template v-if="timeline.length">
        <article
          v-for="row in timelineRows"
          :key="row.id"
          :data-scroll-row="row.id"
          :data-streaming="row.kind === 'assistant-turn' && row.isActive"
          class="flex w-full min-w-0"
          :class="[
            row.kind === 'user-message'
              ? 'group/message flex-col items-end gap-1'
              : 'justify-start',
            row.kind === 'user-message' && row.groupedWithNext ? '-mb-3' : '',
          ]"
        >
          <template v-if="row.kind === 'user-message'">
            <!-- T3 Code renders user media above the bubble as its own shape. -->
            <div
              v-if="rowImageAttachments(row).length"
              class="flex max-w-[80%] min-w-0 justify-end"
              data-testid="ai-message-images"
            >
              <div
                class="grid gap-1"
                :class="
                  rowImageAttachments(row).length === 1
                    ? 'w-fit max-w-full grid-cols-1'
                    : 'w-80 max-w-full grid-cols-2'
                "
              >
                <div
                  v-for="(attachment, attachmentIndex) in rowImageAttachments(row)"
                  :key="`${row.id}:image:${attachmentIndex}`"
                  class="overflow-hidden rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised))]"
                >
                  <img
                    :src="attachment.previewDataUrl"
                    :alt="attachment.filename || ''"
                    class="block transform-gpu object-contain"
                    :class="
                      rowImageAttachments(row).length === 1
                        ? 'h-48 w-auto max-w-full min-w-24'
                        : 'aspect-[4/3] size-full object-cover'
                    "
                    loading="lazy"
                    decoding="async"
                    data-testid="ai-message-image"
                  />
                </div>
              </div>
            </div>
            <div
              v-if="row.item.content.trim() || rowFileAttachments(row).length"
              class="max-w-[80%] min-w-0 rounded-2xl bg-[hsl(var(--surface-raised))] px-3 py-2 text-[13.5px] leading-6 text-foreground"
              :class="[
                aiUiHost.semanticElevationClass('raised'),
                row.groupedWithPrevious ? 'rounded-tr-md' : '',
                row.groupedWithNext ? 'rounded-br-md' : '',
              ]"
            >
              <h3 class="sr-only select-none">{{ t('aiAssistant.dialogs.chat.you') }}</h3>
              <div v-if="rowFileAttachments(row).length" class="mb-2 flex flex-wrap gap-1.5">
                <span
                  v-for="(attachment, attachmentIndex) in rowFileAttachments(row)"
                  :key="`${row.id}:attachment:${attachmentIndex}`"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[hsl(var(--surface-overlay)/0.72)] px-2 py-1 text-[11px] leading-5 text-[hsl(var(--foreground-muted))] sm:max-w-[15rem]"
                  data-testid="ai-message-attachment"
                >
                  <ImageIcon
                    v-if="attachment.mediaType.startsWith('image/')"
                    class="h-3.5 w-3.5 shrink-0"
                  />
                  <Paperclip v-else class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 truncate">{{
                    attachment.filename || attachment.mediaType
                  }}</span>
                </span>
              </div>
              <p v-if="row.item.content.trim()" class="whitespace-pre-wrap break-words">
                {{ row.item.content }}
              </p>
            </div>
            <!-- T3 Code: timestamp, edit and copy share one hover-revealed row. -->
            <div
              v-if="row.item.createdAt !== undefined || row.item.content.trim()"
              class="flex max-w-[80%] flex-wrap items-center justify-end gap-x-2 pe-1 text-xs tabular-nums transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/message:opacity-100"
              :class="copiedMessageId === row.id ? 'opacity-100' : 'opacity-0'"
              data-testid="ai-user-message-meta"
            >
              <span
                v-if="row.item.createdAt !== undefined"
                class="whitespace-nowrap text-muted-foreground"
                :title="formatMessageTimestampTooltip(row.item.createdAt)"
                data-testid="ai-user-message-time"
              >
                {{ formatMessageTimestamp(row.item.createdAt) }}
              </span>
              <div class="flex items-center gap-0.5">
                <Button
                  v-if="row.item.content.trim()"
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  :title="t('aiAssistant.chatPage.message.edit')"
                  :aria-label="t('aiAssistant.chatPage.message.edit')"
                  data-testid="ai-user-message-edit"
                  @click="$emit('edit-message', row.item.content)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </Button>
                <Button
                  v-if="row.item.content.trim()"
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  :title="
                    copiedMessageId === row.id
                      ? t('aiAssistant.chatPage.message.copied')
                      : t('aiAssistant.chatPage.message.copy')
                  "
                  :aria-label="
                    copiedMessageId === row.id
                      ? t('aiAssistant.chatPage.message.copied')
                      : t('aiAssistant.chatPage.message.copy')
                  "
                  data-testid="ai-user-message-copy"
                  @click="copyMessage(row.id, row.item.content)"
                >
                  <Check v-if="copiedMessageId === row.id" class="h-3.5 w-3.5" />
                  <Copy v-else class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </template>

          <div v-else class="flex w-full min-w-0 items-start">
            <div class="group/message group/assistant min-w-0 flex-1 pt-0.5">
              <!-- T3 Code names the author for screen readers only; no avatar block. -->
              <h3 class="sr-only select-none">{{ t('aiAssistant.dialogs.chat.assistant') }}</h3>
              <AIActivityTimeline
                v-if="turnHasActivity(row)"
                :turn="row"
                @toggle-turn="toggleTurn"
                @toggle-work-group="toggleWorkGroup"
              />
              <section
                v-for="approval in row.approvals"
                :key="`${approval.runId}:${approval.toolCallId}`"
                class="mb-3 min-w-0 rounded-xl border border-border p-3"
                data-testid="ai-tool-approval"
                :aria-label="t('aiAssistant.chatPage.tools.approvalTitle')"
              >
                <p class="break-words text-sm font-medium">
                  {{ t(`aiAssistant.chatPage.tools.capabilities.${approval.toolName}`) }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground" role="status">
                  {{ t(`aiAssistant.chatPage.tools.${approval.status}`) }}
                </p>
                <p v-if="approval.status === 'pending'" class="mt-1 text-xs text-muted-foreground">
                  {{ t('aiAssistant.chatPage.tools.impact') }}
                </p>
                <p
                  v-if="approval.errorMessage"
                  role="alert"
                  class="mt-2 break-words text-xs text-destructive"
                >
                  {{ approval.errorMessage }}
                </p>
                <div
                  v-if="approval.status === 'pending' || approval.status === 'sending'"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <Button
                    type="button"
                    size="lg"
                    class="px-3"
                    :disabled="approval.status !== 'pending'"
                    data-testid="ai-tool-approve"
                    @click="$emit('tool-decision', approval, 'approve')"
                  >
                    {{ t('aiAssistant.chatPage.tools.approve') }}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    class="px-3"
                    :disabled="approval.status !== 'pending'"
                    data-testid="ai-tool-decline"
                    @click="$emit('tool-decision', approval, 'decline')"
                  >
                    {{ t('aiAssistant.chatPage.tools.decline') }}
                  </Button>
                </div>
              </section>
              <AILocalRequestCard
                v-for="request in row.nativeRequests"
                :key="request.request.requestId"
                :request="request"
                @respond="$emit('native-response', request, $event)"
              />
              <section
                v-for="request in row.askUserRequests"
                :key="`${request.runId}:${request.toolCallId}`"
                class="mb-3 min-w-0 overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.35)]"
                :data-ask-user-status="request.status"
                data-testid="ai-ask-user-request"
              >
                <!-- T3 Code collapses an answered question into question + chosen answer. -->
                <template v-if="request.status === 'answered'">
                  <button
                    type="button"
                    class="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--surface-raised)/0.5)]"
                    :aria-expanded="isAnsweredExpanded(request.toolCallId)"
                    data-testid="ai-ask-user-summary-toggle"
                    @click="toggleAnsweredExpanded(request.toolCallId)"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {{ request.question }}
                    </span>
                    <span
                      v-if="askUserAnswerText(request.toolCallId)"
                      class="min-w-0 max-w-[50%] truncate text-sm text-foreground"
                      data-testid="ai-ask-user-answer"
                    >
                      {{ askUserAnswerText(request.toolCallId) }}
                    </span>
                    <ChevronDown
                      v-if="isAnsweredExpanded(request.toolCallId)"
                      class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <ChevronRight
                      v-else
                      class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    v-if="isAnsweredExpanded(request.toolCallId)"
                    class="space-y-1 border-t border-[hsl(var(--border-subtle))] px-3 py-2"
                    data-testid="ai-ask-user-history"
                  >
                    <p class="whitespace-pre-wrap text-sm text-muted-foreground">
                      {{ request.question }}
                    </p>
                    <p
                      v-if="askUserAnswerText(request.toolCallId)"
                      class="ps-3 whitespace-pre-wrap text-sm text-foreground"
                    >
                      {{ askUserAnswerText(request.toolCallId) }}
                    </p>
                  </div>
                </template>

                <form
                  v-else
                  class="min-w-0 px-3 pt-2.5 pb-3"
                  @submit.prevent="submitAskUser(request)"
                >
                  <div class="flex items-start gap-2">
                    <p class="min-w-0 flex-1 text-xs text-muted-foreground">
                      {{ t('aiAssistant.local.question') }}
                    </p>
                    <span
                      v-if="request.status !== 'pending'"
                      class="shrink-0 text-xs text-muted-foreground"
                      role="status"
                    >
                      {{ t(`aiAssistant.local.${request.status}`) }}
                    </span>
                    <button
                      v-if="request.status === 'pending' || request.status === 'sending'"
                      type="button"
                      class="-me-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50"
                      :disabled="request.status !== 'pending'"
                      :aria-label="t('aiAssistant.local.cancel')"
                      :title="t('aiAssistant.local.cancel')"
                      data-testid="ai-ask-user-cancel"
                      @click="$emit('ask-user-cancel', request)"
                    >
                      <X class="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <p
                    class="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-foreground"
                  >
                    {{ request.question }}
                  </p>
                  <p
                    v-if="request.errorMessage"
                    role="alert"
                    class="mt-1.5 text-xs text-destructive"
                  >
                    {{ request.errorMessage }}
                  </p>
                  <p
                    v-if="askUserErrors[request.toolCallId]"
                    role="alert"
                    class="mt-1.5 text-xs text-destructive"
                  >
                    {{ askUserErrors[request.toolCallId] }}
                  </p>
                  <div
                    v-if="request.options?.length"
                    class="mt-2 space-y-0.5"
                    :role="request.selectionMode === 'multi_select' ? 'group' : 'radiogroup'"
                    :aria-label="request.question"
                  >
                    <button
                      v-for="option in request.options"
                      :key="option.label"
                      type="button"
                      :role="request.selectionMode === 'multi_select' ? 'checkbox' : 'radio'"
                      :aria-checked="isAskUserOptionSelected(request, option.label)"
                      :disabled="request.status !== 'pending'"
                      data-testid="ai-ask-user-option"
                      class="group flex w-full items-start gap-2.5 rounded-md py-1.5 ps-2 pe-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50"
                      :class="
                        isAskUserOptionSelected(request, option.label)
                          ? 'bg-[hsl(var(--selected)/0.6)] text-foreground'
                          : 'text-foreground/70 hover:bg-muted/30'
                      "
                      @click="selectAskUserOption(request, option.label)"
                    >
                      <span
                        class="pointer-events-none mt-0.5 flex size-4 shrink-0 items-center justify-center"
                        aria-hidden="true"
                      >
                        <span
                          class="flex size-4 items-center justify-center border border-foreground/55"
                          :class="
                            request.selectionMode === 'multi_select' ? 'rounded-sm' : 'rounded-full'
                          "
                        >
                          <span
                            v-if="isAskUserOptionSelected(request, option.label)"
                            class="bg-primary"
                            :class="
                              request.selectionMode === 'multi_select'
                                ? 'size-2.5 rounded-[2px]'
                                : 'size-2 rounded-full'
                            "
                          />
                        </span>
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium">{{ option.label }}</span>
                        <span
                          v-if="option.description && option.description !== option.label"
                          class="mt-0.5 block text-xs leading-5 text-muted-foreground"
                        >
                          {{ option.description }}
                        </span>
                      </span>
                    </button>
                  </div>
                  <p
                    v-if="request.selectionMode === 'multi_select'"
                    class="mt-1 ps-2 text-xs text-muted-foreground"
                  >
                    {{ t('aiAssistant.local.selectAllThatApply') }}
                  </p>
                  <label class="mt-2 block space-y-1">
                    <span class="block text-xs text-muted-foreground">
                      {{ t('aiAssistant.local.otherAnswer') }}
                    </span>
                    <Input
                      :model-value="askUserFreeText[request.toolCallId] ?? ''"
                      class="h-8 w-full rounded-md border bg-background px-2 text-sm"
                      :maxlength="4000"
                      :disabled="request.status !== 'pending'"
                      data-testid="ai-ask-user-free-text"
                      @update:model-value="setAskUserFreeText(request.toolCallId, $event)"
                    />
                  </label>
                  <div
                    v-if="askUserNeedsSubmit(request)"
                    class="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <Button
                      v-if="request.status === 'pending' || request.status === 'sending'"
                      type="submit"
                      size="sm"
                      :disabled="request.status !== 'pending'"
                      data-testid="ai-ask-user-submit"
                    >
                      {{ t('aiAssistant.local.answer') }}
                    </Button>
                  </div>
                </form>
              </section>
              <template v-for="part in row.messages" :key="part.id">
                <AIMessageContent
                  v-if="part.item.content.trim()"
                  :content="
                    part.item.workflowInterruption
                      ? getGoalWorkflowInterruptionMessage(part.item.workflowInterruption, t)
                      : part.item.content
                  "
                  :muted="part.item.status === 'interrupted'"
                  v-bind="
                    part.item.status === 'interrupted'
                      ? {
                          role: 'status',
                          'data-testid': 'ai-workflow-interruption',
                        }
                      : {}
                  "
                  :generating="part.item.status === 'generating'"
                />
                <p
                  v-if="part.item.status === 'aborted' || part.item.status === 'error'"
                  class="mt-2 break-words text-xs"
                  :class="
                    part.item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  "
                  :role="part.item.status === 'error' ? 'alert' : 'status'"
                >
                  {{ getMessageStatusLabel(part.item) }}
                </p>
                <div
                  v-if="part.item.content.trim() && part.item.status !== 'generating'"
                  class="mt-1.5 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/assistant:opacity-100"
                  :class="copiedMessageId === part.id ? 'opacity-100' : 'opacity-0'"
                  data-testid="ai-message-actions"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    class="text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    :title="
                      copiedMessageId === part.id
                        ? t('aiAssistant.chatPage.message.copied')
                        : t('aiAssistant.chatPage.message.copy')
                    "
                    :aria-label="
                      copiedMessageId === part.id
                        ? t('aiAssistant.chatPage.message.copied')
                        : t('aiAssistant.chatPage.message.copy')
                    "
                    data-testid="ai-message-copy"
                    @click="copyMessage(part.id, part.item.content)"
                  >
                    <Check v-if="copiedMessageId === part.id" class="h-3.5 w-3.5" />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </Button>
                  <span
                    v-if="part.item.createdAt !== undefined"
                    class="whitespace-nowrap text-muted-foreground"
                    :title="formatMessageTimestampTooltip(part.item.createdAt)"
                    data-testid="ai-message-time"
                  >
                    {{ formatMessageTimestamp(part.item.createdAt) }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </article>

        <!-- Workflow decision surface: sits with the conversation (V2 §6.0) -->
        <div v-if="showWorkflowSurface" class="space-y-3" data-testid="ai-workflow-message-surface">
          <slot name="workflow-surface" />
        </div>
      </template>

      <!-- Welcome / idle (no messages): content sits directly on the canvas, not in a dashboard card. -->
      <div
        v-else
        class="flex flex-col items-center justify-center"
        :class="toolMode === 'chat' && hasModels ? 'min-h-0 py-6' : 'min-h-[27rem] py-10'"
      >
        <div class="w-full max-w-xl text-center" data-testid="ai-welcome-state">
          <div
            class="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--surface-raised)/0.72)] text-[hsl(var(--foreground-muted))]"
            :class="aiUiHost.semanticElevationClass('raised')"
          >
            <component
              :is="
                toolMode === 'knowledge-capture'
                  ? NotebookPen
                  : toolMode === 'goal-create'
                    ? Sparkles
                    : toolMode === 'task-create'
                      ? ClipboardCheck
                      : toolMode === 'knowledge-qa'
                        ? Search
                        : MemoFlowAiIcon
              "
              class="h-[18px] w-[18px]"
            />
          </div>
          <h2 class="mt-4 text-[22px] font-semibold tracking-[-0.025em] text-foreground">
            {{
              toolMode === 'chat'
                ? t('aiAssistant.chatPage.welcomeTitle')
                : t(`aiAssistant.chatPage.toolIntro.${getToolLocaleKey(toolMode)}.title`)
            }}
          </h2>
          <p
            class="mx-auto mt-2 max-w-md text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
          >
            {{
              toolMode === 'chat'
                ? t('aiAssistant.chatPage.welcomeDescription')
                : t(`aiAssistant.chatPage.toolIntro.${getToolLocaleKey(toolMode)}.description`)
            }}
          </p>

          <div
            v-if="toolMode === 'chat' && !hasModels"
            class="mt-6"
            data-testid="ai-welcome-no-model"
          >
            <div
              class="mx-auto flex max-w-md items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.5)] px-3 py-2 text-left"
              :class="aiUiHost.semanticElevationClass('inset')"
            >
              <Settings2 class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                {{ t('aiAssistant.chatPage.noModel.description') }}
              </span>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                data-testid="ai-welcome-configure-ai"
                @click="$emit('configure-ai')"
              >
                {{ t('aiAssistant.chatPage.noModel.configure') }}
              </button>
            </div>

            <div class="mx-auto mt-4 grid max-w-md gap-1 @sm/ai:grid-cols-2">
              <button
                type="button"
                class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
                data-testid="ai-welcome-create-goal"
                @click="$emit('create-goal')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
                >
                  <Target class="h-3.5 w-3.5" />
                </span>
                <span class="truncate">{{ t('aiAssistant.chatPage.noModel.createGoal') }}</span>
              </button>
              <button
                type="button"
                class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
                data-testid="ai-welcome-quick-task"
                @click="$emit('quick-task')"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
                >
                  <Plus class="h-3.5 w-3.5" />
                </span>
                <span class="truncate">{{ t('aiAssistant.chatPage.noModel.quickTask') }}</span>
              </button>
            </div>
          </div>

          <!-- Compact shortcut rows: suggestions, not dashboard cards. -->
          <div
            v-else-if="toolMode === 'chat'"
            class="mx-auto mt-6 grid max-w-lg gap-1 @sm/ai:grid-cols-2"
          >
            <button
              v-for="entry in shortcutEntries"
              :key="entry.mode"
              type="button"
              class="group flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-raised)/0.28)] px-3 py-2 text-left text-[13px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.32)] transition-[background-color,box-shadow,color,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_6px_18px_-14px_rgba(0,0,0,0.55)]"
              :data-testid="`ai-welcome-entry-${entry.mode}`"
              @click="$emit('select-shortcut', entry.mode)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--selected)/0.72)] text-[hsl(var(--foreground-subtle))] transition-colors group-hover:text-foreground"
              >
                <component :is="entry.icon" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-foreground">
                  {{ t(`aiAssistant.chatPage.shortcuts.${entry.localeKey}.title`) }}
                </span>
              </span>
            </button>
          </div>
        </div>

        <!-- Workflow surface also available before first message (tool mode) -->
        <div
          v-if="showWorkflowSurface"
          class="mt-6 w-full max-w-xl space-y-3"
          data-testid="ai-workflow-message-surface"
        >
          <slot name="workflow-surface" />
        </div>
      </div>
      <slot name="workflow-context" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { preserveTimelineDisclosure } from '../composables/useTimelineScrollAnchoring';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ClipboardCheck,
  NotebookPen,
  ImageIcon,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  X,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { Input } from '@memoflow/ui-vue-shadcn/components/ui/input';
import type { LocalAgentRequestResponse } from '@memoflow/ai-contracts';
import AILocalRequestCard from './AILocalRequestCard.vue';
import AIMessageContent from './AIMessageContent.vue';
import AIActivityTimeline from './AIActivityTimeline.vue';
import {
  deriveChatTimelineRows,
  runTimingProjectionRevision,
  type AssistantTurnTimelineRow,
  type UserMessageTimelineRow,
} from '../composables/agentActivity';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';
import {
  getToolLocaleKey,
  type ChatAttachmentView,
  type ChatItem,
  type ChatToolApproval,
  type ChatNativeRequest,
  type ChatAskUserRequest,
  type ChatAskUserAnswer,
  type WorkflowMode,
} from '../composables/types';
import { aiUiHost } from '../ai-ui-host';
import { useAIFormatters } from '../composables/useAIFormatters';
import { getGoalWorkflowInterruptionMessage } from '../composables/error';

const props = withDefaults(
  defineProps<{
    timeline: ChatItem[];
    toolMode: WorkflowMode;
    /** Whether AI shortcuts can proceed without redirecting to configuration. */
    hasModels?: boolean;
    /** Show workflow decision/actions + artifact surface near the timeline. */
    showWorkflowSurface?: boolean;
    canCaptureKnowledge?: boolean;
  }>(),
  {
    hasModels: true,
    showWorkflowSurface: false,
  },
);

const emit = defineEmits<{
  'select-shortcut': [mode: WorkflowMode];
  'configure-ai': [];
  'create-goal': [];
  'quick-task': [];
  'native-response': [request: ChatNativeRequest, response: LocalAgentRequestResponse['response']];
  'edit-message': [content: string];
  'tool-decision': [approval: ChatToolApproval, decision: 'approve' | 'decline'];
  'ask-user-answer': [request: ChatAskUserRequest, answer: ChatAskUserAnswer];
  'ask-user-cancel': [request: ChatAskUserRequest];
}>();

const shortcutEntries = computed(() =>
  [
    { mode: 'goal-create' as const, localeKey: 'goalCreate', icon: Sparkles },
    {
      mode: 'task-create' as const,
      localeKey: 'taskCreate',
      icon: ClipboardCheck,
    },
    {
      mode: 'knowledge-capture' as const,
      localeKey: 'knowledgeCapture',
      icon: NotebookPen,
    },
    { mode: 'knowledge-qa' as const, localeKey: 'knowledgeQa', icon: Search },
  ].filter((entry) => entry.mode !== 'knowledge-capture' || props.canCaptureKnowledge),
);

const viewport = ref<HTMLElement | null>(null);
const copiedMessageId = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

async function copyMessage(messageId: string, content: string) {
  if (!content.trim() || typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
    return;
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    return;
  }
  copiedMessageId.value = messageId;
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    if (copiedMessageId.value === messageId) copiedMessageId.value = null;
  }, 1600);
}

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

defineExpose({ viewport });

const { t } = useI18n();
const askUserAnswers = reactive<Record<string, string | string[]>>({});
const askUserFreeText = reactive<Record<string, string>>({});
const askUserErrors = reactive<Record<string, string>>({});
const submittedAskUserAnswers = reactive<Record<string, ChatAskUserAnswer>>({});
const expandedAnsweredRequests = ref(new Set<string>());

function setAskUserFreeText(toolCallId: string, value: unknown) {
  askUserFreeText[toolCallId] = typeof value === 'string' ? value : '';
  if (askUserFreeText[toolCallId]?.trim()) delete askUserErrors[toolCallId];
}

/** T3 Code: a typed custom answer replaces selected options. */
function hasCustomAskUserAnswer(toolCallId: string): boolean {
  return Boolean(askUserFreeText[toolCallId]?.trim());
}

function isAskUserOptionSelected(request: ChatAskUserRequest, label: string): boolean {
  if (hasCustomAskUserAnswer(request.toolCallId)) return false;
  const answer = askUserAnswers[request.toolCallId];
  return Array.isArray(answer) ? answer.includes(label) : answer === label;
}

function selectAskUserOption(request: ChatAskUserRequest, label: string) {
  if (request.status !== 'pending') return;
  if (request.selectionMode === 'multi_select') {
    const current = askUserAnswers[request.toolCallId];
    const selected = Array.isArray(current) ? current : [];
    askUserAnswers[request.toolCallId] = selected.includes(label)
      ? selected.filter((value) => value !== label)
      : [...selected, label];
    delete askUserErrors[request.toolCallId];
    return;
  }
  // T3 Code advances a single-select question as soon as its option is clicked.
  askUserAnswers[request.toolCallId] = label;
  submitAskUser(request, label);
}

/** Single-select with options needs no button; multi-select, free text and optionless prompts do. */
function askUserNeedsSubmit(request: ChatAskUserRequest): boolean {
  if (request.selectionMode === 'multi_select') return true;
  if (!request.options?.length) return true;
  return hasCustomAskUserAnswer(request.toolCallId);
}

function askUserAnswerText(toolCallId: string): string {
  const answer = submittedAskUserAnswers[toolCallId];
  if (answer === undefined) return '';
  return Array.isArray(answer) ? answer.join(', ') : answer;
}

function isAnsweredExpanded(toolCallId: string): boolean {
  return expandedAnsweredRequests.value.has(toolCallId);
}

function toggleAnsweredExpanded(toolCallId: string) {
  const next = new Set(expandedAnsweredRequests.value);
  if (next.has(toolCallId)) next.delete(toolCallId);
  else next.add(toolCallId);
  expandedAnsweredRequests.value = next;
}

function submitAskUser(request: ChatAskUserRequest, explicitAnswer?: ChatAskUserAnswer) {
  if (request.status !== 'pending') return;
  const freeText = askUserFreeText[request.toolCallId]?.trim();
  let answer: ChatAskUserAnswer;
  if (freeText) {
    answer = freeText;
  } else if (request.selectionMode === 'multi_select') {
    const selected = askUserAnswers[request.toolCallId];
    if (!Array.isArray(selected) || selected.length === 0) {
      askUserErrors[request.toolCallId] = t('aiAssistant.local.answerRequired');
      return;
    }
    answer = [...selected];
  } else {
    const selected = explicitAnswer ?? askUserAnswers[request.toolCallId];
    if (typeof selected !== 'string' || !selected.trim()) {
      askUserErrors[request.toolCallId] = t('aiAssistant.local.answerRequired');
      return;
    }
    answer = selected;
  }
  delete askUserErrors[request.toolCallId];
  submittedAskUserAnswers[request.toolCallId] = answer;
  emit('ask-user-answer', request, answer);
}

const { getMessageStatusLabel, formatMessageTimestamp, formatMessageTimestampTooltip } =
  useAIFormatters();

/**
 * T3 Code renders image attachments as media, not as file chips. Only the live
 * turn carries `previewDataUrl`; persisted history has metadata alone.
 */
function rowImageAttachments(row: UserMessageTimelineRow): ChatAttachmentView[] {
  return (row.item.attachments ?? []).filter(
    (attachment) => attachment.mediaType.startsWith('image/') && Boolean(attachment.previewDataUrl),
  );
}

function rowFileAttachments(row: UserMessageTimelineRow): ChatAttachmentView[] {
  return (row.item.attachments ?? []).filter(
    (attachment) => !(attachment.mediaType.startsWith('image/') && attachment.previewDataUrl),
  );
}
const expandedTurnKeys = ref(new Set<string>());
const collapsedTurnKeys = ref(new Set<string>());
const expandedWorkGroupIds = ref(new Set<string>());
const collapsedWorkGroupIds = ref(new Set<string>());

function toggleTurn(turnKey: string, currentlyExpanded: boolean) {
  preserveTimelineDisclosure(viewport.value, () => {
    const nextExpanded = new Set(expandedTurnKeys.value);
    const nextCollapsed = new Set(collapsedTurnKeys.value);
    if (currentlyExpanded) {
      nextExpanded.delete(turnKey);
      nextCollapsed.add(turnKey);
    } else {
      nextCollapsed.delete(turnKey);
      nextExpanded.add(turnKey);
    }
    expandedTurnKeys.value = nextExpanded;
    collapsedTurnKeys.value = nextCollapsed;
  });
}

function toggleWorkGroup(groupId: string, currentlyExpanded: boolean) {
  preserveTimelineDisclosure(viewport.value, () => {
    const nextExpanded = new Set(expandedWorkGroupIds.value);
    const nextCollapsed = new Set(collapsedWorkGroupIds.value);
    if (currentlyExpanded) {
      nextExpanded.delete(groupId);
      nextCollapsed.add(groupId);
    } else {
      nextCollapsed.delete(groupId);
      nextExpanded.add(groupId);
    }
    expandedWorkGroupIds.value = nextExpanded;
    collapsedWorkGroupIds.value = nextCollapsed;
  });
}

function turnHasActivity(row: AssistantTurnTimelineRow): boolean {
  return Boolean(
    row.foldRow ||
    row.workRows.length > 0 ||
    row.isWaiting ||
    row.status === 'failed' ||
    row.status === 'interrupted' ||
    row.hasFailedTool,
  );
}

const timelineRows = computed(() => {
  void runTimingProjectionRevision.value;
  return deriveChatTimelineRows({
    timeline: props.timeline,
    expandedTurnKeys: expandedTurnKeys.value,
    collapsedTurnKeys: collapsedTurnKeys.value,
    expandedWorkGroupIds: expandedWorkGroupIds.value,
    collapsedWorkGroupIds: collapsedWorkGroupIds.value,
  });
});
</script>

<style scoped>
[data-testid='ai-message-panel'] {
  overflow-anchor: none;
}
</style>
