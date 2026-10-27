import { PortableAccountProfileV3Schema } from './portable-v3';

const profile = {
  nickname: 'Portable User',
  realName: null,
  avatarUrl: 'https://example.com/avatar.png',
  bio: null,
  gender: 'Other' as const,
  birthday: null,
};

describe('PortableAccountProfileV3Schema', () => {
  it('accepts absolute avatar URLs and null', () => {
    expect(PortableAccountProfileV3Schema.parse(profile)).toEqual(profile);
    expect(
      PortableAccountProfileV3Schema.parse({ ...profile, avatarUrl: null }).avatarUrl,
    ).toBeNull();
  });

  it('rejects non-URLs', () => {
    expect(
      PortableAccountProfileV3Schema.safeParse({ ...profile, avatarUrl: 'not-a-url' }).success,
    ).toBe(false);
  });
});
