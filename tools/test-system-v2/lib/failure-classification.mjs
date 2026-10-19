export function classifyFailure({
  exitCode = 1,
  signal = null,
  timedOut = false,
  output = '',
  spawnError = null,
} = {}) {
  if (timedOut) return 'timeout';
  if (signal) return 'process-crash';
  if (spawnError) return 'infrastructure';
  // Test names and fixtures are descriptive text, not evidence of process failure.
  if (exitCode === 0) return 'success';
  const text = String(output);
  if (/SIG(?:SEGV|ABRT|BUS)|segmentation fault|native crash/i.test(text)) return 'process-crash';
  if (
    /startup|spawn|ENOENT|ECONNREFUSED|failed to connect|docker daemon|cannot find module/i.test(
      text,
    )
  )
    return 'infrastructure';
  if (/flaky|unstable|flake/i.test(text)) return 'flaky';
  return 'assertion';
}
