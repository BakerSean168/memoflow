import type { Instant } from './instant';

/**
 * Wire / DTO / VO-internal name for an instantaneous timestamp.
 *
 * **≡ Instant** (epoch milliseconds). Same type; name kept for API prose
 * and OpenAPI so we do not invent a third noun (TransportDate).
 */
export type TransferDate = Instant;
