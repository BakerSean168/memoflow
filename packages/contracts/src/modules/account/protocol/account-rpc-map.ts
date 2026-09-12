import type {
  CloseAccountReq,
  CloseAccountRes,
  GetAccountReq,
  GetAccountRes,
  UpdateAccountReq,
  UpdateAccountRes,
} from '../api';

/**
 * Account RPC Map
 */
export type AccountRpcMap = {
  'account:close': [CloseAccountReq, CloseAccountRes];
  'account:get-my-profile': [GetAccountReq, GetAccountRes];
  'account:update-profile': [UpdateAccountReq, UpdateAccountRes];
};
