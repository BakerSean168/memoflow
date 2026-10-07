import type { AssistantRuntimeSelectedEntity } from '@memoflow/contracts/ai';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type { ComposerAttachment, ComposerContextEntity } from './types';

const MAX_COMPOSER_ATTACHMENTS = 4;
const MAX_COMPOSER_ATTACHMENT_BYTES = 1_000_000;
const MAX_COMPOSER_ATTACHMENT_TOTAL_BYTES = 1_200_000;
const MAX_COMPOSER_CONTEXT_ENTITIES = 12;
const COMPOSER_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const COMPOSER_DOCUMENT_MEDIA_TYPES = new Set(['text/plain', 'text/markdown', 'application/pdf']);
type RuntimeSelectableEntityType = AssistantRuntimeSelectedEntity['entityType'];

function isRuntimeSelectableEntity(
  entity: ComposerContextEntity,
): entity is ComposerContextEntity & { entityType: RuntimeSelectableEntityType } {
  return (
    entity.entityType === 'goal' ||
    entity.entityType === 'task' ||
    entity.entityType === 'knowledge_document'
  );
}

export function useAIComposerContext() {
  const { t } = useI18n();
  const composerAttachments = ref<ComposerAttachment[]>([]);
  const composerContextEntities = ref<ComposerContextEntity[]>([]);
  const suppressedSurfaceContextKey = ref<string | null>(null);
  function inferAttachmentMediaType(file: File): string {
    const provided = file.type.trim().toLowerCase();
    if (provided) return provided;
    const name = file.name.toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  function isSupportedAttachmentMediaType(mediaType: string): boolean {
    return (
      COMPOSER_IMAGE_MEDIA_TYPES.has(mediaType) || COMPOSER_DOCUMENT_MEDIA_TYPES.has(mediaType)
    );
  }

  function fileToDataUrl(file: File, mediaType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('FILE_READ_FAILED'));
      reader.onload = () => {
        const raw = String(reader.result ?? '');
        const commaIndex = raw.indexOf(',');
        if (commaIndex <= 0) return reject(new Error('FILE_READ_INVALID_DATA_URL'));
        resolve(`data:${mediaType};base64,${raw.slice(commaIndex + 1)}`);
      };
      reader.readAsDataURL(file);
    });
  }

  async function addComposerFiles(files: readonly File[]) {
    const room = MAX_COMPOSER_ATTACHMENTS - composerAttachments.value.length;
    if (room <= 0) {
      toast.error(
        t('aiAssistant.chatPage.attachments.tooMany', { count: MAX_COMPOSER_ATTACHMENTS }),
      );
      return;
    }
    const accepted = [...files].slice(0, room);
    if (files.length > room) {
      toast.error(
        t('aiAssistant.chatPage.attachments.tooMany', { count: MAX_COMPOSER_ATTACHMENTS }),
      );
    }
    let totalBytes = composerAttachments.value.reduce(
      (sum, attachment) => sum + attachment.size,
      0,
    );
    for (const file of accepted) {
      const mediaType = inferAttachmentMediaType(file);
      if (!isSupportedAttachmentMediaType(mediaType)) {
        toast.error(t('aiAssistant.chatPage.attachments.unsupportedType', { name: file.name }));
        continue;
      }
      if (file.size > MAX_COMPOSER_ATTACHMENT_BYTES) {
        toast.error(t('aiAssistant.chatPage.attachments.tooLarge', { name: file.name }));
        continue;
      }
      if (totalBytes + file.size > MAX_COMPOSER_ATTACHMENT_TOTAL_BYTES) {
        toast.error(t('aiAssistant.chatPage.attachments.totalTooLarge'));
        break;
      }
      try {
        const data = await fileToDataUrl(file, mediaType);
        if (!data) throw new Error('FILE_READ_EMPTY');
        composerAttachments.value.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          data,
          mediaType,
          filename: file.name || undefined,
          size: file.size,
        });
        totalBytes += file.size;
      } catch {
        toast.error(t('aiAssistant.chatPage.attachments.readFailed', { name: file.name }));
      }
    }
  }

  function removeComposerAttachment(id: string) {
    composerAttachments.value = composerAttachments.value.filter(
      (attachment) => attachment.id !== id,
    );
  }

  function upsertContextEntity(entity: ComposerContextEntity) {
    const key = `${entity.entityType}:${entity.id}`;
    const existing = composerContextEntities.value.findIndex(
      (item) => `${item.entityType}:${item.id}` === key,
    );
    if (existing >= 0) composerContextEntities.value.splice(existing, 1, entity);
    else composerContextEntities.value.push(entity);
  }

  function toggleExplicitContextEntity(entity: Omit<ComposerContextEntity, 'origin'>) {
    const key = `${entity.entityType}:${entity.id}`;
    const existing = composerContextEntities.value.findIndex(
      (item) => `${item.entityType}:${item.id}` === key && item.origin === 'explicit',
    );
    if (existing >= 0) {
      composerContextEntities.value.splice(existing, 1);
      return;
    }
    if (composerContextEntities.value.length >= MAX_COMPOSER_CONTEXT_ENTITIES) {
      toast.error(
        t('aiAssistant.chatPage.context.tooMany', { count: MAX_COMPOSER_CONTEXT_ENTITIES }),
      );
      return;
    }
    upsertContextEntity({ ...entity, origin: 'explicit' });
  }

  function setSurfaceContextEntity(entity: Omit<ComposerContextEntity, 'origin'> | null) {
    const previousSurface = composerContextEntities.value.find((item) => item.origin === 'surface');
    const previousKey = previousSurface
      ? `${previousSurface.entityType}:${previousSurface.id}`
      : null;
    const nextKey = entity ? `${entity.entityType}:${entity.id}` : null;

    composerContextEntities.value = composerContextEntities.value.filter(
      (item) => item.origin !== 'surface',
    );

    // A user-dismissed current-view chip stays dismissed while the same
    // surface remains visible. Moving to a different surface restores the
    // default implicit-context behavior for that new object.
    if (!entity) {
      suppressedSurfaceContextKey.value = null;
      return;
    }
    if (previousKey && previousKey !== nextKey) suppressedSurfaceContextKey.value = null;
    if (suppressedSurfaceContextKey.value === nextKey) return;

    const alreadyExplicit = composerContextEntities.value.some(
      (item) =>
        item.origin === 'explicit' &&
        item.entityType === entity.entityType &&
        item.id === entity.id,
    );
    if (!alreadyExplicit && composerContextEntities.value.length < MAX_COMPOSER_CONTEXT_ENTITIES) {
      upsertContextEntity({ ...entity, origin: 'surface' });
    }
  }

  function removeContextEntity(entityType: ComposerContextEntity['entityType'], id: string) {
    const removed = composerContextEntities.value.find(
      (item) => item.entityType === entityType && item.id === id,
    );
    if (removed?.origin === 'surface') {
      suppressedSurfaceContextKey.value = `${entityType}:${id}`;
    }
    composerContextEntities.value = composerContextEntities.value.filter(
      (item) => !(item.entityType === entityType && item.id === id),
    );
  }

  function clearComposerTurnState() {
    composerAttachments.value = [];
  }

  function clearComposerContext() {
    composerAttachments.value = [];
    composerContextEntities.value = [];
    suppressedSurfaceContextKey.value = null;
  }

  function selectedEntities(): AssistantRuntimeSelectedEntity[] {
    return composerContextEntities.value
      .filter(isRuntimeSelectableEntity)
      .map((entity) => ({ entityType: entity.entityType, id: entity.id, label: entity.label }));
  }
  return {
    selectedEntities,
    composerAttachments,
    composerContextEntities,
    addComposerFiles,
    removeComposerAttachment,
    toggleExplicitContextEntity,
    setSurfaceContextEntity,
    removeContextEntity,
    clearComposerTurnState,
    clearComposerContext,
  };
}
