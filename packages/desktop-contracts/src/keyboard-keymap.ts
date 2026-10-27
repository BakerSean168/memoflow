import { z } from 'zod';

/** Device-local UI command identities; unrelated to the domain CommandRegistry. */
export const keyboardCommandIds = [
  'module.goal.preview',
  'module.goal.activate',
  'module.task.preview',
  'module.task.activate',
  'module.routine.preview',
  'module.routine.activate',
  'module.note.preview',
  'module.note.activate',
  'module.schedule.preview',
  'module.schedule.activate',
  'module.notification.preview',
  'module.notification.activate',
  'app.palette',
  'app.help',
  'app.shortcuts',
  'layout.sidebar',
  'layout.panel',
  'conversation.new',
  'conversation.search',
  'tab.next',
  'tab.previous',
  'preview.next',
  'preview.previous',
  'preview.open',
  'preview.close',
  'list.next',
  'list.previous',
  'list.open',
  'list.toggle',
  'list.extendNext',
  'list.extendPrevious',
  'list.clear',
  'list.expand',
  'list.collapse',
] as const;
export type KeyboardCommandId = (typeof keyboardCommandIds)[number];

export const DeviceKeymapSchema = z
  .object({
    version: z.literal(1),
    // Missing entries inherit host defaults; an empty override removes all bindings.
    // Disabling is separate so re-enabling preserves the user's custom keys.
    disabled: z.array(z.enum(keyboardCommandIds)).max(keyboardCommandIds.length).optional(),
    overrides: z.partialRecord(
      z.enum(keyboardCommandIds),
      z.array(z.string().min(1).max(80)).max(4),
    ),
  })
  .strict();
export type DeviceKeymap = z.infer<typeof DeviceKeymapSchema>;

/** The caller's scope is checked again by main before writing. */
export const DeviceKeymapWriteSchema = z
  .object({
    profileId: z.string().min(1),
    keymap: DeviceKeymapSchema,
  })
  .strict();
export const DeviceKeymapSnapshotSchema = z
  .object({
    profileId: z.string().min(1),
    keymap: DeviceKeymapSchema,
  })
  .strict();
