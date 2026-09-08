export type Timezone = string;

export type Range = {
  start?: number;
  end?: number;
  step?: number;
};

export type Recurrence = number | Range | string;
export type RecurrenceSegment = Recurrence | Recurrence[];
export interface CronRecurrenceRule {
  date?: RecurrenceSegment | undefined;
  dayOfWeek?: RecurrenceSegment | undefined;
  hour?: RecurrenceSegment | undefined;
  minute?: RecurrenceSegment | undefined;
  month?: RecurrenceSegment | undefined;
  second?: RecurrenceSegment | undefined;
  year?: RecurrenceSegment | undefined;
  tz?: Timezone | undefined;
}



/**
 * 将 RecurrenceRule 转为简明中文描述
 * 示例: { hour: 9, minute: 0, dayOfWeek: [4] } => "每周四 09:00"
 */
export function recurrenceRuleToText(rule: CronRecurrenceRule): string {
  if (!rule) return '无';

  // 星期映射
  const weekMap = ['日', '一', '二', '三', '四', '五', '六'];

  // 提取基础数值
  const toNumber = (seg: RecurrenceSegment | undefined): number | undefined => {
    if (typeof seg === 'number') return seg;
    if (Array.isArray(seg) && seg.length > 0) {
      const first = seg[0] as unknown;
      if (typeof first === 'number') return first as number;
      if (typeof first === 'object' && first && 'start' in (first as Record<string, unknown>)) {
        const start = (first as Range).start;
        if (typeof start === 'number') return start;
      }
    }
    if (typeof seg === 'object' && seg && !Array.isArray(seg) && 'start' in (seg as Record<string, unknown>)) {
      const start = (seg as Range).start;
      if (typeof start === 'number') return start;
    }
    return undefined;
  };

  const hour = toNumber(rule.hour);
  const minute = toNumber(rule.minute);
  const timeText =
    hour !== undefined
      ? `${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`
      : '';

  const normalizeArray = (seg: RecurrenceSegment | undefined): number[] => {
    if (seg === undefined) return [];
    if (typeof seg === 'number') return [seg];
    if (Array.isArray(seg)) return seg.filter((x): x is number => typeof x === 'number');
    return [];
  };

  let weekText = '';
  if (rule.dayOfWeek !== undefined) {
    const days = normalizeArray(rule.dayOfWeek);
    if (days.length > 0) weekText = '每周' + days.map((d) => weekMap[Number(d)]).join('、');
  }

  let dateText = '';
  if (rule.date !== undefined) {
    const dates = normalizeArray(rule.date);
    if (dates.length > 0) dateText = '每月' + dates.join('日');
  }

  let monthText = '';
  if (rule.month !== undefined) {
    const months = normalizeArray(rule.month);
    if (months.length > 0) monthText = '每年' + months.join('月');
  }

  const result = [monthText, dateText, weekText, timeText].filter(Boolean).join(' ');
  return result || '时间未配置';
}
