<script setup lang="ts">
/**
 * Web main-shell auth entry.
 *
 * The web host boots a dedicated AuthApp for `/auth` paths. If the main SPA
 * ever lands on this route (for example via a programmatic router push), force
 * a full-page navigation so AuthApp/WebAuthView owns password + GitHub login
 * and the legacy in-shell guest surface cannot appear.
 *
 * Desktop Profile Access uses a separate renderer bootstrap and never uses
 * this Web identity fallback.
 */
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ProductSurfaceState from '../shared/components/ProductSurfaceState.vue';

const { t } = useI18n();

onMounted(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target || '/auth');
});
</script>

<template>
  <ProductSurfaceState
    family="workspace"
    kind="loading"
    class="min-h-full bg-background"
    :title="t('auth.page.redirecting')"
    test-id="auth-platform-entry"
  />
</template>
