import type { ComposerContextEntity } from './types';

export interface AIActiveSurfaceDescriptor {
  module: 'goal' | 'task' | 'routine' | 'note' | 'notification' | 'schedule';
  route: string;
  title: string;
}

function exactEntityId(route: string, prefix: '/goals/' | '/tasks/'): string | null {
  const path = route.split(/[?#]/u, 1)[0] ?? '';
  if (!path.startsWith(prefix)) return null;
  const tail = path.slice(prefix.length);
  if (!tail || tail.includes('/')) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

/**
 * Convert the shell's currently visible business tab into implicit AI context.
 * Only canonical Goal/Task detail routes and stable knowledge-note routes are attached;
 * list/review/editor routes are deliberately excluded so the assistant never guesses an entity id.
 */
function queryValue(route: string, key: string): string | null {
  const questionMark = route.indexOf('?');
  if (questionMark < 0) return null;
  const hashMark = route.indexOf('#', questionMark);
  const query = route.slice(questionMark + 1, hashMark >= 0 ? hashMark : undefined);
  const value = new URLSearchParams(query).get(key);
  return value?.trim() || null;
}

export function surfaceDescriptorToContextEntity(
  surface: AIActiveSurfaceDescriptor | null | undefined,
): Omit<ComposerContextEntity, 'origin'> | null {
  if (!surface) return null;
  if (surface.module === 'goal') {
    const id = exactEntityId(surface.route, '/goals/');
    return id ? { entityType: 'goal', id, label: surface.title || id } : null;
  }
  if (surface.module === 'task') {
    const id = exactEntityId(surface.route, '/tasks/');
    return id ? { entityType: 'task', id, label: surface.title || id } : null;
  }
  if (surface.module === 'note') {
    const id = queryValue(surface.route, 'note');
    return id ? { entityType: 'knowledge_document', id, label: surface.title || id } : null;
  }
  return null;
}
