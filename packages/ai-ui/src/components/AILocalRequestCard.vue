<template>
  <Teleport
    v-if="
      formNoticeTarget &&
      request.request.type === 'permission' &&
      request.request.business &&
      (request.status === 'pending' || request.status === 'sending')
    "
    :to="formNoticeTarget"
  >
    <p
      class="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
      data-testid="ai-business-permission-form-notice"
    >
      {{
        t('setting.permissions.scope', {
          agent: request.request.business.agentName ?? request.request.business.agentId,
          object: t(`setting.permissions.objects.${request.request.business.object}`),
          action: t(`setting.permissions.actions.${request.request.business.action}`),
        })
      }}
      {{ t('setting.permissions.countdown', { seconds }) }}
    </p>
  </Teleport>
  <section class="mb-3 space-y-2 rounded-xl border p-3" data-testid="ai-native-request">
    <p
      v-if="request.request.type === 'permission'"
      class="text-xs text-muted-foreground"
      data-testid="ai-native-permission-kind"
    >
      {{
        t(
          request.request.business
            ? 'setting.permissions.title'
            : 'aiAssistant.local.nativePermission',
        )
      }}
    </p>
    <p class="text-sm font-medium">
      {{
        request.request.type === 'permission'
          ? request.request.title
          : t('aiAssistant.local.question')
      }}
    </p>
    <template v-if="request.request.type === 'permission'">
      <p
        v-if="request.request.reason"
        class="text-xs break-words"
        data-testid="ai-native-permission-reason"
      >
        {{
          t('aiAssistant.local.permissionReason', {
            reason: request.request.reason,
          })
        }}
      </p>
      <p
        v-if="request.request.scope"
        class="text-xs break-words"
        data-testid="ai-native-permission-scope"
      >
        {{
          t('aiAssistant.local.permissionScope', {
            scope: request.request.scope,
          })
        }}
      </p>
    </template>
    <template v-if="request.request.type === 'permission' && request.request.business">
      <p class="text-xs" data-testid="ai-business-permission-scope">
        {{
          t('setting.permissions.scope', {
            agent: request.request.business.agentName ?? request.request.business.agentId,
            object: t(`setting.permissions.objects.${request.request.business.object}`),
            action: t(`setting.permissions.actions.${request.request.business.action}`),
          })
        }}
      </p>
      <p
        v-if="request.status === 'pending'"
        class="text-xs text-muted-foreground"
        role="timer"
        data-testid="ai-business-permission-countdown"
      >
        {{ t('setting.permissions.countdown', { seconds }) }}
      </p>
    </template>
    <p class="text-xs text-muted-foreground" role="status">
      {{ t(`aiAssistant.local.${request.status}`) }}
    </p>
    <p v-if="request.errorMessage" role="alert">{{ request.errorMessage }}</p>
    <template v-if="request.status === 'pending' || request.status === 'sending'">
      <div v-if="request.request.type === 'permission'" class="flex flex-wrap gap-2">
        <Button
          size="sm"
          :disabled="
            request.status !== 'pending' || (Boolean(request.request.business) && seconds === 0)
          "
          data-testid="ai-permission-allow-once"
          @click="emit('respond', { type: 'permission', decision: 'approve_once' })"
          >{{ t('aiAssistant.local.approveOnce') }}</Button
        >
        <Button
          v-if="request.request.business"
          size="sm"
          variant="outline"
          :disabled="request.status !== 'pending' || seconds === 0"
          data-testid="ai-permission-allow-always"
          @click="emit('respond', { type: 'permission', decision: 'approve_always' })"
          >{{ t('setting.permissions.always') }}</Button
        >
        <Button
          size="sm"
          variant="outline"
          :disabled="request.status !== 'pending'"
          data-testid="ai-permission-deny"
          @click="emit('respond', { type: 'permission', decision: 'decline' })"
          >{{ t('aiAssistant.local.decline') }}</Button
        >
      </div>
      <form v-else class="space-y-3" @submit.prevent="answer">
        <label
          v-for="question in request.request.questions"
          :key="question.id"
          class="block space-y-1 text-sm"
        >
          <span>{{ question.prompt }}</span>
          <Select
            v-if="question.options.length"
            :model-value="answers[question.id] as string | undefined"
            :disabled="request.status !== 'pending'"
            @update:model-value="setAnswer(question.id, $event)"
          >
            <SelectTrigger class="w-full" :aria-label="question.prompt">
              <SelectValue :placeholder="t('aiAssistant.local.chooseAnswer')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in question.options" :key="option" :value="option">
                {{ option }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-else
            v-model="answers[question.id]"
            :disabled="request.status !== 'pending'"
            :maxlength="8000"
            required
          />
          <span
            v-if="answerErrors[question.id]"
            role="alert"
            class="block text-xs text-destructive"
          >
            {{ answerErrors[question.id] }}
          </span>
        </label>
        <Button type="submit" size="sm" :disabled="request.status !== 'pending'">{{
          t('aiAssistant.local.answer')
        }}</Button>
      </form>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import type { LocalAgentRequestResponse } from '@memoflow/ai-contracts';
import type { ChatNativeRequest } from '../composables/types';
const props = defineProps<{ request: ChatNativeRequest }>();
const emit = defineEmits<{
  respond: [response: LocalAgentRequestResponse['response']];
}>();
const { t } = useI18n();
const formNoticeTarget = ref<Element | null>(null);
onMounted(() => {
  formNoticeTarget.value = document.getElementById('goal-ai-permission-notice');
});
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 250);
onBeforeUnmount(() => clearInterval(timer));
const seconds = computed(() =>
  props.request.request.type === 'permission' && props.request.request.business
    ? Math.max(0, Math.ceil((props.request.request.business.expiresAt - now.value) / 1000))
    : 0,
);
const answers = reactive<Record<string, string>>({});
const answerErrors = reactive<Record<string, string>>({});

function setAnswer(questionId: string, value: unknown) {
  answers[questionId] = typeof value === 'string' ? value : '';
  if (answers[questionId]!.trim()) delete answerErrors[questionId];
}

function answer() {
  if (props.request.request.type !== 'user_input') return;
  const missing = props.request.request.questions.filter(
    (question) => question.options.length && !(answers[question.id] ?? '').trim(),
  );
  if (missing.length) {
    for (const question of missing) {
      answerErrors[question.id] = t('aiAssistant.local.answerRequired');
    }
    return;
  }
  emit('respond', {
    type: 'user_input',
    answers: props.request.request.questions.map((q) => ({
      questionId: q.id,
      values: [answers[q.id] ?? ''],
    })),
  });
}
</script>
