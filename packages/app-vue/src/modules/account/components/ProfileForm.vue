<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDate, type DateValue } from '@internationalized/date';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Input } from '@memoflow/ui-vue-shadcn';
import { Label } from '@memoflow/ui-vue-shadcn';
import { Textarea } from '@memoflow/ui-vue-shadcn';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@memoflow/ui-vue-shadcn';
import { Avatar, AvatarImage, AvatarFallback } from '@memoflow/ui-vue-shadcn';
import { getProductTime } from '../../../shared/utils/product-time';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { Calendar } from '@memoflow/ui-vue-shadcn';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type { AccountProfileDTO } from '@memoflow/contracts/account';
import { requireYmd } from '@memoflow/contracts/primitives';

interface ProfileFormProps {
  profile: AccountProfileDTO;
  loading?: boolean;
  showCancel?: boolean;
}

interface ProfileFormEmits {
  (e: 'save', data: AccountProfileDTO): void;
  (e: 'cancel'): void;
  (e: 'uploadAvatar'): void;
}

const props = withDefaults(defineProps<ProfileFormProps>(), {
  loading: false,
  showCancel: true,
});

const emit = defineEmits<ProfileFormEmits>();

const { t } = useI18n();
const formData = ref<AccountProfileDTO>({ ...props.profile });

watch(
  () => props.profile,
  (newProfile) => {
    formData.value = { ...newProfile };
  },
);

const initials = computed(() => {
  if (formData.value.realName) {
    return formData.value.realName.slice(0, 2).toUpperCase();
  }
  return formData.value.nickname.slice(0, 2).toUpperCase();
});

const handleSave = () => {
  if (props.loading) return;
  emit('save', formData.value);
};

const handleCancel = () => {
  emit('cancel');
};

const handleUploadAvatar = () => {
  emit('uploadAvatar');
};

const calendarValue = computed<DateValue | undefined>(() => {
  if (!formData.value.birthday) return undefined;
  const [year, month, day] = requireYmd(formData.value.birthday).split('-').map(Number);
  return new CalendarDate(year, month, day);
});

const handleDateSelect = (date: DateValue | undefined) => {
  if (!date) {
    formData.value.birthday = null;
    return;
  }
  const ymd = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  formData.value.birthday = requireYmd(ymd);
};

const formatBirthday = (birthday: AccountProfileDTO['birthday']): string =>
  birthday ? getProductTime().format.ymdDisplay(birthday) : '';

const realNameValue = computed({
  get: () => formData.value.realName ?? '',
  set: (value: string) => {
    formData.value.realName = value.trim() ? value : null;
  },
});

const bioValue = computed({
  get: () => formData.value.bio ?? '',
  set: (value: string) => {
    formData.value.bio = value.trim() ? value : null;
  },
});
</script>

<template>
  <Card class="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ t('account.profile.editTitle') }}</CardTitle>
    </CardHeader>

    <CardContent class="space-y-6">
      <!-- Avatar -->
      <div class="flex items-center space-x-4">
        <Avatar class="h-20 w-20">
          <AvatarImage
            v-if="formData.avatarUrl"
            :src="formData.avatarUrl"
            :alt="formData.nickname"
          />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <div class="space-y-1">
          <Button variant="outline" size="sm" :disabled="loading" @click="handleUploadAvatar">
            {{ t('account.profile.changeAvatar') }}
          </Button>
          <p class="text-xs text-muted-foreground">
            {{ t('account.profile.avatarRecommendation') }}
          </p>
        </div>
      </div>

      <!-- Nickname -->
      <div class="space-y-2">
        <Label for="nickname">{{ t('account.profile.nickname') }}</Label>
        <Input
          id="nickname"
          v-model="formData.nickname"
          type="text"
          :placeholder="t('account.placeholder.nickname')"
          :disabled="loading"
        />
      </div>

      <!-- Real Name -->
      <div class="space-y-2">
        <Label for="realName">{{ t('account.profile.realName') }}</Label>
        <Input
          id="realName"
          v-model="realNameValue"
          type="text"
          :placeholder="t('account.placeholder.realNameOptional')"
          :disabled="loading"
        />
      </div>

      <!-- Bio -->
      <div class="space-y-2">
        <Label for="bio">{{ t('account.profile.bio') }}</Label>
        <Textarea
          id="bio"
          v-model="bioValue"
          :placeholder="t('account.placeholder.bio')"
          rows="4"
          :disabled="loading"
        />
      </div>

      <!-- Gender -->
      <div class="space-y-2">
        <Label for="gender">{{ t('account.profile.gender') }}</Label>
        <Select v-model="formData.gender" :disabled="loading">
          <SelectTrigger id="gender">
            <SelectValue :placeholder="t('account.placeholder.gender')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MALE">{{ t('account.gender.male') }}</SelectItem>
            <SelectItem value="FEMALE">{{ t('account.gender.female') }}</SelectItem>
            <SelectItem value="OTHER">{{ t('account.gender.other') }}</SelectItem>
            <SelectItem value="UNSPECIFIED">{{ t('account.gender.unspecified') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Birthday -->
      <div class="space-y-2">
        <Label for="birthday">{{ t('account.profile.birthday') }}</Label>
        <Popover>
          <PopoverTrigger as-child>
            <Button
              id="birthday"
              variant="outline"
              class="w-full justify-start text-left font-normal"
              :disabled="loading"
            >
              {{ formatBirthday(formData.birthday) || t('account.placeholder.selectDate') }}
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-auto p-0">
            <Calendar :model-value="calendarValue" @update:model-value="handleDateSelect" />
          </PopoverContent>
        </Popover>
      </div>
    </CardContent>

    <CardFooter class="flex justify-end space-x-2">
      <Button v-if="showCancel" variant="outline" :disabled="loading" @click="handleCancel">
        {{ t('common.cancel') }}
      </Button>
      <Button :disabled="loading" @click="handleSave">
        {{ loading ? t('common.saving') : t('common.save') }}
      </Button>
    </CardFooter>
  </Card>
</template>
