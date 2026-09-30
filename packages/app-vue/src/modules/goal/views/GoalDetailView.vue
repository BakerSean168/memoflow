<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="goal-detail-view"
  >
    <ModuleHeader data-testid="goal-detail-toolbar">
      <template #leading>
        <Button variant="ghost" size="sm" @click="router.push({ name: 'goal-list' })">
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
      </template>
    </ModuleHeader>

    <div
      v-if="isLoading && !workspace"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t('common.loading') }}
    </div>
    <div
      v-else-if="error && !workspace"
      role="alert"
      data-testid="goal-not-found"
      class="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {{ t('goal.inspect.goalUnavailable') }}
      <Button v-if="inspectedKrId" variant="ghost" @click="closeInspect">{{
        t('common.close')
      }}</Button>
    </div>

    <div v-else-if="!goal" role="alert" data-testid="goal-not-found" class="m-4 p-4 text-sm">
      {{ t('goal.inspect.goalUnavailable') }}
      <Button v-if="inspectedKrId" variant="ghost" @click="closeInspect">{{
        t('common.close')
      }}</Button>
    </div>
    <div
      v-else-if="goal && workspace"
      class="min-h-0 flex-1 overflow-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
    >
      <div class="mx-auto max-w-5xl space-y-6">
        <article
          class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"
          data-testid="goal-workspace-header"
        >
          <div class="space-y-1" data-testid="goal-detail-identity">
            <ProductAutoTextarea
              v-model="nameDraft"
              :max-length="80"
              :rows="1"
              data-testid="goal-detail-title"
              class="-mx-1 min-h-9 rounded-md px-1 text-2xl font-semibold leading-tight tracking-tight transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--selected)/0.72)]"
              :placeholder="t('goal.dialog.goalTitlePlaceholder')"
              :disabled="isSaving || !!goal.archivedAt"
              @blur="saveName"
              @keydown.enter.exact.prevent="commitNameFromKeyboard"
              @keydown.esc.prevent="resetInlineDrafts"
            />
            <ProductAutoTextarea
              v-model="summaryDraft"
              :max-length="255"
              :rows="1"
              data-testid="goal-detail-summary"
              class="-mx-1 min-h-7 rounded-md px-1 text-sm leading-5 text-muted-foreground transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--selected)/0.72)]"
              :placeholder="t('goal.dialog.summaryPlaceholder')"
              :disabled="isSaving || !!goal.archivedAt"
              @blur="saveSummary"
              @keydown.enter.exact.prevent="commitSummaryFromKeyboard"
              @keydown.esc.prevent="resetInlineDrafts"
            />
          </div>

          <div class="space-y-0.5" data-testid="goal-detail-metadata">
            <div
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-properties-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.detail.properties') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <div data-testid="goal-status" :data-goal-status="goal.status">
                  <GoalStatusPicker
                    :model-value="goal.status"
                    :base-status="goal.status"
                    :disabled="isSaving || !!goal.archivedAt"
                    @update:model-value="changeStatus"
                  />
                </div>

                <GoalTimeframePicker
                  v-if="startDraft || showStartEditor"
                  :model-value="startDraft"
                  :label="t('goal.dialog.startDate')"
                  test-id="goal-detail-start"
                  :aria-label="t('goal.dialog.startDate')"
                  :placeholder="t('goal.dialog.startDate')"
                  :max-start-boundary="
                    targetDraft ? goalTimeframeEndBoundary(targetDraft) : undefined
                  "
                  :constraint-text="t('goal.dialog.startAfterTarget')"
                  :disabled="isSaving || !!goal.archivedAt"
                  @update:model-value="saveStart"
                />

                <GoalTimeframePicker
                  v-if="targetDraft || showTargetEditor"
                  :model-value="targetDraft"
                  test-id="goal-detail-target"
                  :aria-label="t('goal.detail.target')"
                  :placeholder="t('goal.detail.target')"
                  :min-end-boundary="
                    startDraft ? goalTimeframeStartBoundary(startDraft) : undefined
                  "
                  :constraint-text="t('goal.dialog.targetBeforeStart')"
                  :disabled="isSaving || !!goal.archivedAt"
                  @update:model-value="saveTarget"
                />

                <Badge v-if="pastTarget" variant="secondary" data-testid="goal-past-target">
                  {{ t('goal.list.pastTarget') }}
                </Badge>

                <DropdownMenu v-if="hasMorePropertiesMenuItems">
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 rounded-full text-muted-foreground"
                      :aria-label="t('goal.detail.moreProperties')"
                      data-testid="goal-properties-more"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-52">
                    <DropdownMenuItem
                      v-if="!startDraft && !showStartEditor"
                      @click="showStartEditor = true"
                    >
                      <CalendarRange class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('goal.dialog.startDate') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="!targetDraft && !showTargetEditor"
                      @click="showTargetEditor = true"
                    >
                      <CalendarRange class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('goal.detail.target') }}
                    </DropdownMenuItem>
                    <DropdownMenuSub v-if="pendingReminderTriggers.length === 0">
                      <DropdownMenuSubTrigger>
                        <BellRing class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('goal.reminder.reminder') }}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-96 max-w-[calc(100vw-2rem)]">
                        <GoalReminderMenuItems
                          :model-value="reminderConfigDraft"
                          :start="startDraft"
                          :target="targetDraft"
                          :disabled="isSaving || !!goal.archivedAt"
                          @update:model-value="saveReminderConfig"
                          @request-custom-time="openCustomReminderPicker"
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub v-if="labelIdsDraft.length === 0 && !showLabelsEditor">
                      <DropdownMenuSubTrigger>
                        <Tag class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('goal.dialog.labels') }}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-60">
                        <DropdownMenuCheckboxItem
                          v-for="option in labelOptions"
                          :key="option.id"
                          :model-value="labelIdsDraft.includes(option.id)"
                          @update:model-value="toggleLabelSelection(option.id)"
                          @select.prevent
                        >
                          <span
                            v-if="option.color"
                            class="mr-2 h-2.5 w-2.5 shrink-0 rounded-full border border-[hsl(var(--border-subtle))]"
                            :style="{ backgroundColor: option.color }"
                          />
                          <span class="min-w-0 flex-1 truncate">{{ option.name }}</span>
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuItem v-if="labelOptions.length === 0" disabled>
                          {{ t('goal.list.noLabels') }}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem @click="openLabelsEditor">
                          <Plus class="mr-2 h-4 w-4 text-muted-foreground" />
                          {{ t('goal.detail.createOrManageLabels') }}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub v-if="taskCount === 0">
                      <DropdownMenuSubTrigger>
                        <ListTodo class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('goal.list.tasks') }}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-52">
                        <DropdownMenuItem @click="createTaskForGoal()">
                          <Plus class="mr-2 h-4 w-4 text-muted-foreground" />
                          {{ t('goal.detail.createBoundTask') }}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub v-if="knowledgeCount === 0">
                      <DropdownMenuSubTrigger>
                        <NotebookText class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('goal.list.knowledge') }}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-72">
                        <GoalKnowledgeMenuItems
                          :goal-id="goalId"
                          :linked-document-ids="linkedKnowledgeDocumentIds"
                          :disabled="isSaving || !!goal.archivedAt"
                          @changed="handleKnowledgeChanged"
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub v-if="reviewCount === 0">
                      <DropdownMenuSubTrigger>
                        <History class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('goal.list.reviews') }}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-48">
                        <DropdownMenuItem @click="openReviewCreate">
                          <Plus class="mr-2 h-4 w-4 text-muted-foreground" />
                          {{ t('goal.detail.createReview') }}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              v-if="pendingReminderTriggers.length"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-reminders-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.reminder.reminder') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <DropdownMenu
                  v-for="trigger in pendingReminderTriggers"
                  :key="reminderTriggerKey(trigger)"
                >
                  <DropdownMenuTrigger as-child>
                    <button type="button" class="max-w-64">
                      <Badge
                        variant="outline"
                        class="h-7 max-w-full rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal hover:bg-[hsl(var(--hover))]"
                      >
                        <span class="truncate">{{ reminderTriggerLabel(trigger) }}</span>
                      </Badge>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-44">
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="removeReminderTrigger(trigger)"
                    >
                      <Trash2 class="mr-2 h-4 w-4" />
                      {{ t('goal.reminder.removeReminder') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 rounded-full text-muted-foreground"
                      :aria-label="t('goal.reminder.addReminder')"
                      :disabled="isSaving || !!goal.archivedAt"
                    >
                      <Plus class="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-96 max-w-[calc(100vw-2rem)]">
                    <GoalReminderMenuItems
                      :model-value="reminderConfigDraft"
                      :start="startDraft"
                      :target="targetDraft"
                      :disabled="isSaving || !!goal.archivedAt"
                      @update:model-value="saveReminderConfig"
                      @request-custom-time="openCustomReminderPicker"
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              v-if="labelIdsDraft.length || showLabelsEditor"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-labels-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.dialog.labels') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <Badge
                  v-for="option in selectedLabelOptions"
                  :key="option.id"
                  variant="outline"
                  class="h-7 max-w-48 gap-1.5 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
                >
                  <span
                    v-if="option.color"
                    class="h-2 w-2 shrink-0 rounded-full border border-[hsl(var(--border-subtle))]"
                    :style="{ backgroundColor: option.color }"
                  />
                  <span class="truncate">{{ option.name }}</span>
                </Badge>

                <Popover v-model:open="labelsPopoverOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 rounded-full text-muted-foreground"
                      :aria-label="t('goal.detail.createOrManageLabels')"
                    >
                      <Plus class="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] p-0">
                    <LabelCommandPanel
                      :model-value="labelIdsDraft"
                      :options="labelOptions"
                      :disabled="labelsLoading || isSaving || !!goal.archivedAt"
                      allow-create
                      :search-placeholder="t('goal.list.searchLabels')"
                      :empty-text="t('goal.list.noLabels')"
                      :create-label="t('goal.dialog.createLabel')"
                      @update:model-value="saveLabelIds"
                      @create="createAndSelectLabel"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div
              v-if="taskCount > 0"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-tasks-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.list.tasks') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <button
                  v-for="task in taskPreviewItems"
                  :key="task.taskPlanId"
                  type="button"
                  class="max-w-56"
                  @click="openTask(task.taskPlanId)"
                >
                  <Badge
                    variant="outline"
                    class="h-7 max-w-full rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal hover:bg-[hsl(var(--hover))]"
                  >
                    <span class="truncate">{{ task.name }}</span>
                  </Badge>
                </button>
                <Badge
                  v-if="taskCount > taskPreviewItems.length"
                  variant="secondary"
                  class="h-7 rounded-full px-2.5 font-normal"
                >
                  +{{ taskCount - taskPreviewItems.length }}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 rounded-full text-muted-foreground"
                  :aria-label="t('goal.detail.addOrCreateTask')"
                  @click="createTaskForGoal()"
                >
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div
              v-if="knowledgeCount > 0"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-knowledge-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.list.knowledge') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <button
                  v-for="note in knowledgePreviewItems"
                  :key="note.relationId"
                  type="button"
                  class="max-w-56"
                  @click="openKnowledge(note.documentId)"
                >
                  <Badge
                    variant="outline"
                    class="h-7 max-w-full rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal hover:bg-[hsl(var(--hover))]"
                  >
                    <span class="truncate">
                      {{ note.state === 'Resolved' ? note.title : note.documentId }}
                    </span>
                  </Badge>
                </button>
                <Badge
                  v-if="knowledgeCount > knowledgePreviewItems.length"
                  variant="secondary"
                  class="h-7 rounded-full px-2.5 font-normal"
                >
                  +{{ knowledgeCount - knowledgePreviewItems.length }}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 rounded-full text-muted-foreground"
                      :aria-label="t('goal.detail.addKnowledge')"
                    >
                      <Plus class="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-72">
                    <GoalKnowledgeMenuItems
                      :goal-id="goalId"
                      :linked-document-ids="linkedKnowledgeDocumentIds"
                      :disabled="isSaving || !!goal.archivedAt"
                      @changed="handleKnowledgeChanged"
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              v-if="reviewCount > 0"
              class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
              data-testid="goal-reviews-row"
            >
              <span class="pt-1.5 text-xs font-medium text-muted-foreground">
                {{ t('goal.list.reviews') }}
              </span>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <button type="button" class="max-w-72" @click="openLatestReview">
                  <Badge
                    variant="outline"
                    class="h-7 max-w-full rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal hover:bg-[hsl(var(--hover))]"
                  >
                    <span class="truncate">{{ latestReviewText }}</span>
                  </Badge>
                </button>
                <Badge
                  v-if="reviewCount > 1"
                  variant="secondary"
                  class="h-7 rounded-full px-2.5 font-normal"
                >
                  +{{ reviewCount - 1 }}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 rounded-full text-muted-foreground"
                  :aria-label="t('goal.detail.addReview')"
                  @click="openReviewCreate"
                >
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <p v-if="mutationError || labelCreateError" role="alert" class="text-sm text-destructive">
            {{ mutationError || labelCreateError }}
          </p>
        </article>

        <section class="space-y-2" data-testid="goal-workspace-description">
          <h2 class="text-sm font-medium text-muted-foreground">
            {{ t('goal.dialog.description') }}
          </h2>
          <ProductAutoTextarea
            v-model="descriptionDraft"
            :max-length="10000"
            :rows="3"
            data-testid="goal-detail-description"
            class="-mx-1 min-h-16 rounded-md px-1 text-sm leading-6 text-foreground/90 transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--selected)/0.72)]"
            :placeholder="t('goal.dialog.descriptionLongPlaceholder')"
            :disabled="isSaving || !!goal.archivedAt"
            @blur="saveDescription"
            @keydown.ctrl.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.meta.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.esc.prevent="resetInlineDrafts"
          />
        </section>

        <section class="space-y-3" data-testid="goal-workspace-key-results">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-baseline gap-2">
              <h2 class="font-semibold">{{ t('goal.detail.keyResults') }}</h2>
              <span class="text-xs text-muted-foreground">{{ keyResults.length }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground" data-testid="goal-overall-progress">
                {{ keyResults.length ? `${Math.round(goal.overallProgress)}%` : '—' }}
              </span>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 gap-1.5 text-muted-foreground"
                data-testid="goal-add-key-result"
                :disabled="isSaving || !!goal.archivedAt"
                @click="openCreateKr"
              >
                <Plus class="h-4 w-4" />
                {{ t('goal.detail.addKR') }}
              </Button>
            </div>
          </div>
          <Progress v-if="keyResults.length" class="h-1" :model-value="goal.overallProgress" />
          <p v-else class="text-xs text-muted-foreground" data-testid="goal-progress-needs-kr">
            {{ t('goal.detail.progressNeedsKr') }}
          </p>

          <div
            v-if="keyResults.length"
            class="divide-y border-y border-[hsl(var(--border-subtle))]"
          >
            <article
              v-for="kr in keyResults"
              :key="kr.id"
              class="px-4 py-3"
              :data-testid="`goal-kr-summary-${kr.id}`"
            >
              <div class="flex items-start justify-between gap-3">
                <GoalKeyResultDirectControls
                  class="flex-1"
                  :key-result="kr"
                  :goal-target="goal.target"
                  :disabled="isSaving || !!goal.archivedAt"
                  :on-save="(patch) => updateKrFields(kr.id, patch)"
                />
                <span class="shrink-0 text-sm font-medium tabular-nums"
                  >{{ Math.round(kr.progressPercentage) }}%</span
                >
              </div>
              <GoalKeyResultTrajectoryPlot
                readonly
                :initial-value="kr.progress.initialValue"
                :current-value="kr.progress.currentValue"
                :target-value="kr.progress.targetValue"
                :unit="kr.progress.unit ?? ''"
                :start-label="
                  goal.start ? formatTarget(goal.start) : t('goal.dialog.krTrajectoryNotSet')
                "
                :current-label="formatProductYmd(getProductTodayYmd())"
                :target-label="formatTarget(kr.target ?? goal.target)"
                :check-in-test-id="`goal-quick-check-in-${kr.id}`"
                :check-in-label="`${t('goal.recordDialog.addTitle')}: ${kr.title}`"
                @check-in="openQuickCheckIn(kr.id)"
              />
              <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
                <Button
                  v-if="linkedTaskCount(kr.id) > 0"
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs text-muted-foreground"
                  @click="openTaskScope(String(kr.id))"
                >
                  {{ t('goal.list.linkedTasks', { count: linkedTaskCount(kr.id) }) }} →
                </Button>
                <span v-else />
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground"
                      :aria-label="t('common.more')"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-48">
                    <DropdownMenuItem @click="createTaskForGoal(String(kr.id))">
                      <ListTodo class="mr-2 h-4 w-4" />
                      {{ t('goal.detail.createBoundTask') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      :data-testid="`goal-kr-detail-${kr.id}`"
                      @click="openKr(kr.id)"
                    >
                      {{ t('goal.route.krDetail') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      :disabled="isSaving || !!goal.archivedAt"
                      @click="removeKr(String(kr.id))"
                    >
                      <Trash2 class="mr-2 h-4 w-4" />
                      {{ t('common.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          </div>
          <div v-else class="rounded-xl border border-dashed p-8 text-center">
            <p class="font-medium">{{ t('goal.detail.noKrTitle') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ t('goal.detail.noKrDescription') }}</p>
            <Button class="mt-4" size="sm" @click="openCreateKr">{{
              t('goal.detail.addKR')
            }}</Button>
          </div>
        </section>

        <section
          v-if="workspace.recentProgress.length"
          class="space-y-3"
          data-testid="goal-workspace-progress"
        >
          <h2 class="font-semibold">{{ t('goal.list.recentProgress') }}</h2>
          <div class="divide-y border-y border-[hsl(var(--border-subtle))]">
            <div v-for="record in workspace.recentProgress" :key="record.id" class="px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">{{ keyResultName(record.keyResultId) }}</p>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted-foreground">{{
                    formatProductDate(record.recordedAt)
                  }}</span>
                  <Button
                    v-if="
                      record.authorship === 'Manual' || record.authorship === 'TaskUserMeasurement'
                    "
                    variant="ghost"
                    size="sm"
                    :data-testid="`correct-goal-record-${record.id}`"
                    @click="openRecordCorrection(record)"
                    >{{ t('goal.recordDialog.editTitle') }}</Button
                  >
                </div>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t(`goal.cards.cardsRecordCard.authorship.${record.authorship}`) }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ record.value >= 0 ? '+' : '' }}{{ record.value }} → {{ record.valueAfter }}
                <span v-if="record.comment"> · {{ record.comment }}</span>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>

    <ProductDateTimePicker
      :open="customReminderPickerOpen"
      :model-value="null"
      :title="t('goal.reminder.customDialogTitle')"
      :description="t('goal.reminder.customDialogDescription')"
      :time-label="t('goal.reminder.customClockTime')"
      :hour-label="t('goal.reminder.hour')"
      :minute-label="t('goal.reminder.minute')"
      :cancel-label="t('common.cancel')"
      :apply-label="t('goal.reminder.setReminder')"
      :return-to-today-label="t('goal.dialog.returnToToday')"
      :invalid-time-text="t('goal.reminder.invalidClockTime')"
      :past-time-text="t('goal.reminder.pastTime')"
      :min-value="customReminderMinValue"
      test-id="goal-custom-reminder-picker"
      @update:open="customReminderPickerOpen = $event"
      @apply="addCustomAbsoluteReminder"
    />

    <GoalKeyResultInspectDialog
      v-if="goal && inspectedKrId"
      :goal="goal"
      :key-result="inspectedKr"
      :task-availability="workspace?.taskContext.availability ?? 'Unavailable'"
      :record-revision="recordRevision"
      @close="closeInspect"
      @check-in="openQuickCheckIn(inspectedKrId)"
      @open-task="openTask"
      @open-task-scope="openTaskScope(inspectedKrId)"
    />
    <GoalRecordDialog ref="recordDialog" @saved="handleRecordSaved" />

    <KeyResultDialog
      ref="krDialog"
      :on-submit="saveKr"
      :goal-start="goal?.start ?? null"
      :goal-target="goal?.target ?? null"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ArrowLeft,
  BellRing,
  CalendarRange,
  History,
  ListTodo,
  MoreHorizontal,
  NotebookText,
  Plus,
  Tag,
  Trash2,
} from '@lucide/vue';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import {
  GoalStatus,
  ReminderTriggerType,
  goalTimeframeEndBoundary,
  goalTimeframeLabel,
  goalTimeframeStartBoundary,
  isPastGoalTarget,
  type AddKeyResultReq,
  type GoalReminderConfigDTO,
  type GoalRecordClientDTO,
  type ReminderTrigger,
  type GoalStatus as GoalStatusValue,
  type GoalTimeframe,
  type UpdateKeyResultReq,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';
import { addYmdDays } from '@memoflow/time';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { ProductAutoTextarea, ProductDateTimePicker } from '../../../shared/components';
import LabelCommandPanel from '../../../shared/components/LabelCommandPanel.vue';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import {
  formatProductDate,
  formatProductDateTime,
  formatProductYmd,
  getProductTime,
  getProductTodayYmd,
} from '../../../shared/utils/product-time';
import GoalKeyResultInspectDialog from '../components/dialogs/GoalKeyResultInspectDialog.vue';
import GoalKeyResultTrajectoryPlot from '../components/GoalKeyResultTrajectoryPlot.vue';
import GoalKeyResultDirectControls from '../components/GoalKeyResultDirectControls.vue';
import KeyResultDialog from '../components/dialogs/KeyResultDialog.vue';
import GoalRecordDialog from '../components/dialogs/GoalRecordDialog.vue';
import { useGoal } from '../composables/useGoal';
import GoalKnowledgeMenuItems from '../components/GoalKnowledgeMenuItems.vue';
import GoalReminderMenuItems from '../components/GoalReminderMenuItems.vue';
import GoalStatusPicker from '../components/GoalStatusPicker.vue';
import GoalTimeframePicker from '../components/GoalTimeframePicker.vue';
import { useGoalWorkspace } from '../composables/useGoalWorkspace';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

type KeyResultInput = Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>;
type LifecycleAction = 'plan' | 'activate' | 'complete' | 'abandon';
type GoalPatch = Omit<UpdateGoalReq, 'expectedVersion'>;

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const goalId = computed(() => String(route.params.id ?? route.params.goalId ?? ''));
const inspectedKrId = computed(() => String(route.params.keyResultId ?? ''));
const inspectedKr = computed(
  () => keyResults.value.find((kr) => String(kr.id) === inspectedKrId.value) ?? null,
);
const recordRevision = ref(0);
function closeInspect(): void {
  void router.push({
    name: 'goal-detail',
    params: { id: goalId.value },
    query: route.query,
    hash: route.hash,
  });
}
async function handleRecordSaved(): Promise<void> {
  recordRevision.value += 1;
  await refresh();
}
const { workspace, isLoading, error, refresh } = useGoalWorkspace(goalId);
const goal = computed(() => workspace.value?.goal ?? null);
const keyResults = computed(() => goal.value?.keyResults ?? []);
const krDialog = ref<InstanceType<typeof KeyResultDialog> | null>(null);
const recordDialog = ref<InstanceType<typeof GoalRecordDialog> | null>(null);
const { getGoalAggregateView } = useGoal();
async function openQuickCheckIn(keyResultId: string): Promise<void> {
  const requestedGoalId = goalId.value;
  const aggregate = await getGoalAggregateView(requestedGoalId);
  if (goalId.value !== requestedGoalId) return;
  if (aggregate) recordDialog.value?.openDialog(requestedGoalId, String(keyResultId));
}
async function openRecordCorrection(record: GoalRecordClientDTO) {
  if (record.authorship !== 'Manual' && record.authorship !== 'TaskUserMeasurement') return;
  const requestedGoalId = goalId.value;
  const aggregate = await getGoalAggregateView(requestedGoalId);
  if (aggregate && goalId.value === requestedGoalId) {
    recordDialog.value?.openDialog(requestedGoalId, String(record.keyResultId), record);
  }
}
const isSaving = ref(false);
const mutationError = ref<string | null>(null);
const labelCreateError = ref<string | null>(null);
const customReminderPickerOpen = ref(false);
const customReminderMinValue = ref(Number(getProductTime().now()));

const nameDraft = ref('');
const summaryDraft = ref('');
const descriptionDraft = ref('');
const startDraft = ref<GoalTimeframe | null>(null);
const targetDraft = ref<GoalTimeframe | null>(null);
const labelIdsDraft = ref<string[]>([]);
const reminderConfigDraft = ref<GoalReminderConfigDTO | null>(null);
const showStartEditor = ref(false);
const showTargetEditor = ref(false);
const showLabelsEditor = ref(false);
const labelsPopoverOpen = ref(false);

const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const pendingReminderTriggers = computed(() => {
  if (!reminderConfigDraft.value?.enabled) return [];
  const now = Number(getProductTime().now());
  return reminderConfigDraft.value.triggers.filter((trigger) => {
    if (!trigger.enabled) return false;
    if (trigger.type === ReminderTriggerType.AbsoluteAt) {
      return trigger.value > now;
    }
    if (trigger.type === ReminderTriggerType.RemainingDays) {
      if (!targetDraft.value) return false;
      const reminderDay = addYmdDays(goalTimeframeEndBoundary(targetDraft.value), -trigger.value);
      if (startDraft.value && reminderDay < goalTimeframeStartBoundary(startDraft.value)) {
        return false;
      }
      const reminderAt = getProductTime().input.combine(reminderDay, '09:00');
      return reminderAt != null && Number(reminderAt) > now;
    }
    return true;
  });
});

const selectedLabelOptions = computed(() => {
  const catalogById = new Map(labelOptions.value.map((option) => [option.id, option] as const));
  const goalLabelsById = new Map(
    (goal.value?.labels ?? []).map((label) => [
      label.id,
      { id: label.id, name: label.name, color: label.color },
    ]),
  );
  return labelIdsDraft.value
    .map((id) => catalogById.get(id) ?? goalLabelsById.get(id))
    .filter(
      (option): option is { id: string; name: string; color?: string | null } => option != null,
    );
});
const taskCount = computed(() =>
  workspace.value?.taskContext.availability === 'Available'
    ? (workspace.value.taskContext.summary?.total ?? 0)
    : 0,
);
const taskPreviewItems = computed(() =>
  workspace.value?.taskContext.availability === 'Available'
    ? workspace.value.taskContext.preview.slice(0, 3)
    : [],
);
const knowledgeCount = computed(() =>
  workspace.value?.knowledgeContext.availability === 'Available'
    ? (workspace.value.knowledgeContext.summary?.total ?? 0)
    : 0,
);
const knowledgePreviewItems = computed(() =>
  workspace.value?.knowledgeContext.availability === 'Available'
    ? workspace.value.knowledgeContext.preview.slice(0, 3)
    : [],
);
const linkedKnowledgeDocumentIds = computed(() =>
  workspace.value?.knowledgeContext.availability === 'Available'
    ? workspace.value.knowledgeContext.preview.map((item) => item.documentId)
    : [],
);
const reviewCount = computed(() => workspace.value?.recentReviews.length ?? 0);
const latestReview = computed(() => workspace.value?.recentReviews[0] ?? null);
const latestReviewText = computed(() => {
  const review = latestReview.value;
  if (!review) return '';
  return review.reflection?.trim() || formatProductDate(review.reviewedAt);
});

const hasMorePropertiesMenuItems = computed(
  () =>
    (!startDraft.value && !showStartEditor.value) ||
    (!targetDraft.value && !showTargetEditor.value) ||
    pendingReminderTriggers.value.length === 0 ||
    (labelIdsDraft.value.length === 0 && !showLabelsEditor.value) ||
    taskCount.value === 0 ||
    knowledgeCount.value === 0 ||
    reviewCount.value === 0,
);

const pastTarget = computed(
  () =>
    !!goal.value &&
    (goal.value.status === GoalStatus.Planned || goal.value.status === GoalStatus.InProgress) &&
    isPastGoalTarget(goal.value.target, getProductTodayYmd()),
);

function cloneReminderConfig(
  value: GoalReminderConfigDTO | null | undefined,
): GoalReminderConfigDTO | null {
  if (!value) return null;
  return {
    enabled: value.enabled,
    triggers: value.triggers.map((trigger) => ({ ...trigger })),
  };
}

function resetInlineDrafts(): void {
  const current = goal.value;
  if (!current) return;
  nameDraft.value = current.name;
  summaryDraft.value = current.summary ?? '';
  descriptionDraft.value = current.description ?? '';
  startDraft.value = current.start ? { ...current.start } : null;
  targetDraft.value = current.target ? { ...current.target } : null;
  labelIdsDraft.value = current.labels.map((label) => label.id);
  reminderConfigDraft.value = cloneReminderConfig(current.reminderConfig);
}

watch(
  () => goal.value?.version,
  () => resetInlineDrafts(),
  { immediate: true },
);

function formatTarget(target: GoalTimeframe | null | undefined): string {
  return target ? goalTimeframeLabel(target, locale.value) : t('goal.dialog.krTrajectoryNotSet');
}

function reminderTriggerKey(trigger: ReminderTrigger): string {
  return `${trigger.type}:${String(trigger.value)}`;
}

function reminderTriggerLabel(trigger: ReminderTrigger): string {
  if (trigger.type === ReminderTriggerType.AbsoluteAt) {
    return formatProductDateTime(trigger.value);
  }
  if (trigger.type === ReminderTriggerType.RemainingDays) {
    return trigger.value === 0
      ? t('goal.reminder.onTargetDay')
      : t('goal.reminder.daysBeforeTarget', { count: trigger.value });
  }
  return t('goal.reminder.progressPercent', { count: trigger.value });
}

async function removeReminderTrigger(trigger: ReminderTrigger): Promise<void> {
  const key = reminderTriggerKey(trigger);
  const remaining = pendingReminderTriggers.value.filter(
    (item) => reminderTriggerKey(item) !== key,
  );
  await saveReminderConfig(
    remaining.length
      ? {
          enabled: true,
          triggers: remaining.map((item) => ({ ...item, enabled: true })),
        }
      : null,
  );
}

function linkedTaskCount(keyResultId: string): number {
  if (workspace.value?.taskContext.availability !== 'Available') return 0;
  return (
    workspace.value.taskContext.summary.byKeyResult.find(
      (item) => item.keyResultId === String(keyResultId),
    )?.total ?? 0
  );
}

function keyResultName(keyResultId: string): string {
  return (
    keyResults.value.find((item) => String(item.id) === String(keyResultId))?.title ??
    t('goal.keyResultFallback')
  );
}

async function updateGoalFields(patch: GoalPatch): Promise<boolean> {
  if (!goal.value || isSaving.value) return false;
  isSaving.value = true;
  mutationError.value = null;
  try {
    const result = await service.updateGoal(goalId.value, {
      expectedVersion: goal.value.version,
      ...patch,
    });
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      resetInlineDrafts();
      return false;
    }
    await refresh();
    return true;
  } finally {
    isSaving.value = false;
  }
}

async function saveName(): Promise<void> {
  if (!goal.value) return;
  const next = nameDraft.value.trim();
  if (!next) {
    nameDraft.value = goal.value.name;
    return;
  }
  if (next === goal.value.name) return;
  nameDraft.value = next;
  await updateGoalFields({ name: next });
}

async function saveSummary(): Promise<void> {
  if (!goal.value) return;
  const next = summaryDraft.value.trim();
  const current = goal.value.summary ?? '';
  if (next === current) return;
  summaryDraft.value = next;
  await updateGoalFields({ summary: next || null });
}

async function saveDescription(): Promise<void> {
  if (!goal.value) return;
  const next = descriptionDraft.value.trim();
  const current = goal.value.description ?? '';
  if (next === current) return;
  descriptionDraft.value = next;
  await updateGoalFields({ description: next || null });
}

function blurKeyboardTarget(event: KeyboardEvent): void {
  (event.currentTarget as HTMLTextAreaElement | null)?.blur();
}

function commitNameFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

function commitSummaryFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

function commitDescriptionFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

async function saveStart(value: GoalTimeframe | null): Promise<void> {
  if (!goal.value) return;
  startDraft.value = value ? { ...value } : null;
  if (JSON.stringify(value) === JSON.stringify(goal.value.start ?? null)) return;
  const saved = await updateGoalFields({ start: value });
  if (saved && !value) showStartEditor.value = false;
}

async function saveTarget(value: GoalTimeframe | null): Promise<void> {
  if (!goal.value) return;
  targetDraft.value = value ? { ...value } : null;
  if (JSON.stringify(value) === JSON.stringify(goal.value.target ?? null)) return;
  const saved = await updateGoalFields({ target: value });
  if (saved && !value) showTargetEditor.value = false;
}

async function saveLabelIds(value: string[]): Promise<void> {
  if (!goal.value) return;
  labelIdsDraft.value = [...value];
  const current = goal.value.labels.map((label) => label.id);
  if (JSON.stringify(value) === JSON.stringify(current)) return;
  const saved = await updateGoalFields({ labelIds: value });
  if (saved && value.length === 0) showLabelsEditor.value = false;
}

async function toggleLabelSelection(labelId: string): Promise<void> {
  const next = labelIdsDraft.value.includes(labelId)
    ? labelIdsDraft.value.filter((id) => id !== labelId)
    : [...labelIdsDraft.value, labelId];
  await saveLabelIds(next);
}

async function openLabelsEditor(): Promise<void> {
  showLabelsEditor.value = true;
  await nextTick();
  labelsPopoverOpen.value = true;
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    if (labelIdsDraft.value.includes(label.id)) return;
    await saveLabelIds([...labelIdsDraft.value, label.id]);
  } catch {
    labelCreateError.value = t('common.operationFailed');
  }
}

async function saveReminderConfig(value: GoalReminderConfigDTO | null): Promise<void> {
  if (!goal.value) return;
  reminderConfigDraft.value = cloneReminderConfig(value);
  if (JSON.stringify(value) === JSON.stringify(goal.value.reminderConfig ?? null)) return;
  await updateGoalFields({ reminderConfig: value });
}

function openCustomReminderPicker(): void {
  customReminderMinValue.value = Number(getProductTime().now());
  customReminderPickerOpen.value = true;
}

async function addCustomAbsoluteReminder(value: number): Promise<void> {
  const now = Number(getProductTime().now());
  const rounded = Math.floor(value / 60_000) * 60_000;
  if (!Number.isFinite(rounded) || rounded <= now) return;

  const existing = pendingReminderTriggers.value;
  if (
    existing.some(
      (trigger) => trigger.type === ReminderTriggerType.AbsoluteAt && trigger.value === rounded,
    )
  ) {
    return;
  }
  if (existing.length >= 10) return;

  await saveReminderConfig({
    enabled: true,
    triggers: [
      ...existing.map((trigger) => ({ ...trigger, enabled: true })),
      { type: ReminderTriggerType.AbsoluteAt, value: rounded, enabled: true },
    ],
  });
}

async function runLifecycle(action: LifecycleAction): Promise<void> {
  if (!goal.value || isSaving.value) return;
  isSaving.value = true;
  mutationError.value = null;
  try {
    const expectedVersion = goal.value.version;
    const result =
      action === 'plan'
        ? await service.planGoal(goalId.value, expectedVersion)
        : action === 'activate'
          ? await service.activateGoal(goalId.value, expectedVersion)
          : action === 'complete'
            ? await service.completeGoal(goalId.value, expectedVersion)
            : await service.abandonGoal(goalId.value, expectedVersion);
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      return;
    }
    await refresh();
  } finally {
    isSaving.value = false;
  }
}

async function confirmAbandon(): Promise<void> {
  if (!goal.value) return;
  const confirmed = await useConfirm({
    title: t('goal.detail.abandonGoal'),
    description: goal.value.name,
    confirmText: t('goal.detail.abandonGoal'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (confirmed) await runLifecycle('abandon');
}

async function changeStatus(next: GoalStatusValue): Promise<void> {
  if (!goal.value || next === goal.value.status) return;
  if (next === GoalStatus.Abandoned) {
    await confirmAbandon();
    return;
  }
  if (next === GoalStatus.Planned) {
    await runLifecycle('plan');
    return;
  }
  if (next === GoalStatus.InProgress) {
    await runLifecycle('activate');
    return;
  }
  if (next === GoalStatus.Completed) {
    await runLifecycle('complete');
  }
}

function openCreateKr(): void {
  krDialog.value?.openForCreateKeyResult(goalId.value);
}

function openKr(keyResultId: string): void {
  void router.push({
    name: 'key-result-detail',
    params: { goalId: goalId.value, keyResultId },
    query: route.query,
    hash: route.hash,
  });
}

async function updateKrFields(
  keyResultId: string,
  patch: Pick<
    UpdateKeyResultReq,
    'title' | 'description' | 'calculationMethod' | 'weight' | 'target'
  >,
): Promise<boolean> {
  if (!goal.value || isSaving.value || goal.value.archivedAt) return false;
  const requestedGoalId = goalId.value;
  isSaving.value = true;
  mutationError.value = null;
  try {
    const result = await service.updateKeyResult(requestedGoalId, keyResultId, {
      ...patch,
      expectedVersion: goal.value.version,
    });
    if (goalId.value !== requestedGoalId) return false;
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      return false;
    }
    if (workspace.value) workspace.value.goal = result.data.readModel;
    return true;
  } catch (error) {
    if (goalId.value === requestedGoalId) {
      mutationError.value = error instanceof Error ? error.message : t('common.operationFailed');
    }
    return false;
  } finally {
    isSaving.value = false;
  }
}

async function saveKr(payload: {
  goalId: string;
  keyResult: KeyResultInput;
  isEditing: boolean;
  keyResultId?: string;
}): Promise<boolean> {
  if (!goal.value || isSaving.value) return false;
  isSaving.value = true;
  try {
    mutationError.value = null;
    const request = { ...payload.keyResult, expectedVersion: goal.value.version };
    const result =
      payload.isEditing && payload.keyResultId
        ? await service.updateKeyResult(payload.goalId, payload.keyResultId, request)
        : await service.createKeyResult(payload.goalId, request);
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      return false;
    }
    await refresh();
    return true;
  } finally {
    isSaving.value = false;
  }
}

async function removeKr(keyResultId: string): Promise<void> {
  if (!goal.value) return;
  const confirmed = await useConfirm({
    title: t('common.delete'),
    description: t('goal.detail.noKrDescription'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed || !goal.value || isSaving.value) return;
  isSaving.value = true;
  try {
    const result = await service.deleteKeyResult(goalId.value, keyResultId, {
      expectedVersion: goal.value.version,
    });
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      return;
    }
    await refresh();
  } finally {
    isSaving.value = false;
  }
}

function createTaskForGoal(keyResultId?: string): void {
  void router.push({
    name: 'task-list',
    query: {
      create: '1',
      createGoalId: goalId.value,
      ...(keyResultId ? { createKeyResultId: keyResultId } : {}),
    },
  });
}

function openTaskScope(keyResultId?: string): void {
  void router.push({
    name: 'task-list',
    query: {
      goalId: goalId.value,
      ...(keyResultId ? { keyResultId } : {}),
    },
  });
}

function openTask(taskPlanId: string): void {
  void router.push({ name: 'task-detail', params: { id: taskPlanId } });
}

async function handleKnowledgeChanged(): Promise<void> {
  await refresh();
}

function openKnowledge(documentId?: string): void {
  void router.push({
    path: '/repository',
    query: {
      ...(documentId ? { note: documentId } : {}),
      goalId: goalId.value,
    },
  });
}

function openReviewCreate(): void {
  if (!goal.value) return;
  void router.push({ name: 'goal-review-create', params: { goalId: goal.value.id } });
}

function openLatestReview(): void {
  const review = latestReview.value;
  if (!review) {
    openReviewCreate();
    return;
  }
  void router.push({
    name: 'goal-review-detail',
    params: { goalId: goalId.value, reviewId: review.id },
  });
}
</script>
