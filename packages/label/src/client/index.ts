import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { LabelChannels } from '@memoflow/contracts/electron';
import type {
  CreateLabelReq,
  LabelClientDTO,
  LabelDto,
  ListLabelsReq,
} from '@memoflow/label-contracts';
import type { Result } from '@memoflow/contracts/result';

export interface LabelClientPort {
  listLabels(request?: ListLabelsReq): Promise<Result<LabelClientDTO[]>>;
  createLabel(request: CreateLabelReq): Promise<Result<LabelClientDTO>>;
}

export function toLabelClientDTO(label: LabelDto): LabelClientDTO {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt,
    updatedAt: label.updatedAt,
  };
}

export function createLabelHttpClient(httpClient: IResultHttpClient): LabelClientPort {
  return {
    listLabels: (request = {}) => httpClient.get('/labels', { params: request }),
    createLabel: (request) => httpClient.post('/labels', request),
  };
}

export function createLabelIpcClient(ipcClient: IResultIpcClient): LabelClientPort {
  return {
    listLabels: (request = {}) => ipcClient.invoke(LabelChannels.LIST, request),
    createLabel: (request) => ipcClient.invoke(LabelChannels.CREATE, request),
  };
}
