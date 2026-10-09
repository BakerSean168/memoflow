<template>
  <section class="mb-3 space-y-2 rounded-xl border p-3" data-testid="ai-native-request">
    <p class="text-sm font-medium">
      {{
        request.request.type === 'permission'
          ? request.request.title
          : t('aiAssistant.local.question')
      }}
    </p>
    <p class="text-xs text-muted-foreground" role="status">
      {{ t(`aiAssistant.local.${request.status}`) }}
    </p>
    <p v-if="request.errorMessage" role="alert">{{ request.errorMessage }}</p>
    <template v-if="request.status === 'pending' || request.status === 'sending'">
      <div v-if="request.request.type === 'permission'" class="flex gap-2">
        <Button
          size="sm"
          :disabled="request.status !== 'pending'"
          @click="emit('respond', { type: 'permission', decision: 'approve_once' })"
          >{{ t('aiAssistant.local.approveOnce') }}</Button
        >
        <Button
          size="sm"
          variant="outline"
          :disabled="request.status !== 'pending'"
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
          <select
            v-if="question.options.length"
            v-model="answers[question.id]"
            class="block w-full rounded border bg-background p-2"
            :disabled="request.status !== 'pending'"
            required
          >
            <option v-for="option in question.options" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
          <Input
            v-else
            v-model="answers[question.id]"
            :disabled="request.status !== 'pending'"
            :maxlength="8000"
            required
          />
        </label>
        <Button type="submit" size="sm" :disabled="request.status !== 'pending'">{{
          t('aiAssistant.local.answer')
        }}</Button>
      </form>
    </template>
  </section>
</template>
<script setup lang="ts">
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import type { LocalAgentRequestResponse } from '@memoflow/contracts/ai';
import type { ChatNativeRequest } from '../composables/types';
const props = defineProps<{ request: ChatNativeRequest }>();
const emit = defineEmits<{ respond: [response: LocalAgentRequestResponse['response']] }>();
const { t } = useI18n();
const answers = reactive<Record<string, string>>({});
function answer() {
  if (props.request.request.type !== 'user_input') return;
  emit('respond', {
    type: 'user_input',
    answers: props.request.request.questions.map((q) => ({
      questionId: q.id,
      values: [answers[q.id] ?? ''],
    })),
  });
}
</script>
