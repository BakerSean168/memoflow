# Testing and checks

Use the smallest test that proves the change, then promote verification only when crossing a boundary.

```bash
# During implementation
pnpm exec vitest run <path/to/file.test.ts>
pnpm nx run <project>:test

# Before pushing a code change
pnpm check:changed

# Documentation/governance changes
pnpm nx run memoflow:docs-check
pnpm nx run memoflow:governance-check
```

When applicable, use targeted tests instead of a whole-repository run:

- Database/Prisma: `pnpm nx run <project>:test:integration`; shared local test DB suites must not run concurrently.
- HTTP/API route: `pnpm nx run api:test:smoke`.
- Electron main/IPC: `pnpm nx run desktop:test:main` or `desktop:test:ipc`.
- Web journey: `pnpm nx run web:e2e` (canonical core flows); synchronization: `web:e2e:sync`.
- Storybook/browser component interactions: use the target declared by the component package.
- Coverage and performance: use the governed Nx targets only when the change requires them.

PR CI uses an affected manifest and a required aggregate `CI Check`; Main and scheduled workflows own broader verification. See [testing internals](../internals/testing/README.md), `.github/workflows/ci.yml` and `tools/test-system-v2/` for exact ownership. Do not duplicate job lists or test counts in this guide.
