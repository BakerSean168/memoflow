/**
 * Framework-agnostic Product Time session (ADR-037).
 * 与框架无关的产品时间会话（ADR-037）。
 *
 * The Vue and React app shells each own one session facade plus their own
 * reactivity. Everything that does not depend on Vue or React — session
 * construction, preference application, empty-safe formatters and the
 * calendar/input adapters — lives here so the shells only wrap it.
 * Vue 与 React 应用壳各自持有一个会话门面及各自响应式包装；与框架无关的
 * 会话构造、偏好应用、空值安全格式化器与日历/输入适配器集中在此，壳层只做
 * 包装。
 */

import type { Ymd } from '@memoflow/shared-primitives';
import type { Clock, TimeDateStyle, TimeHourStyle, TimeZoneId, Weekday } from './types';
import type { TimeFacade } from './facade';
import { createTimeFacade } from './facade';
import { createSystemTimeZoneSource, createTimeContext } from './timezone/time-zone';
import {
  resolveEmptyLabel,
  type ResolveEmptyLabelOptions,
  type TimeEmptyKind,
} from './empty-catalog';

/**
 * Canonical preference slice the session applies.
 * 会话应用的标准偏好切片。
 *
 * Structurally satisfied by the `UserPreferenceProfile` owned by
 * `@memoflow/setting-contracts`, so shells pass their profile through without
 * Time depending on the settings package.
 * `@memoflow/setting-contracts` 的 `UserPreferenceProfile` 在结构上满足该类型，
 * 壳层可直接透传，Time 包无需依赖设置包。
 */
export interface ProductTimePreferences {
  readonly presentation: { readonly language: string };
  readonly regional: {
    readonly timeZone: TimeZoneId;
    readonly weekStartsOn: Weekday;
    readonly dateStyle: TimeDateStyle;
    readonly timeStyle: TimeHourStyle;
  };
}

/** Caller overrides for the two empty slots used by the formatters. / 格式化器两个空值槽位的调用方覆写。 */
export interface ProductTimeEmptyLabels {
  readonly display?: string;
  readonly unknown?: string;
}

/** Session construction options. / 会话构造选项。 */
export interface ProductTimeSessionOptions {
  /** Device/guest presentation locale. / 设备（访客）展示语言。 */
  readonly locale: string;
  /** Optional empty-label copy applied to the device session. / 可选的设备会话空值文案覆写。 */
  readonly empty?: ProductTimeEmptyLabels;
  /**
   * Label slot returned for values that parse to nothing.
   * 解析失败时返回的空值槽位。
   *
   * `display` (the pre-existing React shell behaviour) or `unknown` (the
   * pre-existing Vue shell behaviour). Defaults to `display`.
   */
  readonly invalidValueLabel?: 'display' | 'unknown';
  /** Clock seam for tests; defaults to the system clock. / 测试用时钟缝；默认系统时钟。 */
  readonly clock?: Clock;
}

/** One mutable Product Time session facade plus its formatter set. / 单个可变产品时间会话门面及其格式化器集合。 */
export interface ProductTimeSession {
  /** Current session facade. / 当前会话门面。 */
  getFacade(): TimeFacade;
  /** Apply canonical regional/presentation preferences. / 应用标准区域与展示偏好。 */
  setPreferences(preferences: ProductTimePreferences): TimeFacade;
  /** Restore the device locale/timezone session. / 恢复设备语言与时区会话。 */
  reset(): TimeFacade;
  /** Resolve an empty catalog kind to copy. / 将空值目录种类解析为文案。 */
  emptyKind(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string;
  /** Normalize epoch/ISO/Date input to milliseconds. / 将 epoch/ISO/Date 输入归一为毫秒。 */
  toInstantMs(value: number | string | Date | null | undefined): number | null;
  /** Empty-safe `Ymd` display. / 空值安全的 `Ymd` 展示。 */
  formatYmd(value: Ymd | null | undefined, labels?: ProductTimeEmptyLabels): string;
  /** Empty-safe date. / 空值安全日期。 */
  formatDate(
    value: number | string | Date | null | undefined,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe date+time. / 空值安全日期时间。 */
  formatDateTime(
    value: number | string | Date | null | undefined,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe date+time with seconds. / 空值安全日期时间（含秒）。 */
  formatDateTimeSeconds(
    value: number | string | Date | null | undefined,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe hour+minute. / 空值安全时分。 */
  formatHm(
    value: number | string | Date | null | undefined,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe `MMM d` month-day. / 空值安全的 `MMM d` 月日。 */
  formatMonthDay(
    value: number | string | Date | null | undefined,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe registered-pattern formatting. / 空值安全的注册模式格式化。 */
  formatPattern(
    value: number | string | Date | null | undefined,
    pattern: string,
    labels?: ProductTimeEmptyLabels,
  ): string;
  /** Empty-safe relative time. / 空值安全相对时间。 */
  formatRelative(value: number | null | undefined, labels?: ProductTimeEmptyLabels): string;
  /** Native date input value (`YYYY-MM-DD`). / 原生日期输入值（`YYYY-MM-DD`）。 */
  toDateInputValue(value: number | null | undefined): string;
  /** Parse a native date input at product-day midnight. / 在产日零点解析原生日期输入。 */
  fromDateInputValue(raw: string): number | null;
  /** Calendar-native `Ymd` input value. / 日历原生 `Ymd` 输入值。 */
  toYmdInputValue(value: Ymd | null | undefined): string;
  /** Parse a native date input as `Ymd`. / 将原生日期输入解析为 `Ymd`。 */
  fromYmdInputValue(raw: string): Ymd | null;
  /** Current product calendar day. / 当前产品日历日。 */
  getTodayYmd(): Ymd;
  /** Current presentation locale. / 当前展示语言。 */
  getLocale(): string;
  /** Current week-start preference. / 当前周起始偏好。 */
  getWeekStartsOn(): Weekday;
  /** Start of the product day containing `ms`. / 包含 `ms` 的产品日起点。 */
  startOfDayMs(ms: number): number;
  /** End of the product day containing `ms`. / 包含 `ms` 的产品日终点。 */
  endOfDayMs(ms: number): number;
  /** Same product calendar day. / 同一产品日历日。 */
  isSameDayMs(a: number, b: number): boolean;
  /** Product day is today. / 产品日是否为今天。 */
  isTodayMs(ms: number): boolean;
}

function toInstantMs(value: number | string | Date | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Create one Product Time session.
 * 创建一个产品时间会话。
 *
 * @param options - Session construction options. / 会话构造选项。
 * @returns A session whose facade can be replaced by preferences. / 门面可被偏好替换的会话。
 */
export function createProductTimeSession(options: ProductTimeSessionOptions): ProductTimeSession {
  const invalidValueLabel = options.invalidValueLabel ?? 'display';

  const createDeviceFacade = (): TimeFacade =>
    createTimeFacade({
      context: createTimeContext({
        timeZone: createSystemTimeZoneSource().currentTimeZoneId(),
        weekStartsOn: 1,
      }),
      presentation: options.empty ? { locale: options.locale, empty: options.empty } : {
        locale: options.locale,
      },
      ...(options.clock ? { clock: options.clock } : {}),
    });

  let facade = createDeviceFacade();

  const resolveLabels = (
    labels?: ProductTimeEmptyLabels,
  ): { display: string; unknown: string } => ({
    display: labels?.display ?? facade.presentation.empty.display,
    unknown: labels?.unknown ?? facade.presentation.empty.unknown,
  });

  const resolveInvalid = (labels?: ProductTimeEmptyLabels): string => {
    const resolved = resolveLabels(labels);
    return invalidValueLabel === 'unknown' ? resolved.unknown : resolved.display;
  };

  return {
    getFacade: () => facade,

    setPreferences(preferences) {
      facade = facade
        .withContext(
          createTimeContext({
            timeZone: preferences.regional.timeZone,
            weekStartsOn: preferences.regional.weekStartsOn,
          }),
        )
        .withPresentation({
          locale: preferences.presentation.language,
          dateStyle: preferences.regional.dateStyle,
          timeStyle: preferences.regional.timeStyle,
        });
      return facade;
    },

    reset() {
      facade = createDeviceFacade();
      return facade;
    },

    emptyKind(kind, resolveOptions) {
      return resolveEmptyLabel(kind, resolveOptions);
    },

    toInstantMs,

    formatYmd(value, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      return facade.format.ymdDisplay(value) || resolved.unknown;
    },

    formatDate(value, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      const ms = toInstantMs(value);
      if (ms == null) return resolveInvalid(labels);
      return facade.format.date(ms);
    },

    formatDateTime(value, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      const ms = toInstantMs(value);
      if (ms == null) return resolveInvalid(labels);
      return facade.format.dateTime(ms);
    },

    formatDateTimeSeconds(value, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      const ms = toInstantMs(value);
      if (ms == null) return resolveInvalid(labels);
      return facade.format.dateTimeSeconds(ms);
    },

    formatHm(value, labels) {
      const ms = toInstantMs(value);
      if (ms == null) return resolveLabels(labels).display;
      return facade.format.hm(ms);
    },

    formatMonthDay(value, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      const ms = toInstantMs(value);
      if (ms == null) return resolveInvalid(labels);
      return facade.format.pattern(ms, 'MMM d');
    },

    formatPattern(value, pattern, labels) {
      const resolved = resolveLabels(labels);
      if (value == null || value === '') return resolved.display;
      const ms = toInstantMs(value);
      if (ms == null) return resolveInvalid(labels);
      return facade.format.pattern(ms, pattern);
    },

    formatRelative(value, labels) {
      if (value == null || !Number.isFinite(value)) return resolveLabels(labels).display;
      return facade.format.relative(value);
    },

    toDateInputValue(value) {
      return facade.input.dateValue(value);
    },

    fromDateInputValue(raw) {
      const ymd = facade.input.parseDateValue(raw);
      if (ymd == null) return null;
      return facade.input.combine(ymd, '00:00') as number | null;
    },

    toYmdInputValue(value) {
      return value ?? '';
    },

    fromYmdInputValue(raw) {
      return facade.input.parseDateValue(raw);
    },

    getTodayYmd() {
      return facade.calendar.toYmd(facade.now());
    },

    getLocale() {
      return facade.presentation.locale;
    },

    getWeekStartsOn() {
      return facade.context.weekStartsOn;
    },

    startOfDayMs(ms) {
      return facade.calendar.startOfDay(ms);
    },

    endOfDayMs(ms) {
      return facade.calendar.endOfDay(ms);
    },

    isSameDayMs(a, b) {
      return facade.calendar.isSameDay(a, b);
    },

    isTodayMs(ms) {
      return facade.calendar.isToday(ms);
    },
  };
}
