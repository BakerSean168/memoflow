import { describe, expect, it, vi } from 'vitest';
import { createRepositoryModule } from './repository.module';
describe('Web knowledge write boundary', () => {
  it('rejects writes, adoption, Desktop tokens and historical payload replay even with injected legacy services', async () => {
    const commit = vi.fn();
    const adopt = vi.fn();
    const token = vi.fn();
    const replay = vi.fn();
    const module = createRepositoryModule({
      knowledgeNoteCommitService: { create: commit, adopt } as never,
      knowledgeRepositoryConnectionService: { issueInstallationToken: token } as never,
      knowledgeRepositoryProjectionService: { replayWriteRequestProjection: replay } as never,
    } as never);
    const context = { identityId: 'owner', source: 'ipc', requestId: 'forged-desktop' } as never;
    for (const invoke of [
      () => module.api.createConfirmedKnowledgeNote(context, {} as never),
      () => module.api.adoptKnowledgeDocument(context, {} as never),
      () => module.api.issueDesktopKnowledgeRepositoryToken(context, 'binding-1'),
      () => module.api.replayKnowledgeWriteRequestProjection(context, 'write-1'),
    ])
      await expect(invoke()).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(commit).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
  });
});
