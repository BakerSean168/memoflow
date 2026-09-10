<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t('setting.locale.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <div class="grid grid-cols-1 gap-6 @2xl/panel:grid-cols-2">
        <div class="space-y-2">
          <Label for="language-select">{{ t('setting.locale.language') }}</Label>
          <Select
            :model-value="modelValue.language"
            @update:model-value="
              (value) =>
                emit('update:modelValue', {
                  ...modelValue,
                  language: LocaleIdSchema.parse(
                    normalizeSelectString(value) ?? modelValue.language,
                  ),
                })
            "
          >
            <SelectTrigger id="language-select">
              <SelectValue :placeholder="t('setting.locale.languagePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in languageOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="timezone-select">{{ t('setting.locale.timezone') }}</Label>
          <Select
            :model-value="modelValue.timeZone"
            @update:model-value="
              (value) =>
                emit('update:modelValue', {
                  ...modelValue,
                  timeZone: TimeZoneIdSchema.parse(
                    normalizeSelectString(value) ?? modelValue.timeZone,
                  ),
                })
            "
          >
            <SelectTrigger id="timezone-select">
              <SelectValue :placeholder="t('setting.locale.timezonePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in timezoneOpts" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="date-style-select">{{ t('setting.locale.dateFormat') }}</Label>
          <Select
            :model-value="modelValue.dateStyle"
            @update:model-value="
              (value) =>
                emit('update:modelValue', {
                  ...modelValue,
                  dateStyle: DateStyleSchema.parse(
                    normalizeSelectString(value) ?? modelValue.dateStyle,
                  ),
                })
            "
          >
            <SelectTrigger id="date-style-select">
              <SelectValue :placeholder="t('setting.locale.dateFormatPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in dateStyleOpts" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="time-style-select">{{ t('setting.locale.timeFormat') }}</Label>
          <Select
            :model-value="modelValue.timeStyle"
            @update:model-value="
              (value) =>
                emit('update:modelValue', {
                  ...modelValue,
                  timeStyle: TimeStyleSchema.parse(
                    normalizeSelectString(value) ?? modelValue.timeStyle,
                  ),
                })
            "
          >
            <SelectTrigger id="time-style-select">
              <SelectValue :placeholder="t('setting.locale.timeFormatPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in timeStyleOpts" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="week-start-select">{{ t('setting.locale.weekStartsOn') }}</Label>
          <Select
            :model-value="String(modelValue.weekStartsOn)"
            @update:model-value="
              (value) => {
                const normalized = normalizeSelectString(value);
                if (normalized !== null) {
                  emit('update:modelValue', {
                    ...modelValue,
                    weekStartsOn: WeekStartsOnSchema.parse(Number(normalized)),
                  });
                }
              }
            "
          >
            <SelectTrigger id="week-start-select">
              <SelectValue :placeholder="t('setting.locale.weekStartsOnPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in weekStartOpts"
                :key="option.value"
                :value="String(option.value)"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, CardContent, CardHeader, CardTitle, Label } from '@memoflow/ui-vue-shadcn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { normalizeSelectString } from '../../../shared/utils/normalize-select-string';
import {
  DateStyleSchema,
  LocaleIdSchema,
  TimeStyleSchema,
  WeekStartsOnSchema,
  type PresentationPreferences,
  type RegionalPreferences,
} from '@memoflow/contracts/setting';
import { TimeZoneIdSchema } from '@memoflow/contracts/primitives';

type DateStyle = RegionalPreferences['dateStyle'];
type TimeStyle = RegionalPreferences['timeStyle'];
type Weekday = RegionalPreferences['weekStartsOn'];

export type CanonicalLocaleSettings = RegionalPreferences & {
  language: PresentationPreferences['language'];
};

const { t } = useI18n();
defineProps<{ modelValue: CanonicalLocaleSettings }>();
const emit = defineEmits<{ 'update:modelValue': [value: CanonicalLocaleSettings] }>();

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];

const timezoneOpts = computed<Array<{ label: string; value: RegionalPreferences['timeZone'] }>>(() => [
  { label: 'UTC', value: TimeZoneIdSchema.parse('UTC') },
  { label: t('setting.locale.tzBeijing'), value: TimeZoneIdSchema.parse('Asia/Shanghai') },
  { label: 'Tokyo', value: TimeZoneIdSchema.parse('Asia/Tokyo') },
  { label: t('setting.locale.tzNewYork'), value: TimeZoneIdSchema.parse('America/New_York') },
]);

const dateStyleOpts: Array<{ label: string; value: DateStyle }> = [
  { label: 'Short', value: 'short' },
  { label: 'Medium', value: 'medium' },
  { label: 'Long', value: 'long' },
];

const timeStyleOpts = computed<Array<{ label: string; value: TimeStyle }>>(() => [
  { label: t('setting.locale.time24h'), value: '24h' },
  { label: t('setting.locale.time12h'), value: '12h' },
]);

const weekStartOpts = computed<Array<{ label: string; value: Weekday }>>(() => [
  { label: t('setting.locale.weekSunday'), value: 0 },
  { label: t('setting.locale.weekMonday'), value: 1 },
  { label: t('setting.locale.weekSaturday'), value: 6 },
]);
</script>
