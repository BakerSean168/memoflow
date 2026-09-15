/**
 * Local Vault contracts for the per-profile Desktop knowledge source.
 *
 * ADR-089: binding lifecycle is durable user choice; filesystem health is an
 * observation. Cloud identity is intentionally absent from the binding.
 */

import { z } from 'zod';
import { brandedId, ID_PREFIXES } from '../../../primitives';
import type { KnowledgeSpaceId, LocalVaultBindingId } from '../../../primitives';
import { KnowledgeDocumentIdSchema } from './knowledge-document-identity';

export const LocalVaultBindingClientDTOSchema = z
  .object({
    id: brandedId<LocalVaultBindingId>(ID_PREFIXES.LocalVaultBindingId),
    knowledgeSpaceId: brandedId<KnowledgeSpaceId>(ID_PREFIXES.KnowledgeSpaceId),
    /** Host-owned stable Desktop profile id; never a cloud account identity. */
    localProfileId: z.string().min(1),
    /** Canonical absolute filesystem path to the selected Vault root. */
    rootPath: z.string().min(1),
    displayName: z.string().min(1),
    boundAt: z.number(),
    detachedAt: z.number().nullable(),
  })
  .strict();
export type LocalVaultBindingClientDTO = z.infer<typeof LocalVaultBindingClientDTOSchema>;

export const LocalVaultHealthStateSchema = z.enum(['Available', 'Missing', 'Unreadable']);
export type LocalVaultHealthState = z.infer<typeof LocalVaultHealthStateSchema>;

export const LocalVaultHealthDTOSchema = z
  .object({
    bindingId: brandedId<LocalVaultBindingId>(ID_PREFIXES.LocalVaultBindingId),
    state: LocalVaultHealthStateSchema,
    observedAt: z.number(),
    detail: z.string().nullable(),
  })
  .strict();
export type LocalVaultHealthDTO = z.infer<typeof LocalVaultHealthDTOSchema>;

/** Read model combining the durable binding with the latest filesystem observation. */
export const LocalVaultBindingSnapshotDTOSchema = z
  .object({
    binding: LocalVaultBindingClientDTOSchema,
    health: LocalVaultHealthDTOSchema,
  })
  .strict();
export type LocalVaultBindingSnapshotDTO = z.infer<typeof LocalVaultBindingSnapshotDTOSchema>;

// Residual 795: select vault Req dual retired — sole ReqSchema + z.infer.
export const SelectLocalVaultReqSchema = z.object({
  /** Optional picker starting point. The renderer cannot bind an arbitrary path directly. */
  suggestedPath: z.string().optional(),
});
export type SelectLocalVaultReq = z.infer<typeof SelectLocalVaultReqSchema>;

export const LocalVaultNoteSummaryDTOSchema = z.object({
  relativePath: z.string(),
  knowledgeDocumentId: KnowledgeDocumentIdSchema.nullable(),
  title: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()),
  outgoingLinks: z.array(z.string()),
  size: z.number(),
  updatedAt: z.number(),
});
export type LocalVaultNoteSummaryDTO = z.infer<typeof LocalVaultNoteSummaryDTOSchema>;

export const LocalVaultNoteDTOSchema = LocalVaultNoteSummaryDTOSchema.extend({
  contentMarkdown: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
});
export type LocalVaultNoteDTO = z.infer<typeof LocalVaultNoteDTOSchema>;

// Residual 793: scan Res dual retired — sole ResSchema + z.infer.
export const ScanLocalVaultResSchema = z.object({
  binding: LocalVaultBindingClientDTOSchema,
  health: LocalVaultHealthDTOSchema,
  notes: z.array(LocalVaultNoteSummaryDTOSchema),
  scannedAt: z.number(),
});
export type ScanLocalVaultRes = z.infer<typeof ScanLocalVaultResSchema>;

// Residual 795: read note Req dual retired — sole ReqSchema + z.infer.
export const ReadLocalVaultNoteReqSchema = z.object({
  relativePath: z.string(),
});
export type ReadLocalVaultNoteReq = z.infer<typeof ReadLocalVaultNoteReqSchema>;

export type ReadLocalVaultNoteRes = LocalVaultNoteDTO;

// Residual 795: search vault Req dual retired — sole ReqSchema + z.infer.
export const SearchLocalVaultReqSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});
export type SearchLocalVaultReq = z.infer<typeof SearchLocalVaultReqSchema>;

export const LocalVaultSearchMatchDTOSchema = z.object({
  lineNumber: z.number(),
  lineContent: z.string(),
  startIndex: z.number(),
  endIndex: z.number(),
});
export type LocalVaultSearchMatchDTO = z.infer<typeof LocalVaultSearchMatchDTOSchema>;

export const LocalVaultSearchResultDTOSchema = z.object({
  note: LocalVaultNoteSummaryDTOSchema,
  matches: z.array(LocalVaultSearchMatchDTOSchema),
});
export type LocalVaultSearchResultDTO = z.infer<typeof LocalVaultSearchResultDTOSchema>;

// Residual 793: search Res dual retired — sole ResSchema + z.infer.
export const SearchLocalVaultResSchema = z.object({
  query: z.string(),
  results: z.array(LocalVaultSearchResultDTOSchema),
});
export type SearchLocalVaultRes = z.infer<typeof SearchLocalVaultResSchema>;

// Residual 795: open-in-obsidian req dual retired — sole ReqSchema + z.infer.
export const OpenLocalVaultInObsidianReqSchema = z.object({
  relativePath: z.string().optional(),
});
export type OpenLocalVaultInObsidianReq = z.infer<typeof OpenLocalVaultInObsidianReqSchema>;

// Residual 795: confirmed write req dual retired — sole ReqSchema + z.infer.
export const ConfirmedLocalVaultWriteReqSchema = z.object({
  relativePath: z.string(),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  contentMarkdown: z.string(),
  proposalId: z.string(),
  proposalRevision: z.number(),
  requestId: z.string(),
});
export type ConfirmedLocalVaultWriteReq = z.infer<typeof ConfirmedLocalVaultWriteReqSchema>;

// Residual 793: confirmed write Res dual retired — sole ResSchema + z.infer.
export const ConfirmedLocalVaultWriteResSchema = z.object({
  note: LocalVaultNoteDTOSchema,
  created: z.boolean(),
});
export type ConfirmedLocalVaultWriteRes = z.infer<typeof ConfirmedLocalVaultWriteResSchema>;
