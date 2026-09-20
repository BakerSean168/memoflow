import { onScopeDispose, ref } from 'vue';

export function useTransientFeedback(durationMs = 2500) {
  const visible = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(): void {
    if (timer) clearTimeout(timer);
    visible.value = true;
    timer = setTimeout(() => {
      visible.value = false;
      timer = null;
    }, durationMs);
  }

  function hide(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    visible.value = false;
  }

  onScopeDispose(hide);
  return { visible, show, hide };
}
