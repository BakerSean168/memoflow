import type {
  ExportServerHeldDataDisclosureReq,
  ExportServerHeldDataDisclosureRes,
} from '@memoflow/data-portability-contracts';

/**
 * Server-only disclosure surface. It is deliberately separate from the
 * importable export/import application port.
 */
export interface ServerHeldDataDisclosureApplicationPort {
  exportServerHeldDataDisclosure(
    identityId: string,
    request: ExportServerHeldDataDisclosureReq,
  ): Promise<ExportServerHeldDataDisclosureRes>;
}
