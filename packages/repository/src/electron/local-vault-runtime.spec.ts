import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
