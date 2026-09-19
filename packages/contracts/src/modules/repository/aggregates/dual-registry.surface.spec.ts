/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 2 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: local-vault-req-dual.surface.spec.ts, local-vault-res-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from local-vault-req-dual.surface.spec.ts ---
{
  /**
   * Residual 795: local vault Req dual bodies retired.
   * Sole *ReqSchema + z.infer (select/read/search/open/confirmed-write).
   */
  describe('local vault req duals retired (residual 795)', () => {
    const source = readFileSync(resolve(__dirname, 'local-vault-binding.ts'), 'utf8');

    it('owns ReqSchema + z.infer aliases for all vault reqs', () => {
      expect(source).toContain('Residual 795');
      expect(source).toContain('export const SelectLocalVaultReqSchema = z.object({');
      expect(source).toContain(
        'export type SelectLocalVaultReq = z.infer<typeof SelectLocalVaultReqSchema>',
      );
      expect(source).toContain('export const ReadLocalVaultNoteReqSchema = z.object({');
      expect(source).toContain(
        'export type ReadLocalVaultNoteReq = z.infer<typeof ReadLocalVaultNoteReqSchema>',
      );
      expect(source).toContain('export const SearchLocalVaultReqSchema = z.object({');
      expect(source).toContain(
        'export type SearchLocalVaultReq = z.infer<typeof SearchLocalVaultReqSchema>',
      );
      expect(source).toContain('export const OpenLocalVaultInObsidianReqSchema = z.object({');
      expect(source).toContain(
        'export type OpenLocalVaultInObsidianReq = z.infer<typeof OpenLocalVaultInObsidianReqSchema>',
      );
      expect(source).toContain('export const ConfirmedLocalVaultWriteReqSchema = z.object({');
      expect(source).toContain(
        'export type ConfirmedLocalVaultWriteReq = z.infer<typeof ConfirmedLocalVaultWriteReqSchema>',
      );
    });

    it('drops Req interface dual bodies', () => {
      expect(source).not.toMatch(/export interface SelectLocalVaultReq\b/);
      expect(source).not.toMatch(/export interface ReadLocalVaultNoteReq\b/);
      expect(source).not.toMatch(/export interface SearchLocalVaultReq\b/);
      expect(source).not.toMatch(/export interface OpenLocalVaultInObsidianReq\b/);
      expect(source).not.toMatch(/export interface ConfirmedLocalVaultWriteReq\b/);
    });

    it('confirmed write req carries proposal ledger fields', () => {
      expect(source).toContain('proposalId: z.string()');
      expect(source).toContain('proposalRevision: z.number()');
      expect(source).toContain('requestId: z.string()');
      expect(source).toContain('contentMarkdown: z.string()');
      expect(source).toContain('relativePath: z.string()');
    });
  });
}

// --- merged from local-vault-res-dual.surface.spec.ts ---
{
  /**
   * Residual 793: Scan/Search/ConfirmedLocalVaultWrite Res dual bodies retired.
   * Nested DTO + Res use sole *Schema + z.infer (local-only vault transport).
   */
  describe('local vault res duals retired (residual 793)', () => {
    const source = readFileSync(resolve(__dirname, 'local-vault-binding.ts'), 'utf8');

    it('owns nested DTO schemas and ResSchema + z.infer aliases', () => {
      expect(source).toContain('Residual 793');
      expect(source).toContain('export const LocalVaultBindingClientDTOSchema');
      expect(source).toContain('export const LocalVaultHealthDTOSchema');
      expect(source).toContain('export const LocalVaultBindingSnapshotDTOSchema');
      expect(source).toContain('export const LocalVaultNoteSummaryDTOSchema = z.object({');
      expect(source).toContain(
        'export const LocalVaultNoteDTOSchema = LocalVaultNoteSummaryDTOSchema.extend({',
      );
      expect(source).toContain('export const ScanLocalVaultResSchema = z.object({');
      expect(source).toContain(
        'export type ScanLocalVaultRes = z.infer<typeof ScanLocalVaultResSchema>',
      );
      expect(source).toContain('export const SearchLocalVaultResSchema = z.object({');
      expect(source).toContain(
        'export type SearchLocalVaultRes = z.infer<typeof SearchLocalVaultResSchema>',
      );
      expect(source).toContain('export const ConfirmedLocalVaultWriteResSchema = z.object({');
      expect(source).toContain(
        'export type ConfirmedLocalVaultWriteRes = z.infer<typeof ConfirmedLocalVaultWriteResSchema>',
      );
    });

    it('drops Res/DTO interface dual bodies', () => {
      expect(source).not.toMatch(/export interface ScanLocalVaultRes\b/);
      expect(source).not.toMatch(/export interface SearchLocalVaultRes\b/);
      expect(source).not.toMatch(/export interface ConfirmedLocalVaultWriteRes\b/);
      expect(source).not.toMatch(/export interface LocalVaultBindingClientDTO\b/);
      expect(source).not.toMatch(/export interface LocalVaultNoteSummaryDTO\b/);
      expect(source).not.toMatch(/export interface LocalVaultNoteDTO\b/);
      expect(source).not.toMatch(/export interface LocalVaultSearchMatchDTO\b/);
      expect(source).not.toMatch(/export interface LocalVaultSearchResultDTO\b/);
    });

    it('separates durable local binding ownership from filesystem health', () => {
      expect(source).toContain('knowledgeSpaceId: brandedId<KnowledgeSpaceId>');
      expect(source).toContain('localProfileId: z.string().min(1)');
      expect(source).toContain('boundAt: z.number()');
      expect(source).toContain('detachedAt: z.number().nullable()');
      expect(source).not.toContain('identityId:');
      expect(source).not.toContain('obsidianVaultId');
      expect(source).not.toContain('lastScannedAt');
      expect(source).not.toContain("'Active'");
      expect(source).toContain("z.enum(['Available', 'Missing', 'Unreadable'])");
      expect(source).toContain('binding: LocalVaultBindingClientDTOSchema');
      expect(source).toContain('health: LocalVaultHealthDTOSchema');
    });

    it('nests binding/note schemas inside Res schemas', () => {
      expect(source).toContain('binding: LocalVaultBindingClientDTOSchema');
      expect(source).toContain('notes: z.array(LocalVaultNoteSummaryDTOSchema)');
      expect(source).toContain('results: z.array(LocalVaultSearchResultDTOSchema)');
      expect(source).toContain('note: LocalVaultNoteDTOSchema');
      expect(source).toContain('created: z.boolean()');
    });
  });
}
