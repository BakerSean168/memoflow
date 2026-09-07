/**
 * @file calculate-next-run.ts
 * @description Calculate next run time from cron expression
 */

import { CronExpressionParser } from 'cron-parser';

/**
 * Calculate the next run time for a cron expression
 *
 * @param cronExpression - Standard cron expression (e.g., "0 9 * * *")
 * @param timezone - IANA timezone name (e.g., "Asia/Shanghai")
 * @returns Next run date, or null if the expression is invalid or there's no next run
 */
export function calculateNextRun(cronExpression: string, timezone: string = 'UTC'): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });

    const next = interval.next();
    return next.toDate();
  } catch (error) {
    console.error(`Failed to parse cron expression "${cronExpression}":`, error);
    return null;
  }
}
