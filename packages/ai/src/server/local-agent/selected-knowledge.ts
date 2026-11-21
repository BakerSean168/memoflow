import { z } from 'zod';
import type { AssistantRuntimeSelectedEntity } from '@memoflow/ai-contracts';
import type { LocalAgentToolGrant } from './local-agent-runtime';
import { LocalAgentError } from '../../shared/local-agent-error';

const toolResponse = z.object({
  error: z.unknown().optional(),
  result: z
    .object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional() })
    .optional(),
});
const failureResult = z.object({ error: z.object({ code: z.string() }) });
const permissionFailureCodes = new Set(['PERMISSION_DENIED', 'FORBIDDEN', 'INSUFFICIENT_SCOPE']);

const noteResult = z.object({
  note: z
    .object({
      title: z.string(),
      path: z.string(),
      url: z.string(),
      contentHash: z.string(),
      content: z.string(),
    })
    .nullable(),
});

/** Explicit references use the same audited, live permission boundary as model tool calls. */
export async function readSelectedLocalAgentKnowledge(
  grant: LocalAgentToolGrant | undefined,
  selections: readonly AssistantRuntimeSelectedEntity[],
  signal: AbortSignal,
) {
  const selected = selections.filter(
    (item) => item.entityType === 'knowledge_source' || item.entityType === 'knowledge_document',
  );
  if (!selected.length) return [];
  if (!grant) throw new LocalAgentError('LOCAL_AGENT_TOOLS_UNAVAILABLE');
  const notes = [];
  for (const selection of selected) {
    const response = await fetch(grant.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${grant.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `selected-${selection.id}`,
        method: 'tools/call',
        params: {
          name: 'knowledge_get',
          arguments:
            selection.entityType === 'knowledge_source'
              ? { source: selection.source }
              : { documentId: selection.id },
        },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok)
      throw new LocalAgentError(
        response.status === 401 || response.status === 403
          ? 'LOCAL_AGENT_PERMISSION_DENIED'
          : 'LOCAL_AGENT_TOOLS_UNAVAILABLE',
      );
    const raw = await response.text();
    const line = raw.split('\n').find((value) => value.startsWith('data: '));
    let decoded: unknown;
    try {
      decoded = JSON.parse(line ? line.slice(6) : raw);
    } catch {
      throw new LocalAgentError('LOCAL_AGENT_TOOLS_UNAVAILABLE');
    }
    const envelope = toolResponse.safeParse(decoded);
    if (!envelope.success || envelope.data.error !== undefined || !envelope.data.result)
      throw new LocalAgentError('LOCAL_AGENT_TOOLS_UNAVAILABLE');
    const result = envelope.data.result;
    if (result.isError) {
      const failure = failureResult.safeParse(result.structuredContent);
      const code = failure.success ? failure.data.error.code : undefined;
      if (code && permissionFailureCodes.has(code))
        throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
      throw new LocalAgentError(
        code === 'NOT_FOUND' || code === 'CONFLICT' || code === 'VALIDATION_ERROR'
          ? 'KNOWLEDGE_CONTEXT_STALE'
          : 'LOCAL_AGENT_TOOLS_UNAVAILABLE',
      );
    }
    const parsed = noteResult.safeParse(result.structuredContent);
    if (!parsed.success) throw new LocalAgentError('LOCAL_AGENT_TOOLS_UNAVAILABLE');
    if (!parsed.data.note) throw new LocalAgentError('KNOWLEDGE_CONTEXT_STALE');
    const note = parsed.data.note;
    notes.push({
      ...note,
      content: note.content.slice(0, 24000),
      truncated: note.content.length > 24000,
    });
  }
  return notes;
}
