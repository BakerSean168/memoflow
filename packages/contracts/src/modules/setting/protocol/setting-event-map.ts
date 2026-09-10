import type { SettingImportedEvent } from '../domain/events/setting-imported.event';

/** Canonical Setting events. Legacy UserSetting aggregate events are retired. */
export type SettingEventMap = {
  'setting:setting-imported': SettingImportedEvent;
};
