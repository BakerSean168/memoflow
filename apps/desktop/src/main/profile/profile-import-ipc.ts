import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  DesktopProfileImportChannels,
  DesktopProfileImportTargetSchema,
  DesktopProfileImportPrepareSchema,
  DesktopProfileImportCommitSchema,
  DesktopProfileImportOperationRequestSchema,
} from '@memoflow/contracts/electron';
import { ok, fail, ResultErrorException } from '@memoflow/contracts/result';
import type { DesktopProfileImportService } from './desktop-profile-import-service';

export function registerProfileImportIpc(service: DesktopProfileImportService): void {
  function handle<T>(
    channel: string,
    schema: z.ZodType<T>,
    execute: (input: T) => Promise<unknown>,
  ) {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const input = schema.safeParse(raw);
      if (!input.success) return fail({ code: 'INVALID_REQUEST', message: '导入请求无效' });
      try {
        return ok(await execute(input.data));
      } catch (error) {
        const code = error instanceof ResultErrorException ? error.code : 'PROFILE_IMPORT_FAILED';
        return fail({ code, message: '此步骤尚未完成。请从导入记录恢复并查看核验或清理状态。' });
      }
    });
  }
  handle(DesktopProfileImportChannels.LIST, DesktopProfileImportTargetSchema, (input) =>
    service.list(input.targetProfileId),
  );
  handle(DesktopProfileImportChannels.PREPARE, DesktopProfileImportPrepareSchema, (input) =>
    service.prepare(input),
  );
  handle(DesktopProfileImportChannels.COMMIT, DesktopProfileImportCommitSchema, (input) =>
    service.commit(input),
  );
  handle(
    DesktopProfileImportChannels.RECOVER,
    DesktopProfileImportOperationRequestSchema,
    (input) => service.recover(input),
  );
  handle(DesktopProfileImportChannels.CONSUME_PROMPT, DesktopProfileImportTargetSchema, (input) =>
    service.consumePrompt(input.targetProfileId),
  );
}
