# Evidence: Transactional email Phase B/C/D (2026-07-29)

## Scope

Finish residual work from `docs/plan/active/2026-07-28-transactional-email-smtp.md`:

- Phase B: guides + security-closure §3.5 cross-links
- Phase D: Redis challenge store, i18n templates, Resend, secondary SMTP failover
- Phase C: checklist / evidence (live Brevo already done in Phase A session)

## Code

| Area            | Path                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| Redis challenge | `redis-verification-challenge-store.ts`, `create-verification-challenge-store.ts`  |
| Shared policy   | `verification-challenge-constants.ts` (memory + redis)                             |
| Templates       | `email-templates.ts` (zh \| en via SMTP_LOCALE)                                    |
| Resend          | `resend-email-sender.ts`                                                           |
| Failover        | `failover-email-sender.ts` + `SMTP_SECONDARY_*`                                    |
| Factory         | `create-email-sender.ts` (`console` \| `smtp` \| `resend`)                         |
| Wiring          | `authentication.module.ts`, `prisma.ts`, `api/module.ts`, `apps/api/main.ts`       |
| Redis client    | `apps/api/.../redis/create-redis-client.ts` (only if `AUTH_CHALLENGE_STORE=redis`) |
| Env             | `env.schema.ts`, `.env.example`                                                    |

## Docs

- `docs/guides/development/transactional-email-smtp.md` (new)
- `docs/guides/development/README.md`, `local.docker.md`
- `docs/plan/active/2026-07-17-auth-account-security-closure.md` §3.5
- Plan §12 checklist + Phase B/D marked done; active README updated
- `docs/product/modules/authentication.md` note

## Tests

```text
pnpm nx run authentication:test
# Test Files  49 passed (49)
# Tests       423 passed (423)
```

Covered: memory challenge, redis fake-client challenge, smtp/resend/failover factories, dual-capture, template locales.

## Live send (Phase C, prior session)

- Brevo SMTP via gitignored `.env.production.local`
- local-docker register → SMTP accept → last-email-code dual-write → verify

## Defaults unchanged

- `EMAIL_PROVIDER` unset → console
- `AUTH_CHALLENGE_STORE` unset → memory
- No NODE_ENV-based provider inference
