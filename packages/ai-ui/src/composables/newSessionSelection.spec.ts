import { afterEach, describe, expect, it } from 'vitest';
import {
  nativeOptionsForSelection,
  readNewSessionDefault,
  readStickySelection,
  resolveNewSessionSelection,
  sanitizeComposerSelection,
  writeNewSessionDefault,
  writeStickySelection,
  type ComposerSessionSelection,
  type NewSessionAvailability,
} from './newSessionSelection';

afterEach(() => localStorage.clear());

const nativeSelection: ComposerSessionSelection = {
  runtimeKind: 'local_agent',
  connectionId: 'connection-claude',
  modelId: 'sonnet',
  reasoningEffort: 'high',
  permissionMode: 'full-access',
};
const stickySelection: ComposerSessionSelection = {
  runtimeKind: 'builtin',
  agentInstanceId: 'mastra',
  modelKey: 'agent:mastra::provider-1::model-a',
};

describe('new-session selection priority', () => {
  it('uses the enabled explicit default over sticky memory', () => {
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: true, selection: nativeSelection },
      sticky: stickySelection,
    });
    expect(resolution).toEqual({
      selection: nativeSelection,
      source: 'explicit',
      explicitDefaultFallback: false,
    });
  });

  it('keeps an explicit default while the Agent directory is still loading', () => {
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: true, selection: nativeSelection },
      sticky: stickySelection,
      availability: () => 'pending',
    });
    expect(resolution.source).toBe('explicit');
    expect(resolution.explicitDefaultFallback).toBe(false);
  });

  it('falls back to sticky memory and reports it when the default is unavailable', () => {
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: true, selection: nativeSelection },
      sticky: stickySelection,
      availability: () => 'unavailable',
    });
    expect(resolution).toEqual({
      selection: stickySelection,
      source: 'sticky',
      explicitDefaultFallback: true,
    });
  });

  it('falls back to the untouched composer when neither layer resolves', () => {
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: true, selection: nativeSelection },
      sticky: null,
      availability: () => 'unavailable',
    });
    expect(resolution).toEqual({
      selection: null,
      source: 'none',
      explicitDefaultFallback: true,
    });
  });

  it('ignores a disabled explicit default and keeps sticky memory', () => {
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: false, selection: nativeSelection },
      sticky: stickySelection,
    });
    expect(resolution).toEqual({
      selection: stickySelection,
      source: 'sticky',
      explicitDefaultFallback: false,
    });
  });

  it('leaves the composer untouched without any remembered layer', () => {
    expect(resolveNewSessionSelection({ explicit: null, sticky: null }).selection).toBeNull();
  });

  it('does not consult availability for sticky-only memories', () => {
    const availability: (selection: ComposerSessionSelection) => NewSessionAvailability = () =>
      'unavailable';
    const resolution = resolveNewSessionSelection({
      explicit: { enabled: false, selection: null },
      sticky: nativeSelection,
      availability,
    });
    // Sticky memory is presented with the existing snapshot semantics instead
    // of being silently replaced by another Agent.
    expect(resolution.selection).toBe(nativeSelection);
    expect(resolution.explicitDefaultFallback).toBe(false);
  });
});

describe('composer selection storage', () => {
  it('scopes sticky memory by identity', () => {
    writeStickySelection(nativeSelection, 'profile-a');
    writeStickySelection(stickySelection, 'profile-b');
    expect(readStickySelection('profile-a')).toMatchObject({ modelId: 'sonnet' });
    expect(readStickySelection('profile-b')).toMatchObject({ agentInstanceId: 'mastra' });
    expect(readStickySelection('profile-c')).toBeNull();
  });

  it('round-trips the new-session default with its enabled flag', () => {
    writeNewSessionDefault({ enabled: true, selection: nativeSelection }, 'profile-a');
    expect(readNewSessionDefault('profile-a')).toEqual({
      enabled: true,
      selection: nativeSelection,
    });
    writeNewSessionDefault({ enabled: false, selection: nativeSelection }, 'profile-a');
    expect(readNewSessionDefault('profile-a').enabled).toBe(false);
  });

  it('disables the default when its stored selection is unusable', () => {
    localStorage.setItem(
      'ai:composer:new-session-default:v1:profile-a',
      JSON.stringify({ enabled: true, selection: { runtimeKind: 'local_agent' } }),
    );
    expect(readNewSessionDefault('profile-a')).toEqual({ enabled: false, selection: null });
  });
});

describe('composer selection sanitisation', () => {
  it('rejects records without a runtime kind or a native model', () => {
    expect(sanitizeComposerSelection(null)).toBeNull();
    expect(sanitizeComposerSelection({ modelId: 'sonnet' })).toBeNull();
    expect(
      sanitizeComposerSelection({ runtimeKind: 'local_agent', connectionId: 'connection-claude' }),
    ).toBeNull();
  });

  it('drops an unknown permission mode and keeps valid native options', () => {
    const sanitized = sanitizeComposerSelection({
      runtimeKind: 'local_agent',
      connectionId: 'connection-claude',
      modelId: 'sonnet',
      permissionMode: 'root',
      nativeOptions: {
        'connection-claude::sonnet': { reasoningEffort: 'high', serviceTier: 'fast' },
        broken: { reasoningEffort: 4 },
      },
    });
    expect(sanitized).toEqual({
      runtimeKind: 'local_agent',
      connectionId: 'connection-claude',
      modelId: 'sonnet',
      nativeOptions: {
        'connection-claude::sonnet': { reasoningEffort: 'high', serviceTier: 'fast' },
      },
    });
  });

  it('prefers per-model options and falls back to the flat reasoning effort', () => {
    expect(nativeOptionsForSelection(nativeSelection)).toEqual({
      key: 'connection-claude::sonnet',
      options: { reasoningEffort: 'high' },
    });
    expect(
      nativeOptionsForSelection({
        ...nativeSelection,
        reasoningEffort: undefined,
        nativeOptions: { 'connection-claude::sonnet': { serviceTier: 'fast' } },
      }),
    ).toEqual({
      key: 'connection-claude::sonnet',
      options: { serviceTier: 'fast' },
    });
    expect(nativeOptionsForSelection(stickySelection)).toBeNull();
  });
});
