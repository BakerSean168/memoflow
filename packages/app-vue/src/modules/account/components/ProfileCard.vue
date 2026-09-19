<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, CardHeader, CardContent } from '@memoflow/ui-vue-shadcn';
import { Avatar, AvatarImage, AvatarFallback } from '@memoflow/ui-vue-shadcn';
import { Badge } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { GenderType, type AccountProfileDTO } from '@memoflow/contracts/account';
import { getProductTime } from '../../../shared/utils/product-time';

interface ProfileCardProps {
  profile: AccountProfileDTO;
  showEditButton?: boolean;
  loading?: boolean;
}

interface ProfileCardEmits {
  (e: 'edit'): void;
}

const props = withDefaults(defineProps<ProfileCardProps>(), {
  showEditButton: true,
  loading: false,
});

const emit = defineEmits<ProfileCardEmits>();

const { t } = useI18n();

const initials = computed(() => {
  if (props.profile.realName) {
    return props.profile.realName.slice(0, 2).toUpperCase();
  }
  return props.profile.nickname.slice(0, 2).toUpperCase();
});

const genderText = computed(() => {
  switch (props.profile.gender) {
    case GenderType.Male:
      return t('account.gender.male');
    case GenderType.Female:
      return t('account.gender.female');
    case GenderType.Other:
      return t('account.gender.other');
    case GenderType.PreferNotToSay:
      return t('account.gender.notSet');
    default:
      return t('account.gender.notSet');
  }
});

/** Birthday is a date-only Ymd value; never reinterpret it as an Instant. */
const formatBirthday = (birthday: AccountProfileDTO['birthday']) => {
  if (birthday == null) return t('account.gender.notSet');
  return getProductTime().format.ymdDisplay(birthday);
};

const handleEdit = () => {
  emit('edit');
};
</script>

<template>
  <Card class="w-full">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="flex items-center space-x-4">
        <Avatar class="h-16 w-16">
          <AvatarImage v-if="profile.avatarUrl" :src="profile.avatarUrl" :alt="profile.nickname" />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <div>
          <h3 class="text-2xl font-bold">{{ profile.nickname }}</h3>
          <p v-if="profile.realName" class="text-sm text-muted-foreground">
            {{ profile.realName }}
          </p>
        </div>
      </div>
      <Button
        v-if="showEditButton"
        variant="outline"
        size="sm"
        :disabled="loading"
        @click="handleEdit"
      >
        {{ t('account.profile.editProfile') }}
      </Button>
    </CardHeader>

    <CardContent class="space-y-4">
      <div v-if="profile.bio" class="space-y-2">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('account.profile.bio') }}</h4>
        <p class="text-sm">{{ profile.bio }}</p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <h4 class="text-sm font-medium text-muted-foreground">
            {{ t('account.profile.gender') }}
          </h4>
          <Badge variant="secondary">{{ genderText }}</Badge>
        </div>

        <div class="space-y-1">
          <h4 class="text-sm font-medium text-muted-foreground">
            {{ t('account.profile.birthday') }}
          </h4>
          <p class="text-sm">{{ formatBirthday(profile.birthday) }}</p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
