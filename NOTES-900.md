# Issue #900 — null account nickname

## Write path

The server persistence hole is the PowerSync CRUD upload:

1. `PUT /api/v1/powersync/crud` (`apps/api/src/modules/powersync/module.ts:225-246`)
2. `executeCrudBatch` (`apps/api/src/modules/powersync/crud-executor.ts:70`)
3. Generic Prisma delegate `upsert`/`update` for table `accounts`
   (`apps/api/src/modules/powersync/crud-executor.ts:278-326`), with values
   produced by `normalizeCrudData`
   (`apps/api/src/modules/powersync/crud-normalization.ts`).

That path writes `accounts.profile` directly from the client-supplied
PowerSync row. It never calls `PrismaAccountRepository.persist`, so it bypasses
`AccountProfile.validate()` entirely.

The reported stored key order (`bio, gender, birthday, nickname, realName,
avatarUrl`) matches PostgreSQL `jsonb` ordering (shorter keys first, then
lexicographic), not the insertion order of `AccountProfile.createDefault`
(`nickname, gender, realName, avatarUrl, bio, birthday`). This is consistent
with a raw JSON write into the `jsonb` column and rules out `createDefault` as
the producer of the null value.

Paths checked and found safe:

- `createCloudAccountProvisioner` (`Account.create` → `AccountProfile.createDefault`)
- `PrismaAccountRepository.persist` (writes a validated domain DTO)
- `AccountProfilePortableCapability.apply` (portable schema + `AccountProfile.create`)
- Desktop local account creation (`DesktopProfileRuntimeManager.ensureLocalAccount`)
- Desktop profile sync updates (`UpdateAccountProfileUseCase` + domain repository)
- Snapshot builder / hydration (reads SQLite files; no PostgreSQL account writes)

Search scope: `nickname` across `packages/account`, `packages/account-contracts`,
`packages/data-portability`, `apps/api`, `apps/desktop`;
`account_profile_sync` / `ps_data_local__account_profile_sync`; every direct
`prisma.account.*` write; every `INSERT/UPDATE accounts` statement; and all zod
schemas with nullable/default nickname. No in-repo producer of
`nickname: null` was found. The client-side origin is therefore likely a legacy
local row or a client build not present in this repository state. The
server-side persistence hole above is real, and it is now fenced.

## Changes

### `packages/account-contracts`

- `src/value-objects/account-profile.ts`: added the shared nickname invariant
  (`ACCOUNT_NICKNAME_MIN_LENGTH`, `ACCOUNT_NICKNAME_MAX_LENGTH`,
  `DEFAULT_ACCOUNT_NICKNAME`) and `normalizeAccountNickname(value: unknown)`.
  Non-strings become `User`; strings longer than 20 are truncated; strings
  shorter than 2 become `User`.
- `src/value-objects/index.ts`: exported the new runtime values.
- `src/portable-v3.ts`: the portable schema now uses the same min/max constants
  (still non-nullable, not loosened).

### `packages/account`

- `src/server/domain/value-objects/account-profile.ts`:
  - `validate()` checks `typeof props.nickname === 'string'` before reading
    `.length`, so null/undefined/wrong types throw a domain `Error`
    (`Nickname must be a string`) instead of a raw `TypeError`.
  - `createDefault()` delegates to `normalizeAccountNickname`, keeping the
    existing `User` fallback and 20-char cap.
  - Added `normalizeStoredAccountProfile(profile: unknown)`, which returns a
    complete DTO: nickname normalized, missing optional fields as `null`,
    missing gender as `PreferNotToSay`, and a null/missing profile as a usable
    default. Used by both mappers.
- `src/server/domain/value-objects/index.ts`: exported
  `normalizeStoredAccountProfile`.
- `src/server/infrastructure/adapters/prisma/mappers/account-prisma.mapper.ts`
  and `.../powersync/mappers/account-powersync.mapper.ts`: both call
  `normalizeStoredAccountProfile` before `AccountProfile.create`.
- `src/server/application/account-portability.ts`: the preserved-fields check
  now compares each current field with `AccountProfile.createDefault('').toDTO()`.
  Since the domain nickname is never null after normalization, the old
  `current[field] === null` branch is gone. A field is "default" exactly when it
  matches the createDefault baseline (`User`, `PreferNotToSay`, or `null`).
  No null safety check was retained because the portable schema and the
  normalized domain both guarantee a string nickname.

### `apps/api`

- `src/modules/powersync/crud-normalization.ts`: `accounts.profile` values are
  normalized at the upload boundary before Prisma sees them. Null/missing/
  non-object profiles become `{ nickname: 'User' }`; object profiles keep all
  other fields and get a valid nickname. Valid nicknames pass through unchanged.
  This mirrors the account-contracts invariant locally because `apps/api` does
  not depend on `@memoflow/account-contracts` directly (avoids adding a new
  package dependency for a small write guard).

## Legacy null rows

No database migration and no stored-data contract change. Legacy rows keep
their stored JSON untouched. Both repository mappers normalize in memory at
construction time, so `findById`, `findAll`, `planProfileImport`, and the
desktop PowerSync repository all read a valid non-null nickname. The PowerSync
upload boundary prevents new invalid rows from reaching PostgreSQL.

## Regression tests added

- `packages/account/src/server/domain/value-objects/__tests__/account-profile.spec.ts`:
  null/undefined/number nickname throws a domain error; stored null/missing
  profile normalizes to `User`/`PreferNotToSay`; valid nickname unchanged.
- `.../prisma/mappers/account-prisma.mapper.spec.ts`: stored null nickname and
  null profile map to a usable account.
- `.../powersync/account-powersync.repository.spec.ts`: `findById` on a row
  with `nickname: null` returns `User`.
- `.../application/account-portability.spec.ts`: `planProfileImport` against a
  mapper-created account with a stored null nickname completes and plans the
  target profile without throwing.
- `.../cloud-account-provisioner.spec.ts`: empty name + unusable email prefix
  still produces a non-empty nickname.
- `apps/api/src/modules/powersync/crud-normalization.spec.ts`: null nickname,
  null profile, valid nickname, and the Prisma upsert argument are all covered.

## Verification

Run from the repository root:

- `pnpm exec vitest run --config packages/account/vitest.config.ts <focused specs>` — 58 passed.
- `pnpm exec vitest run --config apps/api/vitest.config.ts apps/api/src/modules/powersync/crud-normalization.spec.ts` — 17 passed.
- `pnpm nx run account-contracts:test` — 5 files, 19 tests passed.
- `pnpm nx run account:test` — 26 files, 193 tests passed.
- `pnpm nx run api:test` — 64 files, 311 tests passed.
- `pnpm nx run account-contracts:typecheck` — passed.
- `pnpm nx run account:typecheck` — passed.
- `pnpm nx run api:typecheck` — passed.
- `pnpm nx run account-contracts:lint` — 0 problems.
- `pnpm nx run account:lint` — 0 errors, 25 pre-existing warnings.
- `pnpm nx run api:lint` — 0 problems.
- `node tools/quality/fmt.mjs --check --all` — 6050 checked, 0 different.
- `pnpm test:inventory:check` — 1432 files, current (no test files added or removed).
