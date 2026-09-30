import { z } from 'zod';

/** Release channel selected by the Desktop Update runtime. Phase 1 exposes stable only. */
export const DesktopUpdateChannelSchema = z.enum(['stable', 'beta', 'canary']);
export type DesktopUpdateChannelDTO = z.infer<typeof DesktopUpdateChannelSchema>;

/** Distinguishes a user-requested operation from silent shell-owned background work. */
export const DesktopUpdateIntentSchema = z.enum(['background', 'explicit']);
export type DesktopUpdateIntentDTO = z.infer<typeof DesktopUpdateIntentSchema>;

/** Identifies who owns installation/update authority for this installed copy. */
export const DesktopInstallationOwnerSchema = z.enum([
  'memoflow-direct',
  'system-store',
  'package-manager',
  'portable',
  'enterprise-managed',
  'unsupported',
]);
export type DesktopInstallationOwnerDTO = z.infer<typeof DesktopInstallationOwnerSchema>;

export const DesktopUpdateInstallAuthoritySchema = z.enum([
  'memoflow',
  'system',
  'package-manager',
  'administrator',
  'none',
]);
export type DesktopUpdateInstallAuthorityDTO = z.infer<typeof DesktopUpdateInstallAuthoritySchema>;

/** Renderer-safe capabilities derived from installation ownership by the shell. */
export const DesktopUpdateCapabilitiesSchema = z
  .object({
    canCheck: z.boolean(),
    canBackgroundCheck: z.boolean(),
    canDownload: z.boolean(),
    canSelfInstall: z.boolean(),
    canAutoDownload: z.boolean(),
    installAuthority: DesktopUpdateInstallAuthoritySchema,
  })
  .strict();
export type DesktopUpdateCapabilitiesDTO = z.infer<typeof DesktopUpdateCapabilitiesSchema>;

/** Provider-neutral release metadata safe to expose across the preload boundary. */
export const DesktopUpdateReleaseSchema = z
  .object({
    version: z.string().min(1),
    channel: DesktopUpdateChannelSchema,
    publishedAt: z.string().datetime().nullable(),
    releaseNotes: z.string().nullable(),
    releaseNotesUrl: z.string().url().nullable(),
  })
  .strict();
export type DesktopUpdateReleaseDTO = z.infer<typeof DesktopUpdateReleaseSchema>;

export const DesktopUpdateProgressSchema = z
  .object({
    percent: z.number().finite().min(0).max(100),
    transferredBytes: z.number().finite().nonnegative(),
    totalBytes: z.number().finite().nonnegative(),
    bytesPerSecond: z.number().finite().nonnegative(),
  })
  .strict();
export type DesktopUpdateProgressDTO = z.infer<typeof DesktopUpdateProgressSchema>;

export const DesktopUpdateOperationSchema = z.enum([
  'initialize',
  'check',
  'download',
  'prepare',
  'install',
]);
export type DesktopUpdateOperationDTO = z.infer<typeof DesktopUpdateOperationSchema>;

export const DesktopUpdateFailureCodeSchema = z.enum([
  'network-unavailable',
  'feed-unavailable',
  'invalid-metadata',
  'unsupported-installation',
  'signature-invalid',
  'checksum-mismatch',
  'download-failed',
  'prepare-failed',
  'shutdown-failed',
  'install-receipt-failed',
  'install-handoff-failed',
  'release-superseded',
  'unknown',
]);
export type DesktopUpdateFailureCodeDTO = z.infer<typeof DesktopUpdateFailureCodeSchema>;

export const DesktopUpdateFailureSchema = z
  .object({
    code: DesktopUpdateFailureCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();
export type DesktopUpdateFailureDTO = z.infer<typeof DesktopUpdateFailureSchema>;

export const DesktopUpdateDisableReasonSchema = z.enum([
  'development-build',
  'updates-disabled',
  'unsupported-installation',
  'managed-externally',
  'missing-configuration',
  'invalid-configuration',
]);
export type DesktopUpdateDisableReasonDTO = z.infer<typeof DesktopUpdateDisableReasonSchema>;

export const DesktopUpdateOutcomeSchema = z.enum(['up-to-date', 'update-available', 'failed']);
export type DesktopUpdateOutcomeDTO = z.infer<typeof DesktopUpdateOutcomeSchema>;

const UninitializedDesktopUpdateStateSchema = z.object({
  type: z.literal('uninitialized'),
});

const DisabledDesktopUpdateStateSchema = z.object({
  type: z.literal('disabled'),
  reason: DesktopUpdateDisableReasonSchema,
});

const IdleDesktopUpdateStateSchema = z.object({
  type: z.literal('idle'),
  currentVersion: z.string().min(1),
  lastCheckedAt: z.string().datetime().nullable(),
  lastOutcome: DesktopUpdateOutcomeSchema.nullable(),
});

const CheckingDesktopUpdateStateSchema = z.object({
  type: z.literal('checking'),
  intent: DesktopUpdateIntentSchema,
  startedAt: z.string().datetime(),
});

const AvailableDesktopUpdateStateSchema = z.object({
  type: z.literal('available'),
  intent: DesktopUpdateIntentSchema,
  release: DesktopUpdateReleaseSchema,
  autoDownloadEligible: z.boolean(),
});

const DownloadingDesktopUpdateStateSchema = z.object({
  type: z.literal('downloading'),
  intent: DesktopUpdateIntentSchema,
  release: DesktopUpdateReleaseSchema,
  progress: DesktopUpdateProgressSchema,
});

const DownloadedDesktopUpdateStateSchema = z.object({
  type: z.literal('downloaded'),
  intent: DesktopUpdateIntentSchema,
  release: DesktopUpdateReleaseSchema,
});

const PreparingDesktopUpdateStateSchema = z.object({
  type: z.literal('preparing'),
  intent: DesktopUpdateIntentSchema,
  release: DesktopUpdateReleaseSchema,
});

const ReadyDesktopUpdateStateSchema = z.object({
  type: z.literal('ready'),
  intent: DesktopUpdateIntentSchema,
  release: DesktopUpdateReleaseSchema,
});

const RestartingDesktopUpdateStateSchema = z.object({
  type: z.literal('restarting'),
  release: DesktopUpdateReleaseSchema,
});

const FailedDesktopUpdateStateSchema = z.object({
  type: z.literal('failed'),
  operation: DesktopUpdateOperationSchema,
  failure: DesktopUpdateFailureSchema,
  recoverableTo: z.enum(['idle', 'available', 'ready']),
  release: DesktopUpdateReleaseSchema.optional(),
});

/**
 * Canonical renderer-safe Desktop Update state (ADR-112).
 *
 * The discriminant owns field validity: renderer code must not reconstruct
 * update state from independent booleans or third-party updater events.
 */
export const DesktopUpdateStateSchema = z.discriminatedUnion('type', [
  UninitializedDesktopUpdateStateSchema.strict(),
  DisabledDesktopUpdateStateSchema.strict(),
  IdleDesktopUpdateStateSchema.strict(),
  CheckingDesktopUpdateStateSchema.strict(),
  AvailableDesktopUpdateStateSchema.strict(),
  DownloadingDesktopUpdateStateSchema.strict(),
  DownloadedDesktopUpdateStateSchema.strict(),
  PreparingDesktopUpdateStateSchema.strict(),
  ReadyDesktopUpdateStateSchema.strict(),
  RestartingDesktopUpdateStateSchema.strict(),
  FailedDesktopUpdateStateSchema.strict(),
]);
export type DesktopUpdateStateDTO = z.infer<typeof DesktopUpdateStateSchema>;

/** Replayable renderer snapshot; GET_SNAPSHOT and STATE_CHANGED share this exact payload. */
export const DesktopUpdateSnapshotSchema = z
  .object({
    state: DesktopUpdateStateSchema,
    currentVersion: z.string().min(1),
    channel: DesktopUpdateChannelSchema,
    owner: DesktopInstallationOwnerSchema,
    capabilities: DesktopUpdateCapabilitiesSchema,
  })
  .strict();
export type DesktopUpdateSnapshotDTO = z.infer<typeof DesktopUpdateSnapshotSchema>;
