/**
 * Data Portability Controller
 *
 * Zod validation and use case orchestration.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import {
  ExportServerHeldDataDisclosureReqSchema,
  ExportPortableDataV3ReqSchema,
  PortableDataV3ImportReqSchema,
  type ExportServerHeldDataDisclosureRes,
  type ExportPortableDataV3Res,
  type PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';
import { formatZodErrors } from '@memoflow/utils/result';
import type {
  DataPortabilityApplicationPort,
  ServerHeldDataDisclosureApplicationPort,
} from '../application';

export class DataPortabilityController {
  constructor(private readonly api: DataPortabilityApplicationPort) {}

  async exportPortableDataV3(
    input: unknown,
    ctx: Context,
  ): Promise<Result<ExportPortableDataV3Res>> {
    const parsed = ExportPortableDataV3ReqSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return ok(await this.api.exportPortableDataV3(ctx.identityId, parsed.data));
  }

  async dryRunPortableDataV3(
    input: unknown,
    ctx: Context,
  ): Promise<Result<PortableDataV3ImportRes>> {
    const parsed = PortableDataV3ImportReqSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return ok(await this.api.dryRunPortableDataV3(ctx.identityId, parsed.data));
  }

  async applyPortableDataV3(
    input: unknown,
    ctx: Context,
  ): Promise<Result<PortableDataV3ImportRes>> {
    const parsed = PortableDataV3ImportReqSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return ok(await this.api.applyPortableDataV3(ctx.identityId, parsed.data));
  }
}

export class ServerHeldDataDisclosureController {
  constructor(private readonly api: ServerHeldDataDisclosureApplicationPort) {}

  async exportServerHeldDataDisclosure(
    input: unknown,
    ctx: Context,
  ): Promise<Result<ExportServerHeldDataDisclosureRes>> {
    const parsed = ExportServerHeldDataDisclosureReqSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return ok(await this.api.exportServerHeldDataDisclosure(ctx.identityId, parsed.data));
  }
}
