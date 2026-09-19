import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PrismaClient } from '@memoflow/database';
import type { DataPortabilityApiModuleContext } from '@memoflow/data-portability/api';

vi.mock('@memoflow/data-portability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/data-portability')>();
  return {
    ...actual,
    createDataPortabilityModule: vi.fn(actual.createDataPortabilityModule),
    createPrismaServerHeldDataDisclosureApplicationPort: vi.fn(
      actual.createPrismaServerHeldDataDisclosureApplicationPort,
    ),
  };
});

vi.mock('@memoflow/data-portability/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/data-portability/api')>();
  return { ...actual, createDataPortabilityApiModule: vi.fn(actual.createDataPortabilityApiModule) };
});

import { composeDataPortability } from './compose-data-portability';
import {
  createDataPortabilityModule,
  createPrismaServerHeldDataDisclosureApplicationPort,
} from '@memoflow/data-portability';
import { createDataPortabilityApiModule } from '@memoflow/data-portability/api';

const fakeDb = {} as unknown as PrismaClient;
const portableReceipt = { created: 0, updated: 0, skipped: 1, warnings: [] } as const;
const portableCapabilities = [
  {
    key: 'preferences',
    schemaVersion: 3,
    payloadSchema: z.object({}).strict(),
    export: vi.fn(async () => ({})),
    dryRun: vi.fn(async () => portableReceipt),
    apply: vi.fn(async () => portableReceipt),
  },
] as const;

describe('composeDataPortability V3 assembly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assembles only owner capabilities plus the disclosure-only Prisma port', () => {
    composeDataPortability({ db: fakeDb, portableCapabilities });
    expect(createPrismaServerHeldDataDisclosureApplicationPort).toHaveBeenCalledWith(fakeDb);
    expect(createDataPortabilityModule).toHaveBeenCalledWith({
      portableCapabilities,
      productVersion: '0.0.1',
    });
    expect(createDataPortabilityApiModule).toHaveBeenCalledWith({
      instance: createDataPortabilityModule.mock.results[0]!.value,
      serverHeldDataDisclosureApi:
        createPrismaServerHeldDataDisclosureApplicationPort.mock.results[0]!.value,
    });
  });

  it('registers the supplied V3 capabilities in the module-owned registry', () => {
    composeDataPortability({ db: fakeDb, portableCapabilities });
    const instance = createDataPortabilityModule.mock.results[0]!.value;
    expect(instance.portableCapabilityRegistry.list()).toMatchObject([
      { key: 'preferences', schemaVersion: 3 },
    ]);
  });

  it('returns the API handle and disclosure port', () => {
    const composed = composeDataPortability({ db: fakeDb });
    expect(composed.module).toMatchObject({ name: 'DataPortability' });
    expect(composed.serverHeldDataDisclosureApi).toBe(
      createPrismaServerHeldDataDisclosureApplicationPort.mock.results[0]!.value,
    );
  });

  it('mounts and starts the V3 transport instance', () => {
    const composed = composeDataPortability({ db: fakeDb });
    const instance = createDataPortabilityModule.mock.results[0]!.value;
    const start = vi.spyOn(instance, 'start');
    const dispose = vi.spyOn(instance, 'dispose');
    const routerUse = vi.fn();
    const context: DataPortabilityApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: { auth: vi.fn(), requireRole: vi.fn(() => vi.fn()) },
      openApiRegistry: undefined,
    };

    composed.module.register(context);
    expect(routerUse).toHaveBeenCalledWith('/data-portability', expect.anything());
    expect(start).toHaveBeenCalledOnce();
    composed.module.destroy?.();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('composeDataPortability layering boundary', () => {
  it('does not reference retired persistence-shaped portability seams', () => {
    const composer = readFileSync(resolve(__dirname, './compose-data-portability.ts'), 'utf8');
    expect(composer).toContain("from '@memoflow/data-portability'");
    expect(composer).toContain("from '@memoflow/data-portability/api'");
    expect(composer).toContain('portableCapabilities');
    expect(composer).not.toMatch(/\bDataPortability(?:Dependencies|ImportStore)\b/);
    expect(composer).not.toMatch(/PowerSync|new Prisma.*Adapter/);
  });
});
