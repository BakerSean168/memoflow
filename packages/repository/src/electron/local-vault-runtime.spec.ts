import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalVaultRuntime,
  LocalVaultRuntimeError,
  type LocalVaultPlatform,
} from './local-vault-runtime';

const NOW = 1_750_000_000_000;
const PROFILE_ID = 'p_profile_1';
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440510';
const SECOND_DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440511';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('LocalVaultRuntime', () => {
  let root: string;
  let vault: string;
  let platform: LocalVaultPlatform;
  let runtime: LocalVaultRuntime;
  let bindingFilePath: string;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-local-vault-'));
    vault = path.join(root, 'My Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    bindingFilePath = path.join(root, 'profile', 'local-vault-binding.json');
    platform = {
      selectDirectory: vi.fn(async () => vault),
      openExternal: vi.fn(async () => undefined),
    };
    runtime = new LocalVaultRuntime({
      bindingFilePath,
      writeLedgerFilePath: path.join(root, 'profile', 'local-vault-write-ledger.json'),
      localProfileId: PROFILE_ID,
      platform,
      now: () => NOW,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  async function selectVault() {
    const snapshot = await runtime.selectVault();
    expect(snapshot?.health.state).toBe('Available');
    expect(snapshot?.binding.detachedAt).toBeNull();
    return snapshot!;
  }

  it('persists binding ownership by stable local profile and keeps reads mutation-free', async () => {
    const selected = await selectVault();
    const before = await fs.promises.readFile(bindingFilePath, 'utf8');

    const loaded = await runtime.getBinding();
    const after = await fs.promises.readFile(bindingFilePath, 'utf8');

    expect(loaded?.binding).toMatchObject({
      id: selected.binding.id,
      knowledgeSpaceId: selected.binding.knowledgeSpaceId,
      localProfileId: PROFILE_ID,
      rootPath: await fs.promises.realpath(vault),
      displayName: 'My Vault',
      boundAt: NOW,
      detachedAt: null,
    });
    expect(loaded?.health).toMatchObject({
      bindingId: selected.binding.id,
      state: 'Available',
      observedAt: NOW,
    });
    expect(after).toBe(before);

    const persisted = JSON.parse(before) as Record<string, unknown>;
    expect(persisted['schemaVersion']).toBe(2);
    expect(persisted).not.toHaveProperty('identityId');
    expect(persisted).not.toHaveProperty('status');
  });

  it('keeps filesystem health as an observation instead of mutating the binding', async () => {
    await selectVault();
    const before = await fs.promises.readFile(bindingFilePath, 'utf8');
    await fs.promises.rm(vault, { recursive: true, force: true });

    const loaded = await runtime.getBinding();

    expect(loaded?.health).toMatchObject({
      state: 'Missing',
      detail: 'Selected Vault root is missing',
    });
    expect(await fs.promises.readFile(bindingFilePath, 'utf8')).toBe(before);
  });

  it('does not migrate schemaVersion 1 binding metadata during the destructive cutover', async () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      id: 'legacy-local-vault',
      identityId: 'legacy-owner',
      rootPath: vault,
      displayName: 'Legacy Vault',
      status: 'Active',
      obsidianVaultId: null,
      lastScannedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await fs.promises.mkdir(path.dirname(bindingFilePath), { recursive: true });
    await fs.promises.writeFile(bindingFilePath, legacy, 'utf8');

    await expect(runtime.getBinding()).resolves.toBeNull();
    expect(await fs.promises.readFile(bindingFilePath, 'utf8')).toBe(legacy);
  });

  it('rejects a V2 binding file owned by another local profile', async () => {
    const selected = await selectVault();
    const foreignRuntime = new LocalVaultRuntime({
      bindingFilePath,
      writeLedgerFilePath: path.join(root, 'other', 'ledger.json'),
      localProfileId: 'p_other_profile',
      platform,
      now: () => NOW,
    });

    expect(selected.binding.localProfileId).toBe(PROFILE_ID);
    await expect(foreignRuntime.getBinding()).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({
      code: 'INTERNAL_ERROR',
    });
  });

  it('scans Markdown, parses frontmatter and links, and ignores private runtime directories', async () => {
    await selectVault();
    await fs.promises.mkdir(path.join(vault, 'Projects'), { recursive: true });
    await fs.promises.mkdir(path.join(vault, '.obsidian'), { recursive: true });
    await fs.promises.writeFile(
      path.join(vault, 'Projects', 'Roadmap.md'),
      [
        '---',
        'title: Product Roadmap',
        'tags:',
        '  - product',
        '  - planning',
        '---',
        '# Ignored heading',
        '',
        'See [[Architecture|system map]] and [[Decisions#ADR]].',
      ].join('\n'),
    );
    await fs.promises.writeFile(path.join(vault, '.obsidian', 'private.md'), '# Private');
    await fs.promises.writeFile(path.join(vault, 'plain.txt'), 'not a note');

    const scanned = await runtime.scanVault();

    expect(scanned.health.state).toBe('Available');
    expect(scanned.notes).toHaveLength(1);
    expect(scanned.notes[0]).toMatchObject({
      relativePath: 'Projects/Roadmap.md',
      title: 'Product Roadmap',
      tags: ['product', 'planning'],
      outgoingLinks: ['Architecture', 'Decisions'],
    });
  });

  it('classifies runtime-only Vaults as empty and repository files or attachments as non-empty', async () => {
    await selectVault();
    await fs.promises.mkdir(path.join(vault, '.memory-flow'), { recursive: true });
    await fs.promises.mkdir(path.join(vault, '.obsidian'), { recursive: true });
    await fs.promises.writeFile(
      path.join(vault, '.memory-flow', 'repository.json'),
      '{"schemaVersion":1}',
    );
    await fs.promises.writeFile(path.join(vault, '.obsidian', 'workspace.json'), '{}');
    await fs.promises.writeFile(path.join(vault, '.scratch.swp'), 'temporary');

    await expect(runtime.inspectSyncContent()).resolves.toBe('Empty');

    await fs.promises.writeFile(path.join(vault, 'README.md'), '# User knowledge');
    await expect(runtime.inspectSyncContent()).resolves.toBe('NonEmpty');

    await fs.promises.rm(path.join(vault, 'README.md'));
    await fs.promises.mkdir(path.join(vault, 'Attachments'));
    await fs.promises.writeFile(path.join(vault, 'Attachments', 'diagram.png'), 'image');
    await expect(runtime.inspectSyncContent()).resolves.toBe('NonEmpty');
  });

  it('rejects traversal and symlink escapes when reading notes', async () => {
    await selectVault();
    const outside = path.join(root, 'secret.md');
    await fs.promises.writeFile(outside, '# Secret');
    await fs.promises.symlink(outside, path.join(vault, 'escape.md'));

    await expect(runtime.readNote({ relativePath: '../secret.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'VALIDATION_ERROR' });
    await expect(runtime.readNote({ relativePath: 'escape.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'FORBIDDEN' });
  });

  it('searches content and opens the canonical note path in Obsidian', async () => {
    await selectVault();
    await fs.promises.mkdir(path.join(vault, 'Reference'), { recursive: true });
    const notePath = path.join(vault, 'Reference', 'Typescript.md');
    await fs.promises.writeFile(notePath, '# TypeScript\n\nStructural typing helps composition.');

    const search = await runtime.searchVault({ query: 'structural typing' });
    expect(search.results).toHaveLength(1);
    expect(search.results[0]?.note.relativePath).toBe('Reference/Typescript.md');
    expect(search.results[0]?.matches[0]).toMatchObject({ lineNumber: 3, startIndex: 0 });

    await runtime.openInObsidian({ relativePath: 'Reference/Typescript.md' });
    const uri = vi.mocked(platform.openExternal).mock.calls[0]?.[0] ?? '';
    expect(uri).toContain('obsidian://open?path=');
    expect(new URL(uri).searchParams.get('path')).toBe(await fs.promises.realpath(notePath));
  });

  it('does not retain historical note contents in the process-wide Markdown parser cache', async () => {
    await selectVault();
    const initialCacheKeys = Object.keys(Reflect.get(matter, 'cache'));
    for (let version = 0; version < 3; version++) {
      await fs.promises.writeFile(
        path.join(vault, 'Edited.md'),
        `---\ntitle: Revision ${version}\n---\n# Historical body ${version}`,
      );
      const note = await runtime.readNote({ relativePath: 'Edited.md' });
      expect(note.title).toBe(`Revision ${version}`);
    }
    await runtime.writeConfirmedNote({
      relativePath: 'Confirmed.md',
      contentMarkdown: '# Confirmed body',
      knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(DOCUMENT_ID),
      proposalId: 'cache-proposal',
      proposalRevision: 1,
      requestId: 'cache-request',
    });
    await runtime.detachVault();

    expect(Object.keys(Reflect.get(matter, 'cache'))).toEqual(initialCacheKeys);
  });

  it('reads each note only once and loads its binding once for a search', async () => {
    await selectVault();
    await fs.promises.writeFile(path.join(vault, 'First.md'), '# First\nshared keyword');
    await fs.promises.writeFile(path.join(vault, 'Second.md'), '# Second\nshared keyword');
    const reads = vi.spyOn(fs.promises, 'readFile');

    const result = await runtime.searchVault({ query: 'shared keyword' });

    expect(result.results).toHaveLength(2);
    expect(reads.mock.calls.filter(([file]) => String(file).endsWith('.md'))).toHaveLength(2);
    expect(reads.mock.calls.filter(([file]) => String(file) === bindingFilePath)).toHaveLength(1);
  });

  it('rejects a search whose Vault changes while its file read is in flight', async () => {
    await selectVault();
    const otherVault = path.join(root, 'Other Vault');
    await fs.promises.mkdir(otherVault);
    const firstPath = path.join(vault, 'Same.md');
    await fs.promises.writeFile(firstPath, '# Title from A\nbody-a');
    await fs.promises.writeFile(path.join(otherVault, 'Same.md'), '# Title from B\nbody-b');
    const reading = deferred();
    const resume = deferred();
    const readFile = fs.promises.readFile.bind(fs.promises);
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
      const content = await readFile(...args);
      if (String(args[0]) === firstPath) {
        reading.resolve();
        await resume.promise;
      }
      return content;
    });
    const pending = runtime.searchVault({ query: 'body-b' }).then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    await reading.promise;
    vi.mocked(platform.selectDirectory).mockResolvedValueOnce(otherVault);
    await runtime.selectVault();
    resume.resolve();

    expect(await pending).toMatchObject({ error: { code: 'CONFLICT' } });
    expect((await runtime.searchVault({ query: 'body-b' })).results[0]?.note.title).toBe(
      'Title from B',
    );
  });

  it('ranks exact title matches ahead of body-only local Vault matches', async () => {
    await selectVault();
    await fs.promises.writeFile(
      path.join(vault, 'Security.md'),
      '# Security\n\nA comparison of 1Password password manager features.',
    );
    await fs.promises.writeFile(
      path.join(vault, '1Password.md'),
      '---\ntitle: 1Password\n---\n# 1Password\n\nA password manager.',
    );

    const search = await runtime.searchVault({ query: '1Password password', limit: 10 });

    expect(search.results.map((result) => result.note.relativePath)).toEqual([
      '1Password.md',
      'Security.md',
    ]);
  });

  it('reads valid memoflow_id markers without mutating unmanaged notes', async () => {
    await selectVault();
    await fs.promises.writeFile(path.join(vault, 'Unmanaged.md'), '# Unmanaged');
    await fs.promises.writeFile(
      path.join(vault, 'Managed.md'),
      `---\nmemoflow_id: ${DOCUMENT_ID}\n---\n# Managed`,
    );

    const unmanagedBefore = await fs.promises.readFile(path.join(vault, 'Unmanaged.md'), 'utf8');
    const unmanaged = await runtime.readNote({ relativePath: 'Unmanaged.md' });
    const managed = await runtime.readNote({ relativePath: 'Managed.md' });

    expect(unmanaged.knowledgeDocumentId).toBeNull();
    expect(managed.knowledgeDocumentId).toBe(DOCUMENT_ID);
    expect(await fs.promises.readFile(path.join(vault, 'Unmanaged.md'), 'utf8')).toBe(
      unmanagedBefore,
    );
  });

  it('fails closed on malformed memoflow_id markers without mutating the note', async () => {
    await selectVault();
    const notePath = path.join(vault, 'Malformed.md');
    const content = '---\nmemoflow_id: not-a-kdoc\n---\n# Malformed';
    await fs.promises.writeFile(notePath, content);

    await expect(runtime.readNote({ relativePath: 'Malformed.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'CONFLICT' });
    await expect(fs.promises.readFile(notePath, 'utf8')).resolves.toBe(content);
    await expect(runtime.scanVault()).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({
      code: 'CONFLICT',
    });
  });

  it('rejects missing or duplicate stable identities before creating a local note', async () => {
    await selectVault();
    await fs.promises.writeFile(
      path.join(vault, 'Managed.md'),
      `---\nmemoflow_id: ${DOCUMENT_ID}\n---\n# Managed`,
    );

    await expect(
      runtime.writeConfirmedNote({
        relativePath: 'Missing-id.md',
        contentMarkdown: '# Missing id',
        proposalId: 'proposal-missing-id',
        proposalRevision: 1,
        requestId: 'request-missing-id',
      } as never),
    ).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({ code: 'VALIDATION_ERROR' });

    await expect(
      runtime.writeConfirmedNote({
        relativePath: 'Duplicate.md',
        knowledgeDocumentId: DOCUMENT_ID as never,
        contentMarkdown: '# Duplicate',
        proposalId: 'proposal-duplicate',
        proposalRevision: 1,
        requestId: 'request-duplicate',
      }),
    ).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({ code: 'CONFLICT' });
    await expect(fs.promises.stat(path.join(vault, 'Duplicate.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('includes notes beyond the former 10,000-note cutoff in search and identity checks', async () => {
    await selectVault();
    for (let start = 0; start < 10_000; start += 64) {
      await Promise.all(
        Array.from({ length: Math.min(64, 10_000 - start) }, (_, offset) =>
          fs.promises.writeFile(
            path.join(vault, `note-${String(start + offset).padStart(5, '0')}.md`),
            '# Ordinary note',
          ),
        ),
      );
    }
    await fs.promises.writeFile(
      path.join(vault, 'zzzz-last.md'),
      `---\nmemoflow_id: ${DOCUMENT_ID}\n---\n# Beyond cutoff\nlastsentinelword`,
    );

    const search = await runtime.searchVault({ query: 'lastsentinelword' });
    expect(search.results.map((result) => result.note.relativePath)).toEqual(['zzzz-last.md']);
    await expect(
      runtime.writeConfirmedNote({
        relativePath: 'duplicate.md',
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(DOCUMENT_ID),
        contentMarkdown: '# Duplicate',
        proposalId: 'large-vault-proposal',
        proposalRevision: 1,
        requestId: 'large-vault-request',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(fs.promises.stat(path.join(vault, 'duplicate.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 30_000);

  it('reuses unchanged content, observes edits and deletions, and isolates returned note objects', async () => {
    await selectVault();
    const firstPath = path.join(vault, 'First.md');
    await fs.promises.writeFile(firstPath, '---\ntags: [original]\n---\n# First\ncacheable body');
    await fs.promises.writeFile(path.join(vault, 'Second.md'), '# Second\ncacheable body');
    const readFile = vi.spyOn(fs.promises, 'readFile');
    const markdownReads = () =>
      readFile.mock.calls.filter(([file]) => String(file).endsWith('.md'));

    await runtime.searchVault({ query: 'cacheable' });
    expect(markdownReads()).toHaveLength(2);
    await runtime.searchVault({ query: 'body' });
    const note = await runtime.readNote({ relativePath: 'First.md' });
    note.tags.push('mutated');
    note.frontmatter['tags'] = ['mutated'];
    const scan = await runtime.scanVault();
    scan.notes[0]!.tags.push('mutated summary');
    expect((await runtime.readNote({ relativePath: 'First.md' })).tags).toEqual(['original']);
    expect(markdownReads()).toHaveLength(2);

    await fs.promises.writeFile(firstPath, '# Edited\nnew content');
    expect((await runtime.searchVault({ query: 'new content' })).results[0]?.note.title).toBe(
      'Edited',
    );
    expect(markdownReads()).toHaveLength(3);
    await fs.promises.rm(firstPath);
    expect((await runtime.searchVault({ query: 'Edited' })).results).toEqual([]);
    await expect(runtime.readNote({ relativePath: 'First.md' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('shares one in-flight catalog for concurrent workspace scans', async () => {
    await selectVault();
    await fs.promises.writeFile(path.join(vault, 'Shared.md'), '# Shared catalog');
    const readFile = vi.spyOn(fs.promises, 'readFile');
    const scans = await Promise.all(Array.from({ length: 12 }, () => runtime.scanVault()));

    expect(scans.every((scan) => scan.notes[0]?.title === 'Shared catalog')).toBe(true);
    expect(readFile.mock.calls.filter(([file]) => String(file).endsWith('.md'))).toHaveLength(1);
    expect(readFile.mock.calls.filter(([file]) => file === bindingFilePath)).toHaveLength(1);
    scans[0]!.notes[0]!.tags.push('caller mutation');
    expect(scans[1]!.notes[0]!.tags).toEqual([]);
  });

  it('resolves stable identities in one binding and refuses ambiguous or incomplete catalogs', async () => {
    await selectVault();
    const id = KnowledgeDocumentIdSchema.parse(DOCUMENT_ID);
    const body = `---\nmemoflow_id: ${id}\n---\n# Managed`;
    await fs.promises.writeFile(path.join(vault, 'Managed.md'), body);
    const readFile = vi.spyOn(fs.promises, 'readFile');
    const matches = await Promise.all(Array.from({ length: 12 }, () => runtime.findNoteById(id)));
    expect(
      matches.every((match) => match?.note.title === 'Managed' && match.binding.rootPath === vault),
    ).toBe(true);
    expect(readFile.mock.calls.filter(([file]) => file === bindingFilePath)).toHaveLength(1);

    await fs.promises.rename(path.join(vault, 'Managed.md'), path.join(vault, 'Moved.md'));
    expect((await runtime.findNoteById(id))?.note.relativePath).toBe('Moved.md');
    await fs.promises.writeFile(path.join(vault, 'Duplicate.md'), body);
    await expect(runtime.findNoteById(id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await fs.promises.rm(path.join(vault, 'Duplicate.md'));
    await fs.promises.writeFile(path.join(vault, 'Too big.md'), 'x'.repeat(2 * 1024 * 1024 + 1));
    await expect(
      runtime.findNoteById(KnowledgeDocumentIdSchema.parse(SECOND_DOCUMENT_ID)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      runtime.writeConfirmedNote({
        relativePath: 'Unknown.md',
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(SECOND_DOCUMENT_ID),
        contentMarkdown: '# Must not write with incomplete identity knowledge',
        proposalId: 'proposal-incomplete',
        proposalRevision: 1,
        requestId: 'request-incomplete',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(fs.promises.stat(path.join(vault, 'Unknown.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each(['cancel', 'dispose'] as const)(
    'stops a scan after %s without publishing or reading the entire Vault',
    async (action) => {
      await selectVault();
      for (let index = 0; index < 24; index++) {
        await fs.promises.writeFile(
          path.join(vault, `${String(index).padStart(2, '0')}.md`),
          '# Cancellable',
        );
      }
      const reading = deferred();
      const resume = deferred();
      const originalRead = fs.promises.readFile.bind(fs.promises);
      const readFile = vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
        const content = await originalRead(...args);
        if (String(args[0]).endsWith('00.md')) {
          reading.resolve();
          await resume.promise;
        }
        return content;
      });
      const controller = new AbortController();
      const pending = runtime
        .searchVault({ query: 'Cancellable' }, { signal: controller.signal })
        .catch((error: unknown) => error);
      await reading.promise;
      if (action === 'cancel') controller.abort();
      else await runtime.dispose();
      resume.resolve();

      expect(await pending).toMatchObject({ code: 'CONFLICT' });
      expect(
        readFile.mock.calls.filter(([file]) => String(file).endsWith('.md')).length,
      ).toBeLessThanOrEqual(8);
      if (action === 'dispose')
        await expect(runtime.getBinding()).rejects.toMatchObject({ code: 'CONFLICT' });
      else expect((await runtime.searchVault({ query: 'Cancellable' })).results).toHaveLength(24);
    },
  );

  it('evicts old content within its cache budget and releases the cache on detach', async () => {
    await selectVault();
    const body = 'x'.repeat(1024 * 1024);
    const readFile = vi.spyOn(fs.promises, 'readFile');
    for (let index = 0; index < 70; index++) {
      const relativePath = `Large-${index}.md`;
      await fs.promises.writeFile(path.join(vault, relativePath), `# Large ${index}\n${body}`);
      await runtime.readNote({ relativePath });
    }
    const markdownReads = () =>
      readFile.mock.calls.filter(([file]) => String(file).endsWith('.md')).length;
    expect(markdownReads()).toBe(70);
    await runtime.readNote({ relativePath: 'Large-69.md' });
    expect(markdownReads()).toBe(70);
    await runtime.readNote({ relativePath: 'Large-0.md' });
    expect(markdownReads()).toBe(71);
    await runtime.detachVault();
    await selectVault();
    await runtime.readNote({ relativePath: 'Large-69.md' });
    expect(markdownReads()).toBe(72);
  }, 30_000);

  it.each([
    { body: '前缀 ﬃ 研究', query: '研究', match: '研究' },
    { body: '前缀 e\u0301 研究', query: 'é', match: 'e\u0301' },
    { body: '全角 ＡＢＣ 与中文', query: 'abc', match: 'ＡＢＣ' },
    { body: `${'x'.repeat(600)} 目标`, query: '目标', match: '目标' },
  ])(
    'returns offsets into the original displayed text for $query',
    async ({ body, query, match }) => {
      await selectVault();
      await fs.promises.writeFile(path.join(vault, 'Unicode.md'), `# Unicode\n${body}`);
      const result = await runtime.searchVault({ query });
      const hit = result.results[0]?.matches[0];
      expect(hit).toBeDefined();
      expect(hit!.lineContent.slice(hit!.startIndex, hit!.endIndex)).toBe(match);
      expect(hit!.lineContent.length).toBeLessThanOrEqual(500);
    },
  );

  it('serializes concurrent writes so a stable identity cannot be created at two paths', async () => {
    await selectVault();
    const requests = ['First.md', 'Second.md'].map((relativePath) => ({
      relativePath,
      knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(DOCUMENT_ID),
      contentMarkdown: '# Concurrent write',
      proposalId: relativePath,
      proposalRevision: 1,
      requestId: relativePath,
    }));
    const results = await Promise.allSettled(
      requests.map((request) => runtime.writeConfirmedNote(request)),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'CONFLICT' },
    });
    expect((await runtime.scanVault()).notes).toHaveLength(1);
  });

  it('writes an explicitly confirmed proposal once and replays the same request idempotently', async () => {
    await selectVault();
    const request = {
      relativePath: 'Agent/Approved note.md',
      contentMarkdown: '# Approved note\n\nUser reviewed this body.',
      knowledgeDocumentId: DOCUMENT_ID as never,
      proposalId: 'proposal-1',
      proposalRevision: 2,
      requestId: 'request-1',
    };

    const created = await runtime.writeConfirmedNote(request);
    const replayed = await runtime.writeConfirmedNote(request);

    expect(created.created).toBe(true);
    expect(replayed.created).toBe(false);
    expect(replayed.note.relativePath).toBe('Agent/Approved note.md');
    const written = await fs.promises.readFile(
      path.join(vault, 'Agent', 'Approved note.md'),
      'utf8',
    );
    expect(written).toContain(`memoflow_id: ${DOCUMENT_ID}`);
    expect(written).toContain('# Approved note\n\nUser reviewed this body.');
    expect(created.note.knowledgeDocumentId).toBe(DOCUMENT_ID);
    expect(replayed.note.knowledgeDocumentId).toBe(DOCUMENT_ID);
    await expect(
      runtime.writeConfirmedNote({ ...request, proposalRevision: 3 }),
    ).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({ code: 'CONFLICT' });
  });

  it('refuses overwrite and write paths containing symlinked directories', async () => {
    await selectVault();
    await expect(
      runtime.writeConfirmedNote({
        expectedBindingId: 'other-vault',
        relativePath: 'Wrong.md',
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(DOCUMENT_ID),
        contentMarkdown: '# Wrong destination',
        proposalId: 'wrong',
        proposalRevision: 1,
        requestId: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fs.existsSync(path.join(vault, 'Wrong.md'))).toBe(false);
    await fs.promises.writeFile(path.join(vault, 'Existing.md'), '# Existing');
    const outsideDirectory = path.join(root, 'outside');
    await fs.promises.mkdir(outsideDirectory);
    await fs.promises.symlink(outsideDirectory, path.join(vault, 'Linked'));

    const baseRequest = {
      contentMarkdown: '# New',
      knowledgeDocumentId: SECOND_DOCUMENT_ID as never,
      proposalId: 'proposal-2',
      proposalRevision: 1,
    };
    await expect(
      runtime.writeConfirmedNote({
        ...baseRequest,
        relativePath: 'Existing.md',
        requestId: 'existing-request',
      }),
    ).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({ code: 'CONFLICT' });
    await expect(
      runtime.writeConfirmedNote({
        ...baseRequest,
        relativePath: 'Linked/Escape.md',
        requestId: 'symlink-request',
      }),
    ).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>({ code: 'FORBIDDEN' });
    await expect(fs.promises.stat(path.join(outsideDirectory, 'Escape.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('detaches without deleting user files and no longer exposes the binding as active', async () => {
    await selectVault();
    await fs.promises.writeFile(path.join(vault, 'Keep.md'), '# Keep');

    await runtime.detachVault();

    await expect(runtime.getBinding()).resolves.toBeNull();
    expect(await fs.promises.readFile(path.join(vault, 'Keep.md'), 'utf8')).toBe('# Keep');
    const persisted = JSON.parse(await fs.promises.readFile(bindingFilePath, 'utf8')) as {
      binding: { detachedAt: number | null };
    };
    expect(persisted.binding.detachedAt).toBe(NOW);
  });
});
