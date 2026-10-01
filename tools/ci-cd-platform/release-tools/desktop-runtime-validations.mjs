const EXECUTABLE_KINDS = Object.freeze({
  'windows-x64': ['packaged-exe'],
  'linux-x64': ['installed-deb', 'packaged-appimage'],
  'macos-x64': ['packaged-app'],
  'macos-arm64': ['packaged-app'],
});

/** Validate every proof before selecting one; only absent arrays permit legacy fallback. */
export function validateDesktopRuntimeValidations(evidence, platform) {
  const proofs = Object.hasOwn(evidence, 'runtimeValidations')
    ? evidence.runtimeValidations
    : [evidence.runtimeValidation];
  const allowed = EXECUTABLE_KINDS[platform];
  const kinds = new Set();
  if (!allowed || !Array.isArray(proofs) || proofs.length === 0) {
    throw new Error(`Desktop platform runtime validation missing or failed: ${platform}`);
  }
  for (const proof of proofs) {
    if (
      proof?.status !== 'passed' ||
      proof.method !== 'packaged-electron-playwright' ||
      !allowed.includes(proof.executableKind) ||
      kinds.has(proof.executableKind)
    ) {
      throw new Error(`Desktop platform runtime validation missing or failed: ${platform}`);
    }
    kinds.add(proof.executableKind);
  }
  return proofs;
}
