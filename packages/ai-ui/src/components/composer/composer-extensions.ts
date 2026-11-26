// Adapted from T3 Code f9b19a7f8 (MIT); see THIRD_PARTY_NOTICES.md.
import { Extension, InputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Paragraph } from '@tiptap/extension-paragraph';
import type { NodeType, ResolvedPos } from '@tiptap/pm/model';
import { ComposerTextDirectionExtension } from './composer-text-direction';
import { ComposerMarkdownSourceExtension } from './composer-markdown-source';
import {
  COMPOSER_UNDO_GROUP_DELAY,
  groupUndoByChangeKind,
  type ComposerChangeKind,
} from './composer-undo-grouping';
import {
  ComposerItalicExtension,
  ComposerBoldExtension,
  ComposerStrikeExtension,
  ComposerCodeExtension,
  ComposerCodeBlockExtension,
  ComposerBlockExtensions,
  ComposerListExtensions,
  ComposerTaskListExtension,
  ComposerTaskItemExtension,
  convertBulletItemToTask,
} from './composer-rich-text-doc';

/** Wait for a character after '- ' so task markers reach their input rule before becoming bullets. */
function listMarkerInputRule(find: RegExp, listType: 'bulletList' | 'orderedList'): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match, chain }) => {
      const marker = match.groups?.marker ?? '-';
      const space = match.groups?.space ?? ' ';
      const carried = match.groups?.carried ?? '';
      // Nested lists would serialize flat, so accept only top-level paragraphs.
      const $from = state.doc.resolve(range.from);
      if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return null;
      const command = chain()
        .deleteRange(range)
        .wrapInList(
          listType,
          listType === 'orderedList' ? { start: Number.parseInt(marker, 10) || 1 } : {},
        )
        .updateAttributes('listItem', { marker, space });
      (carried ? command.insertContent(carried) : command).run();
      return undefined;
    },
  });
}

const bulletToTaskInputRule = new InputRule({
  find: /^\[([ xX])\] $/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from);
    const item = $from.node(-1);
    if ($from.parent.type.name !== 'paragraph' || item?.type.name !== 'listItem') return null;
    if (!['-', '*', '+'].includes((item.attrs as { marker?: string }).marker ?? '')) return null;
    const checked = (match[1] ?? ' ').toLowerCase() === 'x';
    chain()
      .command(({ tr }) => {
        convertBulletItemToTask(tr, range.from, range.to, checked);
        return true;
      })
      .run();
    return undefined;
  },
});

function taskInputRule(type: NodeType): InputRule {
  const rule = wrappingInputRule({
    find: /^- \[([ xX])\] $/,
    type,
    getAttributes: (match) => ({ checked: match[1]?.toLowerCase() === 'x' }),
  });
  return new InputRule({
    find: rule.find,
    handler: (props) =>
      props.state.doc.resolve(props.range.from).depth === 1 ? rule.handler(props) : null,
  });
}

export function hasAncestor($pos: ResolvedPos, name: string): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === name) return true;
  }
  return false;
}

const blockquoteInputRule = new InputRule({
  find: /^>(\s)$/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from);
    if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return null;
    chain()
      .deleteRange(range)
      .wrapIn('blockquote', { prefix: `>${match[1] ?? ' '}` })
      .run();
    return undefined;
  },
});

/** Require a space after *** or ___ to preserve bold typing. Lists and quotes cannot serialize rules. */
const horizontalRuleInputRule = new InputRule({
  find: /^(---|\*\*\*|___)\s?$/,
  handler: ({ state, range, match, chain }) => {
    const source = match[0] ?? '---';
    if (!source.startsWith('---') && !/\s$/.test(source)) return null;
    const $from = state.doc.resolve(range.from);
    if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return null;
    chain()
      .deleteRange(range)
      .setHorizontalRule()
      .command(({ tr }) => {
        const $pos = tr.selection.$from;
        const index = $pos.index(0) - 1;
        if (index < 0) return true;
        const rulePos = $pos.posAtIndex(index, 0);
        const rule = tr.doc.nodeAt(rulePos);
        if (rule?.type.name === 'horizontalRule') {
          tr.setNodeMarkup(rulePos, undefined, { ...rule.attrs, source });
        }
        return true;
      })
      .run();
    return undefined;
  },
});

/** Require a space to preserve PR references; lists and quotes cannot serialize headings. */
const headingInputRule = new InputRule({
  find: /^(#{1,6})(\s)$/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from);
    if ($from.parent.type.name !== 'paragraph' || $from.depth !== 1) return null;
    chain()
      .deleteRange(range)
      .setNode('heading', { level: match[1]?.length ?? 1, space: match[2] ?? ' ' })
      .run();
    return undefined;
  },
});

/** Decide grouping in dispatch middleware before the history plugin applies the transaction. */
const ComposerUndoGroupingExtension = Extension.create<
  Record<string, never>,
  { previous: ComposerChangeKind | null }
>({
  name: 'composer-undo-grouping',
  addStorage() {
    return { previous: null };
  },
  dispatchTransaction({ transaction, next }) {
    this.storage.previous = groupUndoByChangeKind(transaction, this.storage.previous);
    next(transaction);
  },
});

// Module scope keeps extension identity stable; Tiptap hooks read config through this.
export function createComposerExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      link: false,
      orderedList: false,
      underline: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      code: false,
      listKeymap: false,
      undoRedo: { newGroupDelay: COMPOSER_UNDO_GROUP_DELAY },
      italic: false,
      bold: false,
      strike: false,
      paragraph: false,
    }),
    // Ctrl/Cmd+click would node-select and outline the whole line (Wispr Flow holds Ctrl to dictate).
    Paragraph.extend({ selectable: false }),
    ComposerUndoGroupingExtension,
    ComposerTextDirectionExtension,
    ComposerMarkdownSourceExtension,
    ComposerItalicExtension,
    ComposerBoldExtension,
    ComposerStrikeExtension,
    ComposerCodeExtension,
    ComposerCodeBlockExtension.extend({
      addInputRules() {
        return [];
      },
    }),
    ...ComposerBlockExtensions.map((extension) =>
      extension.name === 'blockquote'
        ? extension.extend({
            addInputRules() {
              return [blockquoteInputRule];
            },
          })
        : extension.name === 'horizontalRule'
          ? extension.extend({
              addInputRules() {
                return [horizontalRuleInputRule];
              },
            })
          : extension.name === 'heading'
            ? extension.extend({
                addInputRules() {
                  return [headingInputRule];
                },
              })
            : extension,
    ),
    ...ComposerListExtensions.map((extension) =>
      extension.name === 'listItem'
        ? extension
        : extension.extend({
            addInputRules() {
              return this.name === 'bulletList'
                ? [
                    listMarkerInputRule(/^(?<marker>[*+])(?<space>\s)$/, 'bulletList'),
                    listMarkerInputRule(
                      /^(?<marker>-)(?<space>[ \t]+)(?<carried>[^\s[])$/,
                      'bulletList',
                    ),
                  ]
                : [listMarkerInputRule(/^(?<marker>\d+[.)])(?<space>\s)$/, 'orderedList')];
            },
          }),
    ),
    ComposerTaskListExtension,
    ComposerTaskItemExtension.extend({
      addInputRules() {
        return [taskInputRule(this.type), bulletToTaskInputRule];
      },
    }),
  ];
}
