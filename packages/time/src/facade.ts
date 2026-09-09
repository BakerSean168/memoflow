import type { Instant } from '@memoflow/contracts/primitives';
import type {
  Clock,
  PartialTimePresentationStyle,
  PartialTimeStyle,
  TimeContext,
  TimeEngine,
  TimePresentationStyle,
  TimeStyle,
} from './types';
import {
  DEFAULT_TIME_PRESENTATION_STYLE,
  DEFAULT_TIME_STYLE,
  mergeTimePresentationStyle,
  mergeTimeStyle,
} from './style/default-style';
import { adaptLegacyTimeStyle, composeLegacyTimeStyle } from './style/legacy-time-style-adapter';
import { createSystemClock } from './clock/system-clock';
import { createFixedClock } from './clock/fixed-clock';
import { createDateFnsEngine } from './engine/date-fns-engine';
import { createCodec, type TimeCodec } from './codec/codec';
import { createFormat, type FormatApi } from './format/format';
import { createInput, type InputApi } from './input/input';
import { createCalendar, type CalendarApi } from './calendar/calendar';
import { createTimeContext, type TimeZoneSource } from './timezone/time-zone';

export interface TimeFacadeOptions {
  /** Canonical calendar/wall-clock semantics. */
  context?: TimeContext;
  /** Canonical presentation-only preferences. */
  presentation?: PartialTimePresentationStyle | TimePresentationStyle;
  /** @deprecated Migration compatibility for the pre-vNext mixed style. */
  style?: PartialTimeStyle | TimeStyle;
  /** Explicit source used only when adapting legacy `timeZone: local`. */
  timeZoneSource?: TimeZoneSource;
  clock?: Clock;
  engine?: TimeEngine;
}

export interface TimeFacade {
  readonly context: TimeContext;
  readonly presentation: TimePresentationStyle;
  /** @deprecated Compatibility projection. Prefer context + presentation. */
  readonly style: TimeStyle;
  readonly clock: Clock;
  readonly codec: TimeCodec;
  readonly format: FormatApi;
  readonly input: InputApi;
  readonly calendar: CalendarApi;
  readonly engine: TimeEngine;
  now(): Instant;
  withContext(context: TimeContext): TimeFacade;
  withPresentation(partial: PartialTimePresentationStyle): TimeFacade;
  /** @deprecated Prefer withContext / withPresentation. */
  withStyle(partial: PartialTimeStyle): TimeFacade;
  withClock(clock: Clock): TimeFacade;
  /** Engine adapter seam (P11) — swap DateFnsEngine / Temporal / test double. */
  withEngine(engine: TimeEngine): TimeFacade;
}

export function createTimeFacade(options: TimeFacadeOptions = {}): TimeFacade {
  const legacyStyle = mergeTimeStyle(
    DEFAULT_TIME_STYLE,
    options.style as PartialTimeStyle | undefined,
  );
  const adaptedLegacy = adaptLegacyTimeStyle(legacyStyle, options.timeZoneSource);
  const context =
    options.context == null
      ? adaptedLegacy.context
      : createTimeContext({
          timeZone: options.context.timeZone,
          weekStartsOn: options.context.weekStartsOn,
        });
  const presentation = mergeTimePresentationStyle(
    adaptedLegacy.presentation,
    options.presentation as PartialTimePresentationStyle | undefined,
  );
  const style =
    options.context == null && options.presentation == null
      ? legacyStyle
      : composeLegacyTimeStyle(context, presentation, {
          timeZonePolicy: options.context == null ? legacyStyle.timeZone : context.timeZone,
          dayBoundary: legacyStyle.calendar.dayBoundary,
        });
  const clock = options.clock ?? createSystemClock();
  const engine = options.engine ?? createDateFnsEngine();
  const codec = createCodec(context.timeZone);
  const format = createFormat(style, engine, clock);
  const input = createInput(style, context, codec);
  const calendar = createCalendar(context, clock);

  const facade: TimeFacade = {
    context,
    presentation,
    style,
    clock,
    codec,
    format,
    input,
    calendar,
    engine,
    now() {
      return clock.now();
    },
    withContext(nextContext) {
      return createTimeFacade({
        context: nextContext,
        presentation,
        style,
        clock,
        engine,
      });
    },
    withPresentation(partial) {
      return createTimeFacade({
        context,
        presentation: mergeTimePresentationStyle(presentation, partial),
        style,
        clock,
        engine,
      });
    },
    withStyle(partial) {
      return createTimeFacade({
        style: mergeTimeStyle(style, partial),
        clock,
        engine,
        timeZoneSource: options.timeZoneSource,
      });
    },
    withClock(nextClock) {
      return createTimeFacade({
        style,
        clock: nextClock,
        engine,
        timeZoneSource: options.timeZoneSource,
      });
    },
    withEngine(nextEngine) {
      return createTimeFacade({
        style,
        clock,
        engine: nextEngine,
        timeZoneSource: options.timeZoneSource,
      });
    },
  };

  return facade;
}

/** Default app-wide facade (system clock + default style). Prefer inject in apps. */
export const defaultTime = createTimeFacade();

export {
  createSystemClock,
  createFixedClock,
  DEFAULT_TIME_PRESENTATION_STYLE,
  DEFAULT_TIME_STYLE,
  mergeTimePresentationStyle,
  mergeTimeStyle,
};
