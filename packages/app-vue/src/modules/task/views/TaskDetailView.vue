<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="task-plan-workspace"
  >
    <ModuleHeader data-testid="task-detail-toolbar">
      <template #leading>
        <Button
          variant="ghost"
          size="sm"
          :aria-label="t('common.back')"
          @click="router.push({ name: 'task-list' })"
        >
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
      </template>
      <template #actions>
        <DropdownMenu v-if="viewModel">
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-full text-muted-foreground"
              :aria-label="t('task.management.moreActions')"
              data-testid="task-detail-more-actions"
            >
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem v-if="viewModel.isActive" @click="pause">
              <Pause class="mr-2 h-4 w-4 text-muted-foreground" />
              {{ t('task.action.pause') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-else-if="!viewModel.isArchived && viewModel.isPaused"
              @click="activate"
            >
              <Play class="mr-2 h-4 w-4 text-muted-foreground" />
              {{ t('task.action.activate') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="!viewModel.isArchived && (viewModel.isActive || viewModel.isPaused)"
              @click="abandon"
            >
              <CircleStop class="mr-2 h-4 w-4 text-muted-foreground" />
              {{ t('task.action.abandon') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="text-destructive focus:text-destructive" @click="remove">
              <Trash2 class="mr-2 h-4 w-4" />
              {{ t('common.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </ModuleHeader>

    <main
      class="min-h-0 flex-1 overflow-y-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
      data-scroll-host="task-detail"
      data-testid="task-detail-scroll-host"
    >
      <div
        v-if="isLoading"
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
        data-testid="task-detail-loading"
      >
        <Loader2 class="mr-2 h-5 w-5 animate-spin" />
        {{ t('task.detail.loading') }}
      </div>

      <div
        v-else-if="loadError"
        class="mx-auto flex min-h-72 max-w-4xl flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center"
        data-testid="task-detail-error"
      >
        <CircleAlert class="mb-3 h-7 w-7 text-destructive" />
        <h2 class="font-semibold">{{ t('task.error.loadFailedTitle') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('task.error.loadFailedDescription') }}
        </p>
        <Button class="mt-4" size="sm" variant="outline" @click="reloadDetail">
          <RefreshCw class="mr-2 h-4 w-4" />
          {{ t('task.action.retry') }}
        </Button>
      </div>

      <div
        v-else-if="viewModel && currentTemplate"
        class="mx-auto flex w-full max-w-5xl flex-col gap-5"
      >
        <article
          class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"
          data-testid="task-plan-overview"
        >
          <ProductEntityIdentity data-testid="task-detail-identity">
            <ProductAutoTextarea
              v-model="titleDraft"
              :max-length="120"
              :rows="1"
              data-testid="task-detail-title"
              class="-mx-1 min-h-9 rounded-md px-1 text-2xl font-semibold leading-tight tracking-tight transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--selected)/0.72)]"
              :placeholder="t('task.basicInfo.titlePlaceholder')"
              :disabled="isSaving || !!viewModel.isArchived"
              @blur="saveTitle"
              @keydown.enter.exact.prevent="commitTitleFromKeyboard"
              @keydown.esc.prevent="resetInlineDrafts"
            />
          </ProductEntityIdentity>

          <div class="space-y-0.5" data-testid="task-detail-metadata">
            <ProductMetadataRow
              :label="t('task.detail.properties')"
              data-testid="task-properties-row"
            >
              <div
                class="flex min-w-0 flex-wrap items-center gap-2"
                data-testid="task-plan-workspace-properties"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <ProductPropertyChip :disabled="isSaving || !!viewModel.isArchived">
                      <template #icon>
                        <CircleDot class="h-3.5 w-3.5" />
                      </template>
                      {{ viewModel.stateText ?? viewModel.statusText }}
                    </ProductPropertyChip>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-44">
                    <DropdownMenuItem v-if="viewModel.isActive" @click="pause">
                      <Pause class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.action.pause') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-else-if="viewModel.isPaused && !viewModel.isArchived"
                      @click="activate"
                    >
                      <Play class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.action.activate') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="!viewModel.isArchived && (viewModel.isActive || viewModel.isPaused)"
                      @click="abandon"
                    >
                      <CircleStop class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.action.abandon') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Popover
                  :open="activeProperty === 'schedule'"
                  @update:open="setPropertyOpen('schedule', $event)"
                >
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      data-testid="task-detail-schedule-chip"
                      :active="activeProperty === 'schedule'"
                      :disabled="isSaving || !!viewModel.isArchived"
                    >
                      <template #icon><CalendarClock class="h-3.5 w-3.5" /></template>
                      {{ scheduleChipLabel }}
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    class="max-h-[70vh] w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-3"
                  >
                    <TimeConfigSection
                      :model-value="viewModel"
                      is-edit-mode
                      @update:model-value="saveInlinePlan"
                    />
                  </PopoverContent>
                </Popover>

                <Popover
                  :open="activeProperty === 'recurrence'"
                  @update:open="setPropertyOpen('recurrence', $event)"
                >
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      data-testid="task-detail-recurrence-chip"
                      :active="activeProperty === 'recurrence'"
                      :disabled="isSaving || !!viewModel.isArchived"
                    >
                      <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
                      {{ viewModel.recurrenceText }}
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    class="max-h-[70vh] w-[460px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-3"
                  >
                    <RecurrenceSection
                      :model-value="viewModel"
                      @update:model-value="saveInlinePlan"
                    />
                  </PopoverContent>
                </Popover>

                <Popover
                  :open="activeProperty === 'importance'"
                  @update:open="setPropertyOpen('importance', $event)"
                >
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      data-testid="task-detail-importance-chip"
                      :active="activeProperty === 'importance'"
                      :disabled="isSaving || !!viewModel.isArchived"
                    >
                      <template #icon><Flag class="h-3.5 w-3.5" /></template>
                      {{ viewModel.importanceText }}
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent align="start" class="w-60 p-1.5">
                    <Button
                      v-for="option in importanceOptions"
                      :key="option.value"
                      type="button"
                      variant="ghost"
                      class="h-9 w-full justify-start gap-2 rounded-md px-2 font-normal"
                      :class="
                        viewModel.importance === option.value
                          ? 'bg-accent text-accent-foreground'
                          : ''
                      "
                      @click="saveImportance(option.value)"
                    >
                      <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span class="min-w-0 flex-1 text-left">{{ option.title }}</span>
                      <Check
                        class="h-4 w-4 shrink-0"
                        :class="viewModel.importance === option.value ? 'opacity-100' : 'opacity-0'"
                      />
                    </Button>
                  </PopoverContent>
                </Popover>

                <ProductMoreProperties
                  v-if="hasMorePropertiesMenuItems"
                  :label="t('task.detail.moreProperties')"
                  test-id="task-properties-more"
                >
                  <DropdownMenuSub v-if="!viewModel.goalBinding && !showGoalEditor">
                    <DropdownMenuSubTrigger>
                      <Target class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.detail.linkedGoal') }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-72">
                      <DropdownMenuItem
                        v-for="option in goalOptions"
                        :key="option.id"
                        @click="quickBindGoal(option.id)"
                      >
                        <Flag class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div class="min-w-0 flex-1">
                          <div class="truncate">{{ option.title }}</div>
                          <div
                            v-if="option.description"
                            class="truncate text-xs text-muted-foreground"
                          >
                            {{ option.description }}
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="loadingGoals" disabled>
                        {{ t('task.krLinks.loadingGoals') }}
                      </DropdownMenuItem>
                      <DropdownMenuItem v-else-if="goalOptions.length === 0" disabled>
                        {{ t('task.krLinks.noGoals') }}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="openGoalEditor">
                        <Pencil class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('task.detail.advancedGoalBinding') }}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub v-if="labelIds.length === 0 && !showLabelsEditor">
                    <DropdownMenuSubTrigger>
                      <Tag class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.metadata.labels') }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-60">
                      <DropdownMenuCheckboxItem
                        v-for="option in labelOptions"
                        :key="option.id"
                        :model-value="labelIds.includes(option.id)"
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
                        {{ t('task.metadata.noLabels') }}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="openLabelsEditor">
                        <Plus class="mr-2 h-4 w-4 text-muted-foreground" />
                        {{ t('task.detail.createOrManageLabels') }}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub v-if="reminderTriggers.length === 0 && !showReminderEditor">
                    <DropdownMenuSubTrigger>
                      <Bell class="mr-2 h-4 w-4 text-muted-foreground" />
                      {{ t('task.detail.reminders') }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-96 max-w-[calc(100vw-2rem)]">
                      <TaskReminderMenuItems
                        :model-value="taskReminderConfig"
                        :disabled="isSaving || !!viewModel.isArchived"
                        @update:model-value="saveReminderConfig"
                        @request-custom-time="openCustomReminderPicker"
                        @request-advanced="openReminderEditor"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </ProductMoreProperties>
              </div>
            </ProductMetadataRow>

            <ProductMetadataRow
              v-if="viewModel.goalBinding || showGoalEditor"
              :label="t('task.detail.linkedGoal')"
              data-testid="task-goal-row"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <ProductPropertyChip
                  v-if="goalContextAvailable"
                  data-testid="task-goal-owner-navigation"
                  :aria-label="t('task.detail.openLinkedGoal', { name: goalContextText })"
                  @click="openGoalContext"
                >
                  <template #icon><ArrowUpRight class="h-3.5 w-3.5" /></template>
                  {{ goalContextText }}
                </ProductPropertyChip>
                <Badge
                  v-else-if="viewModel.goalBinding"
                  variant="secondary"
                  class="h-7 max-w-64 rounded-full px-2.5 font-normal"
                >
                  <span class="truncate">{{ goalContextText }}</span>
                </Badge>
                <Badge
                  v-if="goalContextKeyResultName"
                  variant="outline"
                  class="h-7 max-w-64 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
                >
                  <span class="truncate">{{ goalContextKeyResultName }}</span>
                </Badge>

                <Popover
                  :open="activeProperty === 'goal'"
                  @update:open="setPropertyOpen('goal', $event)"
                >
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      :active="activeProperty === 'goal'"
                      :disabled="isSaving || !!viewModel.isArchived"
                      data-testid="task-detail-goal-chip"
                    >
                      <template #icon><Target class="h-3.5 w-3.5" /></template>
                      {{ t('task.detail.editGoalBinding') }}
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    class="max-h-[70vh] w-[500px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-3"
                  >
                    <KeyResultLinksSection
                      :model-value="viewModel"
                      :goals="goalOptions"
                      :key-results-by-goal="keyResultsByGoal"
                      :loading-goals="loadingGoals"
                      :loading-key-results="loadingKeyResults"
                      :key-result-errors-by-goal="keyResultErrorsByGoal"
                      :on-request-key-results="requestKeyResults"
                      @update:model-value="saveInlinePlan"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </ProductMetadataRow>

            <ProductMetadataRow
              v-if="labelIds.length || showLabelsEditor"
              :label="t('task.metadata.labels')"
              data-testid="task-labels-row"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <Popover :open="labelsPopoverOpen" @update:open="handleLabelsPopoverOpen">
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      data-testid="task-detail-labels-chip"
                      :active="labelsPopoverOpen"
                      :disabled="labelsLoading || isSaving || !!viewModel.isArchived"
                    >
                      <template #icon><Tag class="h-3.5 w-3.5" /></template>
                      <template v-if="viewModel.labels?.length">
                        <span v-for="(label, index) in viewModel.labels" :key="label.id">
                          <span
                            v-if="label.color"
                            class="mr-1.5 inline-block h-2 w-2 rounded-full border border-[hsl(var(--border-subtle))]"
                            :style="{ backgroundColor: label.color }"
                            aria-hidden="true"
                          />
                          {{ label.name }}{{ index < viewModel.labels.length - 1 ? ', ' : '' }}
                        </span>
                      </template>
                      <template v-else>{{ t('task.metadata.labels') }}</template>
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    class="w-80 max-w-[calc(100vw-2rem)] p-0"
                    @keydown.esc.capture.stop.prevent="handleLabelsPopoverOpen(false)"
                  >
                    <LabelCommandPanel
                      :model-value="labelIds"
                      :options="labelOptions"
                      :disabled="labelsLoading || isSaving || !!viewModel.isArchived"
                      allow-create
                      :search-placeholder="t('task.metadata.searchLabels')"
                      :empty-text="t('task.metadata.noLabels')"
                      :create-label="t('task.metadata.createLabel')"
                      @update:model-value="saveLabelIds"
                      @create="createAndSelectLabel"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </ProductMetadataRow>

            <ProductMetadataRow
              v-if="reminderTriggers.length || showReminderEditor"
              :label="t('task.detail.reminders')"
              data-testid="task-reminders-row"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <Popover
                  :open="activeProperty === 'reminder'"
                  @update:open="setPropertyOpen('reminder', $event)"
                >
                  <PopoverTrigger as-child>
                    <ProductPropertyChip
                      :active="activeProperty === 'reminder'"
                      :disabled="isSaving || !!viewModel.isArchived"
                      data-testid="task-detail-reminder-chip"
                    >
                      <template #icon><Bell class="h-3.5 w-3.5" /></template>
                      {{
                        reminderTriggers.map(reminderTriggerLabel).join(', ') ||
                        t('task.detail.reminders')
                      }}
                    </ProductPropertyChip>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    class="max-h-[70vh] w-[560px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-3"
                  >
                    <ReminderSection
                      :model-value="viewModel"
                      @update:model-value="saveInlinePlan"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </ProductMetadataRow>
          </div>

          <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
            {{ labelCreateError }}
          </p>
        </article>

        <section class="space-y-2" data-testid="task-detail-description-section">
          <h2 class="text-sm font-medium text-muted-foreground">
            {{ t('task.detail.description') }}
          </h2>
          <ProductAutoTextarea
            v-model="descriptionDraft"
            :max-length="2000"
            :rows="4"
            data-testid="task-detail-description"
            class="-mx-1 min-h-20 rounded-md px-1 text-sm leading-6 text-foreground/90 transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--selected)/0.72)]"
            :placeholder="t('task.basicInfo.descPlaceholder')"
            :disabled="isSaving || !!viewModel.isArchived"
            @blur="saveDescription"
            @keydown.ctrl.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.meta.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.esc.prevent="resetInlineDrafts"
          />
        </section>

        <ChecklistSection
          :model-value="viewModel"
          :disabled="isSaving || !!viewModel.isArchived"
          @update:model-value="saveInlinePlan"
        />

        <section
          class="border-y border-[hsl(var(--border-subtle))] py-3"
          data-testid="task-detail-execution-summary"
        >
          <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3">
            <span class="pt-1.5 text-xs font-medium text-muted-foreground">
              {{ t('task.detail.executionStats') }}
            </span>
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                class="h-7 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
              >
                {{ t('task.detail.totalInstances') }} {{ executionSummary.total }}
              </Badge>
              <Badge
                variant="outline"
                class="h-7 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
              >
                {{ t('task.detail.completed') }} {{ executionSummary.completed }}
              </Badge>
              <Badge variant="secondary" class="h-7 rounded-full px-2.5 font-normal">
                {{ t('task.detail.completionRate') }} {{ executionSummary.completionRate }}%
              </Badge>
              <Badge
                variant="outline"
                class="h-7 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
              >
                {{
                  t('task.detail.openCount', {
                    count: executionSummary.pending + executionSummary.inProgress,
                  })
                }}
              </Badge>
              <Badge
                v-if="executionSummary.missed"
                variant="outline"
                class="h-7 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
              >
                {{ t('task.detail.instanceStatusMissed') }} {{ executionSummary.missed }}
              </Badge>
              <Badge
                v-if="executionSummary.skipped"
                variant="outline"
                class="h-7 rounded-full border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.46)] px-2.5 font-normal"
              >
                {{ t('task.detail.instanceStatusSkipped') }} {{ executionSummary.skipped }}
              </Badge>
            </div>
          </div>
        </section>

        <section data-testid="task-detail-linked-notes">
          <h2 class="font-semibold">{{ t('task.detail.linkedNotes') }}</h2>
          <div
            v-if="linkedNotes.length"
            class="mt-3 divide-y border-y border-[hsl(var(--border-subtle))]"
          >
            <div v-for="note in linkedNotes" :key="note.relationId" class="py-3 text-sm">
              <template v-if="note.state === 'Resolved'">
                <div class="font-medium">{{ note.title }}</div>
                <div class="text-muted-foreground">{{ note.relativePath }}</div>
                <p class="mt-1 text-muted-foreground">{{ note.excerpt }}</p>
              </template>
              <span v-else class="text-muted-foreground">{{
                t('task.detail.linkedNoteMissing')
              }}</span>
            </div>
          </div>
          <p v-else class="mt-2 text-sm text-muted-foreground">
            {{ t('task.detail.noLinkedNotes') }}
          </p>
        </section>

        <section
          aria-labelledby="task-occurrence-history-heading"
          data-testid="task-detail-occurrences"
        >
          <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="task-occurrence-history-heading" class="font-semibold">
                {{ t('task.detail.occurrences') }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ t('task.detail.occurrencesDescription') }}
              </p>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{{
                t('task.detail.completedCount', { count: executionSummary.completed })
              }}</span>
              <span aria-hidden="true">·</span>
              <span>{{
                t('task.detail.openCount', {
                  count: executionSummary.pending + executionSummary.inProgress,
                })
              }}</span>
            </div>
          </div>

          <div
            v-if="templateOccurrences.length"
            class="border-y border-[hsl(var(--border-subtle))]"
          >
            <TaskOccurrenceRow
              v-for="occurrence in sortedOccurrences"
              :key="occurrence.id"
              :occurrence="occurrence"
              :template="currentTemplate"
              :busy="busyOccurrenceId === String(occurrence.id)"
              @open-plan="noop"
              @complete="completeOccurrence"
              @uncomplete="uncompleteOccurrence"
              @missed="markOccurrenceMissed"
              @skip="skipOccurrence"
              @checklist-change="setOccurrenceChecklistItem"
            />
          </div>
          <div
            v-else
            class="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground"
            data-testid="task-detail-occurrences-empty"
          >
            {{ t('task.detail.noOccurrences') }}
          </div>
        </section>
      </div>

      <div
        v-else
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
        data-testid="task-detail-not-found"
      >
        {{ t('task.detail.notFound') }}
      </div>
    </main>

    <ProductDateTimePicker
      :open="customReminderPickerOpen"
      :model-value="null"
      :title="t('task.reminderMenu.customDialogTitle')"
      :description="t('task.reminderMenu.customDialogDescription')"
      :time-label="t('task.reminderMenu.customClockTime')"
      :hour-label="t('task.reminderMenu.hour')"
      :minute-label="t('task.reminderMenu.minute')"
      :cancel-label="t('common.cancel')"
      :apply-label="t('task.reminderMenu.setReminder')"
      :return-to-today-label="t('task.reminderMenu.returnToToday')"
      :invalid-time-text="t('task.reminderMenu.invalidClockTime')"
      :past-time-text="t('task.reminderMenu.pastTime')"
      :min-value="customReminderMinValue"
      test-id="task-custom-reminder-picker"
      @update:open="customReminderPickerOpen = $event"
      @apply="addCustomAbsoluteReminder"
    />
    <TaskCompletionMeasurementDialog :coordinator="actionCoordinator" />
  </section>
</template>

<script setup lang="ts">
import { TaskGoalProgressConfigurationSchema } from '@memoflow/contracts/task';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  CircleStop,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  ArrowUp,
  Bell,
  CalendarClock,
  Check,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  CircleDot,
  Flag,
  Loader2,
  Minus,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Tag,
  Target,
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
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  ReminderTimeUnit,
  TaskReminderType,
  type TaskReminderConfigDTO,
  type UpdateTaskPlanReq,
} from '@memoflow/contracts/task';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import {
  ProductAutoTextarea,
  ProductDateTimePicker,
  ProductEntityIdentity,
  ProductMetadataRow,
  ProductMoreProperties,
  ProductPropertyChip,
} from '../../../shared/components';
import LabelCommandPanel from '../../../shared/components/LabelCommandPanel.vue';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { getProductTime } from '../../../shared/utils/product-time';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskReminderMenuItems from '../components/TaskReminderMenuItems.vue';
import ChecklistSection from '../components/TaskPlanForm/sections/ChecklistSection.vue';
import KeyResultLinksSection from '../components/TaskPlanForm/sections/KeyResultLinksSection.vue';
import RecurrenceSection from '../components/TaskPlanForm/sections/RecurrenceSection.vue';
import ReminderSection from '../components/TaskPlanForm/sections/ReminderSection.vue';
import TimeConfigSection from '../components/TaskPlanForm/sections/TimeConfigSection.vue';
import type { TaskPlanViewModel } from '../components/types';
import { useTaskGoalBindingOptions } from '../composables/useTaskGoalBindingOptions';
import { useTaskOccurrences } from '../composables/useTaskOccurrences';
import TaskCompletionMeasurementDialog from '../components/dialogs/TaskCompletionMeasurementDialog.vue';
import { useTaskOccurrenceActionCoordinator } from '../composables/useTaskOccurrenceActionCoordinator';
import { useTaskPlanWorkspaceQuery } from '../composables/useTaskPlanWorkspaceQuery';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import {
  formatTaskReminderAbsoluteTime,
  getTaskPlanScheduleDate,
  getTaskPlanScheduleTimeDisplay,
  mapTaskPlanDtoToViewModel,
  toTaskPlanSchedulePayload,
} from '../utils/task-plan-presentation';
import { sortTaskOccurrences } from '../utils/task-occurrence-presentation';

type PropertyEditor = 'schedule' | 'recurrence' | 'goal' | 'reminder' | 'importance';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const id = computed(() => String(route.params.id ?? ''));
const activeProperty = ref<PropertyEditor | null>(null);
const titleDraft = ref('');
const descriptionDraft = ref('');
const labelCreateError = ref<string | null>(null);
const labelsPopoverOpen = ref(false);
const showGoalEditor = ref(false);
const showLabelsEditor = ref(false);
const showReminderEditor = ref(false);
const customReminderPickerOpen = ref(false);
const customReminderMinValue = ref(Number(getProductTime().now()));

const {
  workspace,
  query: workspaceQuery,
  refetch: refetchWorkspace,
} = useTaskPlanWorkspaceQuery(id);
const {
  updatePlanSafe,
  activatePlanSafe,
  pausePlanSafe,
  abandonPlanSafe,
  deletePlanSafe,
  isSaving,
} = useTaskPlanMutations();
const occurrenceOperations = useTaskOccurrences();
const actionCoordinator = useTaskOccurrenceActionCoordinator({
  operations: occurrenceOperations,
  resolveGoalBinding: () => currentTemplate.value?.goalBinding,
  afterSuccess: () => refetchWorkspace(),
});
const {
  busyOccurrenceId,
  requestComplete: completeOccurrence,
  requestUncomplete: uncompleteOccurrence,
  requestMissed: markOccurrenceMissed,
  requestSkip: skipOccurrence,
  requestChecklistChange: setOccurrenceChecklistItem,
} = actionCoordinator;
const {
  goals: goalOptions,
  keyResultsByGoal,
  loadingGoals,
  loadingKeyResults,
  keyResultErrorsByGoal,
  loadGoals,
  loadGoalBinding,
  loadKeyResults,
} = useTaskGoalBindingOptions();
const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const currentTemplate = computed(() => workspace.value?.plan ?? null);
const viewModel = computed(() =>
  currentTemplate.value ? mapTaskPlanDtoToViewModel(currentTemplate.value, t) : null,
);
const isLoading = computed(() => workspaceQuery.isPending.value);
const loadError = computed(() => workspaceQuery.isError.value);
const templateOccurrences = computed(() => workspace.value?.recentOccurrences ?? []);
const sortedOccurrences = computed(() =>
  sortTaskOccurrences(templateOccurrences.value, 'time', () => viewModel.value?.title ?? ''),
);
const executionSummary = computed(
  () =>
    workspace.value?.occurrenceSummary ?? {
      total: 0,
      completed: 0,
      missed: 0,
      skipped: 0,
      pending: 0,
      inProgress: 0,
      completionRate: 0,
    },
);
const linkedNotes = computed(() => workspace.value?.linkedNotes ?? []);
const goalContextText = computed(() => {
  const context = workspace.value?.goalContext;
  if (!context) return t('task.detail.goalBindingNone');
  if (context.availability === 'Available') return context.goal.name;
  return t(`task.detail.goalContext${context.availability}`);
});
const goalContextAvailable = computed(
  () => workspace.value?.goalContext?.availability === 'Available',
);
const goalContextKeyResultName = computed(() => {
  const context = workspace.value?.goalContext;
  return context?.availability === 'Available' && context.keyResult
    ? context.keyResult.title
    : null;
});
const scheduleChipLabel = computed(() => {
  const schedule = viewModel.value?.schedule;
  if (!schedule) return t('task.timeConfig.title');
  return `${getTaskPlanScheduleDate(schedule)} · ${getTaskPlanScheduleTimeDisplay(t, schedule)}`;
});
const taskReminderConfig = computed(() => {
  const config = viewModel.value?.reminderConfig as unknown as
    TaskReminderConfigDTO | null | undefined;
  return config ?? null;
});
const reminderTriggers = computed(() =>
  taskReminderConfig.value?.enabled ? taskReminderConfig.value.triggers : [],
);
const labelIds = computed(
  () => viewModel.value?.labelIds ?? viewModel.value?.labels?.map((label) => label.id) ?? [],
);
const hasMorePropertiesMenuItems = computed(
  () =>
    (!!viewModel.value && !viewModel.value.goalBinding && !showGoalEditor.value) ||
    (labelIds.value.length === 0 && !showLabelsEditor.value) ||
    (reminderTriggers.value.length === 0 && !showReminderEditor.value),
);
const importanceOptions = computed(() => [
  { title: t('task.metadata.importanceCritical'), value: ImportanceLevel.Vital, icon: ChevronsUp },
  { title: t('task.metadata.importanceHigh'), value: ImportanceLevel.Important, icon: ArrowUp },
  { title: t('task.metadata.importanceMedium'), value: ImportanceLevel.Moderate, icon: Minus },
  { title: t('task.metadata.importanceLow'), value: ImportanceLevel.Minor, icon: ArrowDown },
  {
    title: t('task.metadata.importanceMinimal'),
    value: ImportanceLevel.Trivial,
    icon: ChevronsDown,
  },
]);

watch(
  viewModel,
  (value) => {
    if (!value) return;
    titleDraft.value = value.title;
    descriptionDraft.value = value.description ?? '';
    if (value.goalBinding?.goalId) void loadGoalBinding(value.goalBinding.goalId);
  },
  { immediate: true },
);
watch(
  () => id.value,
  () => {
    void loadGoals();
  },
  { immediate: true },
);

function setPropertyOpen(property: PropertyEditor, open: boolean): void {
  if (open) {
    activeProperty.value = property;
    return;
  }
  if (activeProperty.value === property) activeProperty.value = null;
  if (property === 'goal' && !viewModel.value?.goalBinding) showGoalEditor.value = false;
  if (property === 'reminder' && reminderTriggers.value.length === 0) {
    showReminderEditor.value = false;
  }
}

function openGoalEditor(): void {
  showGoalEditor.value = true;
  activeProperty.value = 'goal';
}

async function quickBindGoal(goalId: string): Promise<void> {
  const saved = await updatePlanSafe(id.value, {
    goalBinding: {
      goalId: goalId as GoalId,
      keyResultId: null,
      progressRule: null,
    },
  });
  if (saved) {
    showGoalEditor.value = false;
    activeProperty.value = null;
    await refetchWorkspace();
  }
}

function openLabelsEditor(): void {
  showLabelsEditor.value = true;
  labelsPopoverOpen.value = true;
}

function handleLabelsPopoverOpen(open: boolean): void {
  labelsPopoverOpen.value = open;
  if (!open && labelIds.value.length === 0) showLabelsEditor.value = false;
}

function openReminderEditor(): void {
  showReminderEditor.value = true;
  activeProperty.value = 'reminder';
}

function openCustomReminderPicker(): void {
  customReminderMinValue.value = Number(getProductTime().now());
  customReminderPickerOpen.value = true;
}

function openGoalContext(): void {
  const context = workspace.value?.goalContext;
  if (context?.availability !== 'Available') return;
  void router.push({ name: 'goal-detail', params: { id: String(context.goalId) } });
}

function reminderUnitLabel(unit: ReminderTimeUnit | null): string {
  if (unit === ReminderTimeUnit.Hours) return t('task.reminderSection.hours');
  if (unit === ReminderTimeUnit.Days) return t('task.reminderSection.days');
  return t('task.reminderSection.minutes');
}

function reminderTriggerLabel(trigger: TaskReminderConfigDTO['triggers'][number]): string {
  if (trigger.type === TaskReminderType.Absolute && trigger.absoluteTime != null) {
    return formatTaskReminderAbsoluteTime(trigger.absoluteTime);
  }
  if (
    trigger.type === TaskReminderType.Relative &&
    trigger.relativeValue != null &&
    trigger.relativeUnit != null
  ) {
    return t('task.detail.reminderRelative', {
      value: trigger.relativeValue,
      unit: reminderUnitLabel(trigger.relativeUnit),
    });
  }
  return t('task.detail.reminders');
}

function goalBinding(vm: TaskPlanViewModel) {
  if (!vm.goalBinding?.goalId) return null;
  return {
    goalId: vm.goalBinding.goalId as GoalId,
    keyResultId: vm.goalBinding.keyResultId ? (vm.goalBinding.keyResultId as KeyResultId) : null,
    progressRule: vm.goalBinding.keyResultId
      ? TaskGoalProgressConfigurationSchema.parse(vm.goalBinding).progressRule
      : null,
  };
}

function sameSerializedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedLabelIds(vm: TaskPlanViewModel): string[] {
  return vm.labelIds ?? vm.labels?.map((label) => label.id) ?? [];
}

async function saveInlinePlan(vm: TaskPlanViewModel): Promise<void> {
  const current = viewModel.value;
  if (!current) return;

  const req: UpdateTaskPlanReq = {};
  const nextSchedule = toTaskPlanSchedulePayload(vm);
  const currentSchedule = toTaskPlanSchedulePayload(current);
  if (!sameSerializedValue(nextSchedule, currentSchedule)) req.schedule = nextSchedule;

  const nextReminder = (vm.reminderConfig as UpdateTaskPlanReq['reminderConfig']) ?? null;
  const currentReminder = (current.reminderConfig as UpdateTaskPlanReq['reminderConfig']) ?? null;
  if (!sameSerializedValue(nextReminder, currentReminder)) req.reminderConfig = nextReminder;

  const nextImportance = (vm.importance as ImportanceLevel) ?? ImportanceLevel.Moderate;
  const currentImportance = (current.importance as ImportanceLevel) ?? ImportanceLevel.Moderate;
  if (nextImportance !== currentImportance) req.importance = nextImportance;

  const nextLabels = normalizedLabelIds(vm);
  const currentLabels = normalizedLabelIds(current);
  if (!sameSerializedValue(nextLabels, currentLabels)) req.labelIds = nextLabels;

  const nextGoalBinding = goalBinding(vm);
  const currentGoalBinding = goalBinding(current);
  if (!sameSerializedValue(nextGoalBinding, currentGoalBinding)) {
    req.goalBinding = nextGoalBinding;
  }

  if (!sameSerializedValue(vm.checklist, current.checklist)) req.checklist = vm.checklist;

  if (Object.keys(req).length === 0) return;
  const result = await updatePlanSafe(id.value, req);
  if (result) await refetchWorkspace();
}

async function saveTitle(): Promise<void> {
  const vm = viewModel.value;
  if (!vm) return;
  const next = titleDraft.value.trim();
  if (!next) {
    titleDraft.value = vm.title;
    return;
  }
  if (next === vm.title) return;
  const result = await updatePlanSafe(id.value, { name: next });
  if (!result) titleDraft.value = vm.title;
}

function commitTitleFromKeyboard(event: KeyboardEvent): void {
  (event.currentTarget as HTMLElement | null)?.blur();
}

async function saveDescription(): Promise<void> {
  const vm = viewModel.value;
  if (!vm) return;
  const next = descriptionDraft.value.trim();
  if (next === (vm.description ?? '')) return;
  const result = await updatePlanSafe(id.value, { description: next || null });
  if (!result) descriptionDraft.value = vm.description ?? '';
}

function commitDescriptionFromKeyboard(event: KeyboardEvent): void {
  (event.currentTarget as HTMLElement | null)?.blur();
}

function resetInlineDrafts(): void {
  const vm = viewModel.value;
  if (!vm) return;
  titleDraft.value = vm.title;
  descriptionDraft.value = vm.description ?? '';
}

async function saveImportance(value: ImportanceLevel): Promise<void> {
  if (viewModel.value?.importance !== value) {
    await updatePlanSafe(id.value, { importance: value });
  }
  activeProperty.value = null;
}

async function saveLabelIds(ids: string[]): Promise<void> {
  const saved = await updatePlanSafe(id.value, { labelIds: ids });
  if (!saved) return;
  if (ids.length > 0) showLabelsEditor.value = false;
  await refetchWorkspace();
}

async function toggleLabelSelection(labelId: string): Promise<void> {
  const next = labelIds.value.includes(labelId)
    ? labelIds.value.filter((id) => id !== labelId)
    : [...labelIds.value, labelId];
  await saveLabelIds(next);
}

async function saveReminderConfig(value: TaskReminderConfigDTO | null): Promise<void> {
  const saved = await updatePlanSafe(id.value, { reminderConfig: value });
  if (!saved) return;
  if (value?.enabled && value.triggers.length > 0) showReminderEditor.value = false;
  await refetchWorkspace();
}

async function addCustomAbsoluteReminder(value: number): Promise<void> {
  const now = Number(getProductTime().now());
  const rounded = Math.floor(value / 60_000) * 60_000;
  if (!Number.isFinite(rounded) || rounded <= now) return;
  const existing = reminderTriggers.value;
  if (
    existing.some(
      (trigger) => trigger.type === TaskReminderType.Absolute && trigger.absoluteTime === rounded,
    ) ||
    existing.length >= 10
  ) {
    return;
  }
  await saveReminderConfig({
    enabled: true,
    triggers: [
      ...existing,
      {
        type: TaskReminderType.Absolute,
        absoluteTime: rounded,
        relativeValue: null,
        relativeUnit: null,
      },
    ],
  });
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    await saveLabelIds([...new Set([...labelIds.value, label.id])]);
  } catch (error) {
    labelCreateError.value =
      error instanceof Error ? error.message : t('task.metadata.labelCreateFailed');
  }
}

function requestKeyResults(goalId: string, force = false) {
  return loadKeyResults(goalId, force);
}

async function pause() {
  if (await pausePlanSafe(id.value)) await refetchWorkspace();
}
async function activate() {
  if (await activatePlanSafe(id.value)) await refetchWorkspace();
}
async function abandon() {
  if (await abandonPlanSafe(id.value)) await reloadDetail();
}
async function remove() {
  const confirmed = await useConfirm({
    title: t('task.management.deletePlan'),
    description: t('task.management.confirmDelete', { name: viewModel.value?.title ?? '' }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  if (await deletePlanSafe(id.value)) await router.push({ name: 'task-list' });
}
async function reloadDetail() {
  await refetchWorkspace();
}

const noop = () => undefined;
</script>
