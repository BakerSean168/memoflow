<script setup lang="ts">
import { Button } from '@memoflow/ui-vue-shadcn';
</script>

<template>
  <div class="flex h-full min-h-0 flex-col items-center justify-center bg-background p-8">
    <div class="text-center space-y-4">
      <h1 class="text-6xl font-bold text-muted-foreground">404</h1>
      <p class="text-xl text-muted-foreground">页面未找到</p>
      <Button class="mt-4 px-6 py-2 hover:opacity-90" @click="$router.push('/')"> 返回首页 </Button>
    </div>
  </div>
</template>
