import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Lock, Plus, Users } from 'lucide-react';
import type { Employee, LeaveEntry, ScheduleResponse } from '../types.ts';
import {
  addDaysYMD,
  formatLockWeekdayLabel,
  formatShortDate,
  formatWeekdayLabel,
  formatWeekRangeLabel,
  getTaiwanNow,
  getWeekLockCutoffYMD,
  getWeekStart,
  isTodayYMD,
  isWeekLockedAt,
} from '../utils/date.ts';
import { toggleLeave } from '../api/client.ts';

interface MyLeaveViewProps {
  currentUser: Employee;
  weekStart: string;
  schedule: ScheduleResponse | null;
  loading: boolean;
  onChangeWeek: (nextWeekStart: string) => void;
  onRefresh: () => Promise<void>;
  onGoToOverview: () => void;
}

export function MyLeaveView({
  currentUser,
  weekStart,
  schedule,
  loading,
  onChangeWeek,
  onRefresh,
  onGoToOverview,
}: MyLeaveViewProps) {
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const days = useMemo(() => schedule?.days ?? [], [schedule]);
  const leaves = useMemo(() => schedule?.leaves ?? [], [schedule]);
  const employees = useMemo(() => schedule?.employees ?? [], [schedule]);
  const settings = schedule?.settings;

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const myLeavesByDate = useMemo(() => {
    const map = new Map<string, LeaveEntry>();
    for (const l of leaves) {
      if (l.employeeId === currentUser.id) {
        map.set(l.date, l);
      }
    }
    return map;
  }, [leaves, currentUser.id]);

  const leavesByDate = useMemo(() => {
    const map = new Map<string, LeaveEntry[]>();
    for (const l of leaves) {
      const list = map.get(l.date) ?? [];
      list.push(l);
      map.set(l.date, list);
    }
    return map;
  }, [leaves]);

  const myWeekCount = myLeavesByDate.size;
  const limit = currentUser.weeklyLeaveLimit;
  const lockWeekday = settings?.lockWeekday ?? 3;
  const lockTime = schedule?.lockCutoffTime ?? settings?.lockTime ?? '21:30';
  const lockWeekdayLabel = formatLockWeekdayLabel(lockWeekday);
  const isWeekLocked = schedule?.isWeekLocked ?? false;
  const lockCutoffDate =
    schedule?.lockCutoffDate ?? getWeekLockCutoffYMD(weekStart, lockWeekday);
  const canModifyThisWeek = currentUser.isAdmin || !isWeekLocked;

  const dailyMaxLeave = settings?.dailyMaxLeave ?? 2;

  const thisWeekStart = getWeekStart();
  const nextWeekStart = addDaysYMD(thisWeekStart, 7);
  const nextNextWeekStart = addDaysYMD(thisWeekStart, 14);
  const taiwanNow = getTaiwanNow();
  const serverToday = schedule?.serverToday ?? taiwanNow.ymd;
  const serverNowTime = schedule?.serverNowTime ?? taiwanNow.hm;
  const suggestedOpenWeekStart = isWeekLockedAt(
    nextWeekStart,
    lockWeekday,
    lockTime,
    serverToday,
    serverNowTime,
  )
    ? nextNextWeekStart
    : nextWeekStart;

  async function handleQuickToggle(date: string) {
    if (!canModifyThisWeek) return;
    setBusyDate(date);
    setErrorMsg(null);
    try {
      await toggleLeave({ date });
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusyDate(null);
    }
  }

  function scrollToDayCard(date: string) {
    const el = document.getElementById(`my-day-card-${date}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Action & Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          {(currentUser.isAdmin || dailyMaxLeave > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
              {currentUser.isAdmin && (
                <>
                  <span className="font-mono tabular-nums">{currentUser.id}</span>
                  {dailyMaxLeave > 0 && <span aria-hidden="true">·</span>}
                </>
              )}
              {dailyMaxLeave > 0 && (
                <span className="text-slate-600 tabular-nums">
                  每日全店限額 {dailyMaxLeave} 位（正職／計時員合計）
                </span>
              )}
              {currentUser.isAdmin && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-teal-700 font-semibold">管理員</span>
                </>
              )}
            </div>
          )}
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            {currentUser.name} 的週排休劃假
          </h2>
          <p className="text-sm text-slate-600 mt-1 tabular-nums">
            本週已劃休 <span className="font-semibold text-slate-900">{myWeekCount}</span> 天
            {limit > 0 ? (
              <span className={myWeekCount > limit ? 'text-amber-700 font-medium' : 'text-slate-500'}>
                {' '}
                / 建議每週上限 {limit} 天{myWeekCount > limit ? '（已超過建議天數）' : ''}
              </span>
            ) : (
              <span className="text-slate-500">（無固定天數上限）</span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
          <div className="inline-flex items-center justify-between bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChangeWeek(addDaysYMD(weekStart, -7))}
              className="min-w-[40px] min-h-[38px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
              aria-label="上一週"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 flex-1 justify-center">
              <button
                type="button"
                onClick={() => onChangeWeek(nextWeekStart)}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  weekStart === nextWeekStart
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                下週
              </button>
              <button
                type="button"
                onClick={() => onChangeWeek(nextNextWeekStart)}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  weekStart === nextNextWeekStart
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                下下週
              </button>
            </div>
            <button
              type="button"
              onClick={() => onChangeWeek(addDaysYMD(weekStart, 7))}
              className="min-w-[40px] min-h-[38px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
              aria-label="下一週"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onGoToOverview}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            <span>查看該週劃假總覽</span>
          </button>
        </div>
      </div>

      {/* Weekly Lock Status Banner */}
      {settings?.enableWeeklyLock && (
        <div
          className={`rounded-2xl px-4 py-3 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm ${
            isWeekLocked
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-teal-50/70 border-teal-200 text-teal-900'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            {isWeekLocked ? (
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <CalendarDays className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <span className="leading-relaxed">
              {isWeekLocked ? (
                currentUser.isAdmin ? (
                  <>
                    該週排休已於{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {formatShortDate(lockCutoffDate)}
                    </span>
                    （{lockWeekdayLabel} {lockTime}）鎖定
                  </>
                ) : (
                  <>
                    該週排休已於{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {formatShortDate(lockCutoffDate)}
                    </span>
                    （{lockWeekdayLabel} {lockTime}）鎖定，無法再自行修改，如需異動請洽管理員
                  </>
                )
              ) : (
                <>
                  該週開放排休中，將於{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatShortDate(lockCutoffDate)}
                  </span>
                  （{lockWeekdayLabel} {lockTime}）自動鎖定
                </>
              )}
            </span>
          </div>

          {isWeekLocked && weekStart !== suggestedOpenWeekStart && (
            <button
              type="button"
              onClick={() => onChangeWeek(suggestedOpenWeekStart)}
              className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold bg-white hover:bg-amber-100/70 text-amber-900 border border-amber-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              前往開放排休週（{formatShortDate(suggestedOpenWeekStart)} 起）
            </button>
          )}
        </div>
      )}

      {/* Mobile 7-Day Quick Jump Strip */}
      {days.length > 0 && (
        <div className="grid grid-cols-7 gap-1 md:hidden">
          {days.map((date, idx) => {
            const myEntry = myLeavesByDate.get(date);
            const count = (leavesByDate.get(date) ?? []).length;
            const isFull = dailyMaxLeave > 0 && count >= dailyMaxLeave;
            const shortDay = formatWeekdayLabel(idx).replace('週', '');
            return (
              <button
                key={date}
                type="button"
                onClick={() => scrollToDayCard(date)}
                className={`min-h-[54px] rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center transition-colors cursor-pointer ${
                  myEntry
                    ? 'bg-teal-700 border-teal-700 text-white'
                    : isFull
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-[10px] font-medium opacity-80">{shortDay}</span>
                <span className="text-xs font-mono font-bold tabular-nums">
                  {formatShortDate(date).split('/')[1]}
                </span>
                <span className="text-[10px] font-mono tabular-nums">
                  {myEntry ? '休' : dailyMaxLeave > 0 ? `${count}/${dailyMaxLeave}` : `${count}人`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Date Range Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 tabular-nums">
          <CalendarDays className="w-4 h-4 text-teal-700" />
          <span>{formatWeekRangeLabel(weekStart)}</span>
        </div>
        <p className="text-xs text-slate-500">
          {canModifyThisWeek
            ? dailyMaxLeave > 0
              ? `每日合計最多 ${dailyMaxLeave} 人（含正職與計時員）`
              : '點擊日期按鈕即可一鍵劃定排休或取消'
            : '此週已鎖定，僅供檢視排休結果'}
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* 7-Day Grid */}
      {loading && !schedule ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-52 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((date, idx) => {
            const myEntry = myLeavesByDate.get(date) ?? null;
            const dayLeaves = leavesByDate.get(date) ?? [];
            const otherLeaves = dayLeaves.filter((l) => l.employeeId !== currentUser.id);
            const isToday = isTodayYMD(date);
            const isBusy = busyDate === date;
            const warningThreshold = settings?.maxDailyLeaveWarning ?? 3;
            const isCrowded = dayLeaves.length > warningThreshold;

            const isDayFull = dailyMaxLeave > 0 && dayLeaves.length >= dailyMaxLeave;
            const isOverCap = dailyMaxLeave > 0 && dayLeaves.length > dailyMaxLeave;
            const blockedByQuota = !currentUser.isAdmin && isDayFull && !myEntry;

            return (
              <div
                id={`my-day-card-${date}`}
                key={date}
                className={`bg-white border rounded-2xl p-4 flex flex-col justify-between transition-colors ${
                  myEntry
                    ? 'border-teal-600 ring-1 ring-teal-600/20 bg-teal-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900">
                          {formatWeekdayLabel(idx)}
                        </span>
                        {isToday && (
                          <span className="text-[11px] font-semibold text-teal-700">今天</span>
                        )}
                      </div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                        {formatShortDate(date)}
                      </div>
                    </div>

                    {myEntry ? (
                      <span className="text-xs font-semibold text-teal-800 bg-teal-100/80 px-2.5 py-0.5 rounded-md">
                        排休
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">出勤日</span>
                    )}
                  </div>

                  {/* Combined Store Daily Quota Indicator */}
                  {dailyMaxLeave > 0 && (
                    <div
                      className={`mt-2.5 text-xs font-medium tabular-nums flex items-center justify-between ${
                        isOverCap
                          ? 'text-red-700 font-semibold'
                          : isDayFull
                            ? 'text-amber-700 font-semibold'
                            : 'text-slate-600'
                      }`}
                    >
                      <span>當日排休名額</span>
                      <span className="font-mono">
                        {dayLeaves.length} / {dailyMaxLeave} 位
                        {isOverCap ? ' (管理員加開)' : isDayFull ? ' (已滿)' : ''}
                      </span>
                    </div>
                  )}

                  {/* Peer Leaves on Same Day */}
                  {(settings?.allowEmployeesViewAll || currentUser.isAdmin) && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-500">當日已排休同事</span>
                        <span
                          className={`font-mono tabular-nums font-medium ${
                            isCrowded ? 'text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          共 {dayLeaves.length} 人
                        </span>
                      </div>
                      {otherLeaves.length > 0 ? (
                        <ul className="space-y-1">
                          {otherLeaves.map((l) => {
                            const emp = employeeMap.get(l.employeeId);
                            return (
                              <li key={l.id} className="text-xs text-slate-700 truncate">
                                <span className="font-medium">{emp?.name ?? '同事'}</span>
                                {currentUser.isAdmin && emp?.id && (
                                  <span className="text-slate-400 font-mono"> · {emp.id}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400">尚無其他同事排休</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Single 1-click Toggle Action */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {!canModifyThisWeek ? (
                    <div className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-xl bg-slate-100 text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                      <span>{myEntry ? '已排休（已鎖定）' : '已鎖定'}</span>
                    </div>
                  ) : blockedByQuota ? (
                    <div className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-center">
                      <span>
                        名額已滿 ({dayLeaves.length}/{dailyMaxLeave}) · 請洽管理員
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleQuickToggle(date)}
                      className={`w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                        myEntry
                          ? 'bg-teal-700 hover:bg-teal-800 text-white'
                          : isDayFull && currentUser.isAdmin
                            ? 'bg-amber-700 hover:bg-amber-800 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {myEntry ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span>
                        {isBusy
                          ? '處理中...'
                          : myEntry
                            ? '已排休（點選取消）'
                            : isDayFull && currentUser.isAdmin
                              ? `管理員加劃（第 ${dayLeaves.length + 1} 位）`
                              : '一鍵排休'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
