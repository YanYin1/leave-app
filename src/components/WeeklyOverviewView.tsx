import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  Lock,
  Plus,
  Table2,
  X,
} from 'lucide-react';
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

interface WeeklyOverviewViewProps {
  currentUser: Employee;
  weekStart: string;
  schedule: ScheduleResponse | null;
  loading: boolean;
  onChangeWeek: (nextWeekStart: string) => void;
  onRefresh: () => Promise<void>;
}

type OverviewMode = 'daily-board' | 'matrix';

export function WeeklyOverviewView({
  currentUser,
  weekStart,
  schedule,
  loading,
  onChangeWeek,
  onRefresh,
}: WeeklyOverviewViewProps) {
  const [viewMode, setViewMode] = useState<OverviewMode>('daily-board');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminAddDay, setAdminAddDay] = useState<string | null>(null);
  const [adminSelectedEmpId, setAdminSelectedEmpId] = useState<string>('');

  const days = useMemo(() => schedule?.days ?? [], [schedule]);
  const allEmployees = useMemo(() => schedule?.employees ?? [], [schedule]);
  const leaves = useMemo(() => schedule?.leaves ?? [], [schedule]);
  const settings = schedule?.settings;

  const isWeekLocked = schedule?.isWeekLocked ?? false;
  const lockCutoffDate = schedule?.lockCutoffDate ?? getWeekLockCutoffYMD(weekStart);
  const roleDailyLimits = useMemo(() => settings?.roleDailyLimits ?? {}, [settings]);
  const limitedRoles = useMemo(
    () =>
      Object.entries(roleDailyLimits)
        .filter(([, limit]) => limit > 0)
        .map(([role, limit]) => ({ role, limit })),
    [roleDailyLimits],
  );

  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const emp of allEmployees) {
      roles.add(emp.role);
    }
    return Array.from(roles);
  }, [allEmployees]);

  const filteredEmployees = useMemo(() => {
    if (roleFilter === 'ALL') return allEmployees;
    return allEmployees.filter((e) => e.role === roleFilter);
  }, [allEmployees, roleFilter]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of allEmployees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [allEmployees]);

  const filteredEmpIdSet = useMemo(
    () => new Set(filteredEmployees.map((e) => e.id)),
    [filteredEmployees],
  );

  const leaveLookup = useMemo(() => {
    const map = new Map<string, LeaveEntry>();
    for (const l of leaves) {
      map.set(`${l.employeeId}_${l.date}`, l);
    }
    return map;
  }, [leaves]);

  const leavesByDate = useMemo(() => {
    const map = new Map<string, Array<{ entry: LeaveEntry; employee: Employee }>>();
    for (const day of days) {
      map.set(day, []);
    }
    for (const l of leaves) {
      if (!filteredEmpIdSet.has(l.employeeId)) continue;
      const emp = employeeMap.get(l.employeeId);
      if (!emp) continue;
      const arr = map.get(l.date) ?? [];
      arr.push({ entry: l, employee: emp });
      map.set(l.date, arr);
    }
    return map;
  }, [days, leaves, filteredEmpIdSet, employeeMap]);

  // Full store per-day role counts (independent of role filter so quota status stays accurate)
  const allLeavesByDateRole = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const day of days) {
      map.set(day, new Map<string, number>());
    }
    for (const l of leaves) {
      const emp = employeeMap.get(l.employeeId);
      if (!emp) continue;
      const dayMap = map.get(l.date);
      if (!dayMap) continue;
      dayMap.set(emp.role, (dayMap.get(emp.role) ?? 0) + 1);
    }
    return map;
  }, [days, leaves, employeeMap]);

  const totalLeavesThisWeek = useMemo(() => {
    let count = 0;
    for (const list of leavesByDate.values()) {
      count += list.length;
    }
    return count;
  }, [leavesByDate]);

  const thisWeekStart = getWeekStart();
  const nextWeekStart = addDaysYMD(thisWeekStart, 7);
  const warningThreshold = settings?.maxDailyLeaveWarning ?? 3;

  async function handleCopySummary() {
    if (!days.length) return;
    const storeLabel = settings?.storeName ?? '門市';
    const header = `【${storeLabel} 週排休總覽】${formatWeekRangeLabel(weekStart)}${
      roleFilter !== 'ALL' ? `（篩選：${roleFilter}）` : ''
    }`;
    const lines = days.map((day, idx) => {
      const items = leavesByDate.get(day) ?? [];
      const names =
        items.length > 0
          ? items.map(({ employee }) => `${employee.name}(${employee.role})`).join('、')
          : '全員出勤';
      return `${formatWeekdayLabel(idx)} ${formatShortDate(day)}：${names}`;
    });

    const text = `${header}\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('瀏覽器無法自動存取剪貼簿，請手動選取內容複製');
    }
  }

  async function handleToggleCell(employeeId: string, date: string, mode?: 'toggle' | 'upsert' | 'remove') {
    const key = `${employeeId}_${date}`;
    setBusyKey(key);
    setErrorMsg(null);
    try {
      await toggleLeave({ employeeId, date, mode: mode ?? 'toggle' });
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAdminAddLeave(date: string, employeeId: string) {
    if (!employeeId) return;
    await handleToggleCell(employeeId, date, 'upsert');
    setAdminAddDay(null);
    setAdminSelectedEmpId('');
  }

  const canSeeOthers = currentUser.isAdmin || (settings?.allowEmployeesViewAll ?? true);

  return (
    <div className="space-y-6">
      {/* Header Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-900">該週劃假總覽</h2>
              {settings?.lockNextWeekOnWednesday && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                    isWeekLocked
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-teal-50 text-teal-800 border border-teal-200'
                  }`}
                >
                  {isWeekLocked && <Lock className="w-3 h-3" />}
                  {isWeekLocked
                    ? `已於 ${formatShortDate(lockCutoffDate)} 週三鎖定`
                    : `開放至 ${formatShortDate(lockCutoffDate)} 週三前`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1 tabular-nums">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <CalendarDays className="w-3.5 h-3.5 text-teal-700" />
                {formatWeekRangeLabel(weekStart)}
              </span>
              <span aria-hidden="true">·</span>
              <span>顯示人數：{filteredEmployees.length} 人</span>
              <span aria-hidden="true">·</span>
              <span>本週排休總計：{totalLeavesThisWeek} 人次</span>
              {limitedRoles.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    每日上限：
                    {limitedRoles.map((r) => `${r.role} ${r.limit} 位`).join(' / ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Week Navigation */}
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

            {/* View Switcher */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('daily-board')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'daily-board'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>每日名單</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'matrix'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>人員矩陣表</span>
              </button>
            </div>

            {/* One-Click Copy Summary */}
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已複製週休名單' : '一鍵複製本週名單'}</span>
            </button>
          </div>
        </div>

        {/* Role Filter Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 mr-1">職位篩選：</span>
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                roleFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              全部 ({allEmployees.length})
            </button>
            {availableRoles.map((role) => {
              const count = allEmployees.filter((e) => e.role === role).length;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    roleFilter === role
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {role} ({count})
                </button>
              );
            })}
          </div>

          {!canSeeOthers && (
            <span className="text-xs text-amber-700">
              目前門市設定僅顯示您個人的排休紀錄
            </span>
          )}
          {currentUser.isAdmin && (
            <span className="text-xs text-slate-500">
              管理員權限：可不受週三鎖定與人數上限限制，直接代劃或調整排休
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* Main Content */}
      {loading && !schedule ? (
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : viewMode === 'daily-board' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((date, idx) => {
            const items = leavesByDate.get(date) ?? [];
            const isToday = isTodayYMD(date);
            const isCrowded = items.length > warningThreshold;
            const onDutyCount = Math.max(0, filteredEmployees.length - items.length);
            const notOffEmployees = filteredEmployees.filter(
              (emp) => !leaveLookup.has(`${emp.id}_${date}`),
            );
            const dayRoleMap = allLeavesByDateRole.get(date);

            return (
              <div
                key={date}
                className={`bg-white border rounded-xl p-4 flex flex-col justify-between ${
                  isToday ? 'border-teal-600 ring-1 ring-teal-600/15' : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Day Header */}
                  <div className="pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {formatWeekdayLabel(idx)}
                      </span>
                      {isToday && (
                        <span className="text-[11px] font-semibold text-teal-700">今天</span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {formatShortDate(date)}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        休 {items.length} / 班 {onDutyCount}
                      </span>
                    </div>

                    {/* Separated Role Quotas */}
                    {canSeeOthers && limitedRoles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {limitedRoles.map(({ role, limit }) => {
                          const used = dayRoleMap?.get(role) ?? 0;
                          const isOver = used > limit;
                          const isFull = used === limit;
                          return (
                            <div
                              key={role}
                              className={`flex items-center justify-between text-[11px] font-mono tabular-nums ${
                                isOver
                                  ? 'text-red-700 font-semibold'
                                  : isFull
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-slate-500'
                              }`}
                            >
                              <span className="font-sans">{role}</span>
                              <span>
                                {used}/{limit}
                                {isOver ? ' 超額' : isFull ? ' 滿' : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isCrowded && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-2 py-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>排休較多（人力留意）</span>
                      </div>
                    )}
                  </div>

                  {/* Names List */}
                  <div className="mt-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">無人排休（全員出勤）</p>
                    ) : (
                      items.map(({ employee, entry }) => {
                        const canEdit =
                          currentUser.isAdmin || (!isWeekLocked && employee.id === currentUser.id);
                        const key = `${employee.id}_${date}`;
                        return (
                          <div
                            key={entry.id}
                            className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-900 truncate">
                                  {employee.name}
                                </span>
                                {employee.id === currentUser.id && (
                                  <span className="text-[11px] font-medium text-teal-700 shrink-0">
                                    (我)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                {employee.role}
                              </div>
                            </div>

                            {canEdit && (
                              <button
                                type="button"
                                disabled={busyKey === key}
                                onClick={() => handleToggleCell(employee.id, date, 'remove')}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer shrink-0"
                                title="取消此排休"
                                aria-label={`取消 ${employee.name} 的排休`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Admin Quick Add for This Day */}
                {currentUser.isAdmin && notOffEmployees.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {adminAddDay === date ? (
                      <div className="space-y-2">
                        <select
                          value={adminSelectedEmpId}
                          onChange={(e) => setAdminSelectedEmpId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-teal-700"
                        >
                          <option value="">選擇員工...</option>
                          {notOffEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}（{emp.role}）
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!adminSelectedEmpId || busyKey !== null}
                            onClick={() => handleAdminAddLeave(date, adminSelectedEmpId)}
                            className="flex-1 py-1.5 px-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white rounded-md cursor-pointer"
                          >
                            確定
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminAddDay(null);
                              setAdminSelectedEmpId('');
                            }}
                            className="py-1.5 px-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminAddDay(date);
                          setAdminSelectedEmpId(notOffEmployees[0]?.id ?? '');
                        }}
                        className="w-full py-1.5 px-2 text-xs font-medium text-slate-600 hover:text-teal-800 hover:bg-teal-50/70 rounded-lg border border-dashed border-slate-200 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>代劃排休</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Matrix Table View */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-600 whitespace-nowrap min-w-[170px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    員工姓名 · 職位
                  </th>
                  {days.map((date, idx) => {
                    const isToday = isTodayYMD(date);
                    const dayCount = (leavesByDate.get(date) ?? []).length;
                    const isCrowded = dayCount > warningThreshold;
                    const dayRoleMap = allLeavesByDateRole.get(date);
                    return (
                      <th
                        key={date}
                        className={`py-3 px-3 text-center min-w-[105px] border-r border-slate-100 last:border-r-0 ${
                          isToday ? 'bg-teal-50/60' : ''
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-800">
                          {formatWeekdayLabel(idx)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                          {formatShortDate(date)}
                        </div>
                        <div
                          className={`text-[11px] font-mono tabular-nums mt-1 ${
                            isCrowded ? 'text-amber-700 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          共休 {dayCount} 人
                        </div>
                        {canSeeOthers && limitedRoles.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {limitedRoles.map(({ role, limit }) => {
                              const used = dayRoleMap?.get(role) ?? 0;
                              return (
                                <div
                                  key={role}
                                  className={`text-[10px] font-mono tabular-nums ${
                                    used > limit
                                      ? 'text-red-700 font-semibold'
                                      : used === limit
                                        ? 'text-amber-700 font-semibold'
                                        : 'text-slate-400'
                                  }`}
                                >
                                  {role} {used}/{limit}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                    週休天數
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                      此職位分類目前沒有在職員工
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    let weekCount = 0;
                    for (const d of days) {
                      if (leaveLookup.has(`${emp.id}_${d}`)) weekCount += 1;
                    }
                    const overLimit = emp.weeklyLeaveLimit > 0 && weekCount > emp.weeklyLeaveLimit;
                    const canEditRow =
                      currentUser.isAdmin || (!isWeekLocked && emp.id === currentUser.id);

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                              {emp.name}
                            </span>
                            {emp.id === currentUser.id && (
                              <span className="text-[11px] font-medium text-teal-700">我</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">
                            <span>{emp.role}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">{emp.id}</span>
                          </div>
                        </td>

                        {days.map((date) => {
                          const entry = leaveLookup.get(`${emp.id}_${date}`) ?? null;
                          const cellKey = `${emp.id}_${date}`;
                          const isBusy = busyKey === cellKey;
                          return (
                            <td
                              key={date}
                              className="p-1.5 text-center border-r border-slate-100 last:border-r-0 align-middle"
                            >
                              <button
                                type="button"
                                disabled={!canEditRow || isBusy}
                                onClick={() => {
                                  if (canEditRow) {
                                    void handleToggleCell(emp.id, date);
                                  }
                                }}
                                title={
                                  canEditRow
                                    ? entry
                                      ? `點擊取消 ${emp.name} 排休`
                                      : `點擊為 ${emp.name} 劃定排休`
                                    : entry
                                      ? '排休'
                                      : '出勤'
                                }
                                className={`w-full min-h-[40px] px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center ${
                                  entry
                                    ? canEditRow
                                      ? 'bg-teal-700 text-white font-semibold hover:bg-teal-800'
                                      : 'bg-teal-700/90 text-white font-semibold'
                                    : canEditRow
                                      ? 'text-slate-300 hover:text-slate-700 hover:bg-slate-100'
                                      : 'text-slate-300'
                                } ${canEditRow ? 'cursor-pointer' : 'cursor-default'}`}
                              >
                                {isBusy ? '...' : entry ? '排休' : '—'}
                              </button>
                            </td>
                          );
                        })}

                        <td className="py-3 px-4 text-right font-mono tabular-nums text-sm whitespace-nowrap">
                          <span className={overLimit ? 'font-bold text-amber-700' : 'font-semibold text-slate-800'}>
                            {weekCount}
                          </span>
                          {emp.weeklyLeaveLimit > 0 && (
                            <span className="text-xs text-slate-400"> / {emp.weeklyLeaveLimit}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
