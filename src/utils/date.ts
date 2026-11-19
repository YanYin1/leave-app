const WEEKDAY_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTaiwanNow(): { ymd: string; hm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  let hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  if (hh === '24') hh = '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { ymd: `${y}-${m}-${d}`, hm: `${hh}:${mm}` };
}

export function getTaiwanTodayYMD(): string {
  return getTaiwanNow().ymd;
}

export function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns Monday (YYYY-MM-DD) of the week containing `date`.
 */
export function getWeekStart(date: Date = parseYMD(getTaiwanTodayYMD())): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMon);
  return formatYMD(copy);
}

export function getNextWeekStart(): string {
  return addDaysYMD(getWeekStart(), 7);
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
 * Preceding week's `lockWeekday` (1 = Mon ... 7 = Sun; default 3 = Wednesday -> Monday - 5 days).
 */
export function getWeekLockCutoffYMD(weekStartYMD: string, lockWeekday = 3): string {
  const clamped = Math.max(1, Math.min(7, Math.floor(lockWeekday || 3)));
  return addDaysYMD(weekStartYMD, clamped - 8);
}

export function formatLockWeekdayLabel(lockWeekday = 3): string {
  const clamped = Math.max(1, Math.min(7, Math.floor(lockWeekday || 3)));
  return WEEKDAY_LABELS[clamped - 1] ?? '週三';
}

export function isWeekLockedAt(
  weekStartYMD: string,
  lockWeekday = 3,
  lockTime = '21:30',
  nowYMD: string = getTaiwanNow().ymd,
  nowHM: string = getTaiwanNow().hm,
): boolean {
  const cutoffYMD = getWeekLockCutoffYMD(weekStartYMD, lockWeekday);
  return `${nowYMD} ${nowHM}` >= `${cutoffYMD} ${lockTime}`;
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
