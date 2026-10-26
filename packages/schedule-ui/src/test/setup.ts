import '@schedule-ui-test-host/test/setup';
import { beforeAll } from 'vitest';

// The host implementation lives in app-vue and is shared through the
// @schedule-ui-test-host alias. Bind it lazily: a static import here would
// evaluate that module (and its `useConfirm` import from
// @memoflow/ui-vue-shadcn) before a spec's hoisted vi.mock runs, so specs that
// intercept the confirm dialog would silently get the real one.
beforeAll(async () => {
  const { bindDefaultScheduleUiHost } = await import('./test-host');
  bindDefaultScheduleUiHost();
});
