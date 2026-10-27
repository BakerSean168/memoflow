/**
 * Residual 997: sole lastArg helper for AI IPC stream adapters.
 * Assistant + message IPC adapters import this; local duals retired.
 * Returns the last variadic IPC push argument (payload) when present.
 */

export function lastArg<T>(args: unknown[]): T | undefined {
  return args.length > 0 ? (args[args.length - 1] as T | undefined) : undefined;
}
