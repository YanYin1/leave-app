const WEEKDAY_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTaiwanTodayYMD(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns Monday (YYYY-MM-DD) of the week containing `date`.
 */
export function getWeekStart(date: Date = new Date()): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMon);
  return formatYMD(copy);
}

export function getWeekStartFromYMD(ymd: string): string {
  return getWeekStart(parseYMD(ymd));
}

export function addDaysYMD(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return formatYMD(d);
}

export function getWeekDays(weekStartYMD: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStartYMD, i));
}

/**
 * Preceding Friday 00:00 (Monday - 3 days) when this week locks.
 */
export function getWeekLockCutoffYMD(weekStartYMD: string): string {
  return addDaysYMD(weekStartYMD, -3);
}

export function isWeekLockedByFriday(
  weekStartYMD: string,
  todayYMD: string = getTaiwanTodayYMD(),
): boolean {
  return todayYMD >= getWeekLockCutoffYMD(weekStartYMD);
}

export function formatShortDate(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function formatWeekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? '';
}

export function isTodayYMD(ymd: string): boolean {
  return ymd === getTaiwanTodayYMD();
}

export function formatWeekRangeLabel(weekStartYMD: string): string {
  const weekEndYMD = addDaysYMD(weekStartYMD, 6);
  const s = parseYMD(weekStartYMD);
  const e = parseYMD(weekEndYMD);
  const sStr = `${s.getFullYear()}/${String(s.getMonth() + 1).padStart(2, '0')}/${String(s.getDate()).padStart(2, '0')}`;
  const eStr = `${String(e.getMonth() + 1).padStart(2, '0')}/${String(e.getDate()).padStart(2, '0')}`;
  return `${sStr} – ${eStr}`;
}
