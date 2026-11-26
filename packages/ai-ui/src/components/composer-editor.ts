import { Node, type Editor, type JSONContent } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import type { ComposerContextEntity } from '../composables/types';
import ComposerMentionNode from './ComposerMentionNode.vue';

export type ComposerMention = Omit<ComposerContextEntity, 'origin'>;
export const COMPOSER_MENTION = 'composerMention';

// Adapted from T3 Code's inline atomic composer mention design (MIT).
// See THIRD_PARTY_NOTICES.md.
export const ComposerMentionExtension = Node.create({
  name: COMPOSER_MENTION,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { entity: { default: null, rendered: false } };
  },
  renderHTML({ node }) {
    return ['span', { 'data-composer-mention': '' }, '@' + node.attrs.entity.label];
  },
  renderText({ node }) {
    return '@' + node.attrs.entity.label;
  },
  addNodeView() {
    return VueNodeViewRenderer(ComposerMentionNode);
  },
});

export const mentionKey = (entity: ComposerMention) => entity.entityType + ':' + entity.id;

export function composerDocument(text: string): JSONContent {
  return {
    type: 'doc',
    content: text
      .replace(/\r\n?/gu, '\n')
      .split('\n')
      .map((line) => ({
        type: 'paragraph',
        ...(line ? { content: [{ type: 'text', text: line }] } : {}),
      })),
  };
}

export function composerText(editor: Editor) {
  return editor.getText({ blockSeparator: '\n' });
}

export function composerMentions(editor: Editor) {
  const entities = new Map<string, ComposerMention>();
  editor.state.doc.descendants((node) => {
    if (node.type.name !== COMPOSER_MENTION) return;
    const entity = node.attrs.entity as ComposerMention;
    entities.set(mentionKey(entity), entity);
  });
  return entities;
}

export function composerMentionTrigger(editor: Editor) {
  const { from, empty, $from } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const prefix = editor.state.doc.textBetween($from.start(), from, '\n', '\uFFFC');
  const match = /(?:^|[\s\uFFFC])@([^@\s]{0,60})$/u.exec(prefix);
  if (!match) return null;
  const query = match[1] ?? '';
  return { from: from - query.length - 1, to: from, query };
}
