import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Lock, Plus, Users } from 'lucide-react';
import type { Employee, LeaveEntry, ScheduleResponse } from '../types.ts';
import {
  addDaysYMD,
  formatShortDate,
  formatWeekdayLabel,
  formatWeekRangeLabel,
  getWeekLockCutoffYMD,
  getWeekStart,
  isTodayYMD,
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
  const isWeekLocked = schedule?.isWeekLocked ?? false;
  const lockCutoffDate = schedule?.lockCutoffDate ?? getWeekLockCutoffYMD(weekStart);
  const canModifyThisWeek = currentUser.isAdmin || !isWeekLocked;

  const roleDailyLimits = settings?.roleDailyLimits ?? {};
  const myRoleDailyLimit = roleDailyLimits[currentUser.role] ?? 0;

  const thisWeekStart = getWeekStart();
  const nextWeekStart = addDaysYMD(thisWeekStart, 7);
  const nextNextWeekStart = addDaysYMD(thisWeekStart, 14);
  const serverToday = schedule?.serverToday;
  const suggestedOpenWeekStart =
    serverToday && serverToday >= getWeekLockCutoffYMD(nextWeekStart)
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

  return (
    <div className="space-y-6">
      {/* Top Action & Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>{currentUser.role}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{currentUser.id}</span>
            {myRoleDailyLimit > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600 tabular-nums">
                  {currentUser.role}每日限額 {myRoleDailyLimit} 位
                </span>
              </>
            )}
            {currentUser.isAdmin && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-teal-700 font-semibold">管理員</span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
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

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeWeek(addDaysYMD(weekStart, -7))}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
              aria-label="上一週"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeWeek(thisWeekStart)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                weekStart === thisWeekStart
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              本週
            </button>
            <button
              type="button"
              onClick={() => onChangeWeek(nextWeekStart)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                weekStart === nextWeekStart
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              下週
            </button>
            <button
              type="button"
              onClick={() => onChangeWeek(addDaysYMD(weekStart, 7))}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
              aria-label="下一週"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onGoToOverview}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            <span>一鍵查看該週劃假情形</span>
          </button>
        </div>
      </div>

      {/* Wednesday Lock Status Banner */}
      {settings?.lockNextWeekOnWednesday && (
        <div
          className={`rounded-xl px-4 py-3 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm ${
            isWeekLocked
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-teal-50/70 border-teal-200 text-teal-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isWeekLocked ? (
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            ) : (
              <CalendarDays className="w-4 h-4 text-teal-700 shrink-0" />
            )}
            <span>
              {isWeekLocked ? (
                currentUser.isAdmin ? (
                  <>
                    該週排休已於{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {formatShortDate(lockCutoffDate)}
                    </span>
                    （週三）鎖定一般員工編輯，管理員仍可直接調整
                  </>
                ) : (
                  <>
                    該週排休已於{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {formatShortDate(lockCutoffDate)}
                    </span>
                    （週三）鎖定，無法再自行修改，如需異動請洽管理員
                  </>
                )
              ) : (
                <>
                  該週開放排休中，將於{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatShortDate(lockCutoffDate)}
                  </span>
                  （週三）自動鎖定
                </>
              )}
            </span>
          </div>

          {isWeekLocked && weekStart !== suggestedOpenWeekStart && (
            <button
              type="button"
              onClick={() => onChangeWeek(suggestedOpenWeekStart)}
              className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-amber-100/70 text-amber-900 border border-amber-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              前往開放排休週（{formatShortDate(suggestedOpenWeekStart)} 起）
            </button>
          )}
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
            ? '點擊日期按鈕即可一鍵劃定排休或取消'
            : '此週已鎖定，僅供檢視排休結果'}
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* 7-Day Grid */}
      {loading && !schedule ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-52 bg-white border border-slate-200 rounded-xl animate-pulse" />
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

            const sameRoleCount = dayLeaves.filter(
              (l) => employeeMap.get(l.employeeId)?.role === currentUser.role,
            ).length;
            const isMyRoleFull =
              myRoleDailyLimit > 0 && sameRoleCount >= myRoleDailyLimit && !myEntry;
            const blockedByQuota = !currentUser.isAdmin && isMyRoleFull;

            return (
              <div
                key={date}
                className={`bg-white border rounded-xl p-4 flex flex-col justify-between transition-colors ${
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
                      <span className="text-xs font-semibold text-teal-800 bg-teal-100/80 px-2 py-0.5 rounded">
                        排休
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">出勤日</span>
                    )}
                  </div>

                  {/* Role Daily Quota Indicator */}
                  {myRoleDailyLimit > 0 && (
                    <div
                      className={`mt-2.5 text-[11px] font-medium tabular-nums flex items-center justify-between ${
                        sameRoleCount >= myRoleDailyLimit ? 'text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      <span>{currentUser.role}名額</span>
                      <span className="font-mono">
                        {sameRoleCount} / {myRoleDailyLimit}
                        {sameRoleCount >= myRoleDailyLimit ? ' 已滿' : ''}
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
                                <span className="font-medium">{emp?.name ?? l.employeeId}</span>
                                <span className="text-slate-400"> · {emp?.role ?? ''}</span>
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
                    <div className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-lg bg-slate-100 text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                      <span>{myEntry ? '已排休（已鎖定）' : '已鎖定'}</span>
                    </div>
                  ) : blockedByQuota ? (
                    <div className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                      <span>
                        {currentUser.role}已滿 ({sameRoleCount}/{myRoleDailyLimit})
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleQuickToggle(date)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        myEntry
                          ? 'bg-teal-700 hover:bg-teal-800 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {myEntry ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{isBusy ? '處理中...' : myEntry ? '已排休（點選取消）' : '一鍵排休'}</span>
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
