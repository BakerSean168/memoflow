// Repository patterns - base repository and query objects
// To be populated with BaseRepository and QueryObject

/**
 * Base repository interface for data access
 */
export interface IRepository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(item: T): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

/**
 * Query object for filtering and pagination
 */
export interface IQuery {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

// DDD Aggregate Repository Base
export {
  AggregateRepositoryBase,
  publishAggregateEvents,
  type IAggregateRepository,
} from './aggregate-repository.base';
