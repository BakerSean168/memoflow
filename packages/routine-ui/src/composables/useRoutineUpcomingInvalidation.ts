import { onScopeDispose } from 'vue';
import { routineUiHost } from '../routine-ui-host';

/**
 * Re-run a Routine owner read when the renderer server-state authority invalidates this
 * identity's upcoming projection.
 *
 * All committed channels (local UI mutation, Local MCP/AI through Desktop PowerSync,
 * Web/API mutation, PowerSync sync + reconnect) converge on the dispatcher; consumers only
 * subscribe here instead of patching individual save callbacks.
 * 所有已提交通道都汇聚到 dispatcher：本地 UI mutation、Local MCP/AI（Desktop PowerSync）、
 * Web/API mutation、PowerSync 同步与重连。消费方只订阅此入口，不在单个保存回调打补丁。
 */
export function useRoutineUpcomingInvalidation(refresh: () => void): void {
  const runtime = routineUiHost.useServerStateRuntime();
  const resolveIdentityScope = routineUiHost.useServerStateIdentityScope();
  const stop = runtime.dispatcher.subscribe((event) => {
    if (event.target !== 'routine-upcoming') return;
    if (event.identityScope !== resolveIdentityScope()) return;
    refresh();
  });
  onScopeDispose(stop);
}
