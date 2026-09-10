import { getProductTime } from '../../../shared/utils/product-time';

/**
 * Read the current session Product Time zone.
 * Signed-in presentation bootstrap replaces this with the canonical regional
 * preference; guest/local sessions retain the explicit device/local context.
 */
export function getUserTimezone(): string {
  return getProductTime().context.timeZone;
}
