/**
 * Account Module - Domain Server
 *
 * Aggregate roots, repository interfaces, and domain services.
 */

// Aggregates
export { Account } from './aggregates/account';
export type { AccountState } from './aggregates/account';

// Repositories
export { type IAccountRepository } from './repositories/i-account-repository';
export {
  type IAccountClosureOperationRepository,
  type AccountClosureOperationRecord,
  type AccountClosurePhase,
  type AccountClosureStatus,
} from './repositories/i-account-closure-operation-repository';
