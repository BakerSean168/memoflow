import { describe, expect, it, vi } from 'vitest';
import { createLazyService } from './lazy-service';

interface ExampleService {
  greet(name: string): string;
  getCalls(): number;
}

function createExampleService(): ExampleService {
  return {
    calls: 0,
    greet(this: ExampleService & { calls: number }, name: string) {
      this.calls += 1;
      return `hello ${name}`;
    },
    getCalls(this: ExampleService & { calls: number }) {
      return this.calls;
    },
  } as ExampleService;
}

describe('createLazyService', () => {
  it('does not resolve the factory until a service method is called', () => {
    const factory = vi.fn(createExampleService);
    createLazyService<ExampleService>(factory);

    expect(factory).not.toHaveBeenCalled();
  });

  it('shares one pending factory call across concurrent method invocations', async () => {
    let resolveFactory: ((service: ExampleService) => void) | undefined;
    const factory = vi.fn(
      () =>
        new Promise<ExampleService>((resolve) => {
          resolveFactory = resolve;
        }),
    );
    const service = createLazyService<ExampleService>(factory);

    const firstGreeting = service.greet('Ada') as unknown as Promise<string>;
    const secondGreeting = service.greet('Grace') as unknown as Promise<string>;
    resolveFactory?.(createExampleService());

    await expect(firstGreeting).resolves.toBe('hello Ada');
    await expect(secondGreeting).resolves.toBe('hello Grace');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('reuses the resolved service instance and preserves method this binding', async () => {
    const factory = vi.fn(createExampleService);
    const service = createLazyService<ExampleService>(factory);

    await expect(service.greet('Ada') as unknown as Promise<string>).resolves.toBe('hello Ada');
    await expect(service.greet('Grace') as unknown as Promise<string>).resolves.toBe('hello Grace');
    await expect(service.getCalls() as unknown as Promise<number>).resolves.toBe(2);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('clears pending initialization after a factory failure so a later call can retry', async () => {
    const factory = vi
      .fn<[], Promise<ExampleService>>()
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockResolvedValueOnce(createExampleService());
    const service = createLazyService<ExampleService>(factory);

    await expect(service.greet('Ada') as unknown as Promise<string>).rejects.toThrow(
      'bootstrap failed',
    );
    await expect(service.greet('Grace') as unknown as Promise<string>).resolves.toBe('hello Grace');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('does not expose a then property, so the proxy is not treated as a promise', () => {
    const service = createLazyService<ExampleService>(createExampleService);

    expect('then' in service).toBe(false);
    expect((service as unknown as { then?: unknown }).then).toBeUndefined();
  });
});
