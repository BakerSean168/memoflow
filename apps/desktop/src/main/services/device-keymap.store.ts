import fs from 'node:fs';
import path from 'node:path';
import { DeviceKeymapSchema, DeviceKeymapWriteSchema } from '@memoflow/contracts/shared';

export interface KeymapProfile {
  profileId: string;
  uiDir: string;
}
/** Synchronous scope check + atomic rename keeps profile changes outside the commit. */
export class DeviceKeymapStore {
  constructor(private readonly resolveProfile: () => KeymapProfile | null) {}
  get() {
    const profile = this.requireProfile();
    const file = path.join(profile.uiDir, 'keyboard-keymap.json');
    const keymap = fs.existsSync(file)
      ? DeviceKeymapSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
      : DeviceKeymapSchema.parse({ version: 1, overrides: {} });
    return { profileId: profile.profileId, keymap };
  }
  set(input: unknown) {
    const request = DeviceKeymapWriteSchema.parse(input);
    const profile = this.requireProfile();
    if (request.profileId !== profile.profileId)
      throw new Error('Profile changed; retry saving shortcuts');
    const file = path.join(profile.uiDir, 'keyboard-keymap.json');
    const temporary = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(profile.uiDir, { recursive: true });
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(request.keymap, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    return { profileId: profile.profileId, keymap: request.keymap };
  }
  private requireProfile() {
    const profile = this.resolveProfile();
    if (!profile) throw new Error('Keyboard preferences require an active Profile');
    return profile;
  }
}
