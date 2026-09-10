import { ValueObject } from '@memoflow/utils/domain';
import type {
  AccountProfileDTO,
  AccountProfile as IAccountProfile,
} from '@memoflow/contracts/account';
import { requireYmd, type Ymd } from '@memoflow/contracts/primitives';
import { GenderType } from './gender-type';

function normalizeBirthday(value: AccountProfileDTO['birthday']): Ymd | null {
  return value == null ? null : requireYmd(value);
}

export class AccountProfile extends ValueObject<AccountProfileDTO> implements IAccountProfile {
  private constructor(props: AccountProfileDTO) {
    super(props);
  }

  public static create(props: AccountProfileDTO): AccountProfile {
    this.validate(props);
    return new AccountProfile({ ...props, birthday: normalizeBirthday(props.birthday) });
  }

  public static createDefault(displayNameSeed: string): AccountProfile {
    const trimmed = displayNameSeed.trim();
    const defaultNickname = (trimmed.length >= 2 ? trimmed : 'User').slice(0, 20);

    return new AccountProfile({
      nickname: defaultNickname,
      gender: GenderType.PreferNotToSay,
      realName: null,
      avatarUrl: null,
      bio: null,
      birthday: null,
    });
  }

  private static validate(props: AccountProfileDTO): void {
    if (props.nickname.length > 20) {
      throw new Error('Nickname must be under 20 characters');
    }
    if (props.nickname.length < 2) {
      throw new Error('Nickname must be at least 2 characters');
    }
    GenderType.of(props.gender);
    if (props.birthday != null) requireYmd(props.birthday);
  }

  public updateNickname(nickname: string): AccountProfile {
    const newProps = { ...this.props, nickname };
    AccountProfile.validate(newProps);
    return new AccountProfile(newProps);
  }

  public updateAvatar(avatarUrl: string): AccountProfile {
    return new AccountProfile({ ...this.props, avatarUrl });
  }

  public updateBio(bio: string): AccountProfile {
    if (bio.length > 500) throw new Error('Bio too long');
    return new AccountProfile({ ...this.props, bio });
  }

  public setRealName(realName: string): AccountProfile {
    return new AccountProfile({ ...this.props, realName });
  }

  public updateGender(gender: GenderType): AccountProfile {
    return new AccountProfile({ ...this.props, gender });
  }

  /** Set a birthday against an explicit reference calendar day. */
  public setBirthday(birthday: Ymd | string, referenceDate: Ymd | string): AccountProfile {
    const birthdayYmd = requireYmd(birthday);
    const referenceYmd = requireYmd(referenceDate);
    if (birthdayYmd > referenceYmd) {
      throw new Error('Birthday cannot be in the future');
    }
    return new AccountProfile({ ...this.props, birthday: birthdayYmd });
  }

  /** Whole-year age at an explicit reference calendar day. */
  public getAgeAt(referenceDate: Ymd | string): number | null {
    if (!this.props.birthday) return null;
    const birthday = requireYmd(this.props.birthday);
    const reference = requireYmd(referenceDate);
    const [by, bm, bd] = birthday.split('-').map(Number);
    const [ry, rm, rd] = reference.split('-').map(Number);
    let age = ry - by;
    if (rm < bm || (rm === bm && rd < bd)) age--;
    return age;
  }

  public get displayName(): string {
    return this.props.realName || this.props.nickname;
  }

  get nickname(): string {
    return this.props.nickname;
  }
  get realName(): string | null {
    return this.props.realName;
  }
  get avatarUrl(): string | null {
    return this.props.avatarUrl;
  }
  get bio(): string | null {
    return this.props.bio;
  }
  get gender(): GenderType {
    return GenderType.of(this.props.gender);
  }
  get birthday(): Ymd | null {
    return this.props.birthday == null ? null : requireYmd(this.props.birthday);
  }

  public toDTO(): AccountProfileDTO {
    return { ...this.props, birthday: this.birthday };
  }
}
