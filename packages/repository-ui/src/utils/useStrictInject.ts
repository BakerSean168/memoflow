import { inject, type InjectionKey } from 'vue';

export function useStrictInject<T>(key: InjectionKey<T>, name?: string): T {
  const value = inject(key);
  if (value === undefined) {
    throw new Error(`[repository-ui] Missing injection: ${name ?? key.toString()}`);
  }
  return value;
}
