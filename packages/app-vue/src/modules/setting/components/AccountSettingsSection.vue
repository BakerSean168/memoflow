<script setup lang="ts">
/** Account/Auth owner composition with capability-based password gating. */
import { defineAsyncComponent, inject } from 'vue';
import AccountProfileSection from '../../account/components/AccountProfileSection.vue';
import { AUTH_SERVICE_KEY } from '../../../di/keys';

const CloudPasswordSection = defineAsyncComponent(
  () => import('../../account/components/CloudPasswordSection.vue'),
);
const cloudPasswordService = inject(AUTH_SERVICE_KEY, null);
</script>

<template>
  <section class="space-y-8" data-testid="account-settings-section">
    <AccountProfileSection />
    <CloudPasswordSection v-if="cloudPasswordService" />
  </section>
</template>
