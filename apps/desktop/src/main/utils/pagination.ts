/**
 * Pagination Utilities
 *
 * Common pagination utilities for IPC Handlers and Repositories.
 * Provides types, constants, and helper functions for handling paginated data.
 *
 * @module utils/pagination
 */

// ============ Types ============

/**
 * Parameters for requesting paginated data.
 */
export interface PaginationParams {
  /** Page number (1-based). Defaults to 1. */
  page?: number;
  /** Number of items per page. Defaults to 20. */
  pageSize?: number;
  /** Field name to sort by. Defaults to 'createdAt'. */
  sortBy?: string;
  /** Sort direction ('asc' or 'desc'). Defaults to 'desc'. */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Structure of a paginated result.
 *
 * @template T The type of the data items.
 */
export interface PaginatedResult<T> {
  /** List of data items for the current page. */
  data: T[];
  /** Pagination metadata. */
  pagination: {
    /** Current page number. */
    page: number;
    /** Number of items per page. */
    pageSize: number;
    /** Total number of items available. */
    total: number;
    /** Total number of pages. */
    totalPages: number;
    /** Whether there is a next page. */
    hasNext: boolean;
    /** Whether there is a previous page. */
    hasPrev: boolean;
  };
}

// ============ Constants ============

/** Default page number (1). */
export const DEFAULT_PAGE = 1;
/** Default page size (20). */
export const DEFAULT_PAGE_SIZE = 20;
/** Maximum allowed page size (100). */
export const MAX_PAGE_SIZE = 100;

// ============ Functions ============

/**
 * Normalizes pagination parameters, applying defaults and constraints.
 *
 * @param {PaginationParams} [params] - The input pagination parameters.
 * @returns {Required<PaginationParams>} The normalized parameters with all fields populated.
 */
export function normalizePaginationParams(params?: PaginationParams): Required<PaginationParams> {
  const page = Math.max(1, params?.page ?? DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params?.pageSize ?? DEFAULT_PAGE_SIZE));
  const sortBy = params?.sortBy ?? 'createdAt';
  const sortOrder = params?.sortOrder ?? 'desc';

  return { page, pageSize, sortBy, sortOrder };
}

/**
 * Calculates the offset (starting index) for database queries based on page and page size.
 *
 * @param {number} page - The current page number (1-based).
 * @param {number} pageSize - The number of items per page.
 * @returns {number} The calculated offset (0-based index).
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Creates a standardized paginated result object.
 *
 * @template T The type of data items.
 * @param {T[]} data - The array of data items for the current page.
 * @param {number} total - The total count of items across all pages.
 * @param {Required<PaginationParams>} params - The normalized pagination parameters used to fetch the data.
 * @returns {PaginatedResult<T>} The structured paginated result.
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  params: Required<PaginationParams>,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

/**
 * Paginates an array in memory.
 * Useful for scenarios where all data is fetched or available in memory, and client-side-like pagination is needed.
 *
 * @template T The type of data items.
 * @param {T[]} items - The full array of items to paginate.
 * @param {PaginationParams} [params] - The pagination parameters.
 * @returns {PaginatedResult<T>} The paginated subset of the array wrapped in a result object.
 */
export function paginateArray<T>(items: T[], params?: PaginationParams): PaginatedResult<T> {
  const normalized = normalizePaginationParams(params);
  const offset = calculateOffset(normalized.page, normalized.pageSize);
  const data = items.slice(offset, offset + normalized.pageSize);

  return createPaginatedResult(data, items.length, normalized);
}

/**
 * Parameters for cursor-based pagination (infinite scroll).
 */
export interface CursorPaginationParams {
  /** The cursor pointing to the last item of the previous page. */
  cursor?: string;
  /** Number of items to fetch. */
  limit?: number;
  /** Direction to fetch data. Defaults to 'forward'. */
  direction?: 'forward' | 'backward';
}

/**
 * Structure of a cursor-based paginated result.
 *
 * @template T The type of data items.
 */
export interface CursorPaginatedResult<T> {
  /** List of data items. */
  data: T[];
  /** Cursor for the next page (null if no more data). */
  nextCursor: string | null;
  /** Cursor for the previous page. */
  prevCursor: string | null;
  /** Whether there is more data available. */
  hasMore: boolean;
}

/**
 * Normalizes cursor-based pagination parameters.
 *
 * @param {CursorPaginationParams} [params] - The input cursor parameters.
 * @returns {Required<CursorPaginationParams>} The normalized parameters.
 */
export function normalizeCursorParams(
  params?: CursorPaginationParams,
): Required<CursorPaginationParams> {
  return {
    cursor: params?.cursor ?? '',
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, params?.limit ?? DEFAULT_PAGE_SIZE)),
    direction: params?.direction ?? 'forward',
  };
}
