import type { Instant } from '@memoflow/contracts/primitives';
import type {
  Clock,
  PartialTimePresentationStyle,
  TimeContext,
  TimeEngine,
  TimePresentationStyle,
} from './types';
import { DEFAULT_TIME_PRESENTATION_STYLE, mergeTimePresentationStyle } from './style/default-style';
import { createSystemClock } from './clock/system-clock';
import { createFixedClock } from './clock/fixed-clock';
import { createDateFnsEngine } from './engine/date-fns-engine';
import { createCodec, type TimeCodec } from './codec/codec';
import { createFormat, type FormatApi } from './format/format';
import { createInput, type InputApi } from './input/input';
import { createCalendar, type CalendarApi } from './calendar/calendar';
import { createTimeContext } from './timezone/time-zone';

export interface TimeFacadeOptions {
  /** Canonical calendar/wall-clock semantics. Required: no ambient timezone fallback. */
  context: TimeContext;
  /** Canonical presentation-only preferences. */
  presentation?: PartialTimePresentationStyle | TimePresentationStyle;
  clock?: Clock;
  engine?: TimeEngine;
}

export interface TimeFacade {
  readonly context: TimeContext;
  readonly presentation: TimePresentationStyle;
  readonly clock: Clock;
  readonly codec: TimeCodec;
  readonly format: FormatApi;
  readonly input: InputApi;
  readonly calendar: CalendarApi;
  readonly engine: TimeEngine;
  now(): Instant;
  withContext(context: TimeContext): TimeFacade;
  withPresentation(partial: PartialTimePresentationStyle): TimeFacade;
  withClock(clock: Clock): TimeFacade;
  /** Engine adapter seam (P11) — swap DateFnsEngine / Temporal / test double. */
  withEngine(engine: TimeEngine): TimeFacade;
}

export function createTimeFacade(options: TimeFacadeOptions): TimeFacade {
  const context = createTimeContext({
    timeZone: options.context.timeZone,
    weekStartsOn: options.context.weekStartsOn,
  });
  const presentation = mergeTimePresentationStyle(
    DEFAULT_TIME_PRESENTATION_STYLE,
    options.presentation as PartialTimePresentationStyle | undefined,
  );
  const clock = options.clock ?? createSystemClock();
  const engine = options.engine ?? createDateFnsEngine();
  const codec = createCodec(context.timeZone);
  const format = createFormat(presentation, context, engine, clock);
  const input = createInput(presentation, context, codec);
  const calendar = createCalendar(context, clock);

  return {
    context,
    presentation,
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
        clock,
        engine,
      });
    },
    withPresentation(partial) {
      return createTimeFacade({
        context,
        presentation: mergeTimePresentationStyle(presentation, partial),
        clock,
        engine,
      });
    },
    withClock(nextClock) {
      return createTimeFacade({
        context,
        presentation,
        clock: nextClock,
        engine,
      });
    },
    withEngine(nextEngine) {
      return createTimeFacade({
        context,
        presentation,
        clock,
        engine: nextEngine,
      });
    },
  };
}

export {
  createSystemClock,
  createFixedClock,
  DEFAULT_TIME_PRESENTATION_STYLE,
  mergeTimePresentationStyle,
};
