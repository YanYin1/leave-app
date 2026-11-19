import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit2,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { Employee, StoreSettings } from '../types.ts';
import {
  createEmployee,
  deleteEmployee,
  fetchAllEmployees,
  updateEmployee,
  updateSettings,
} from '../api/client.ts';
import { formatLockWeekdayLabel } from '../utils/date.ts';

interface TeamManagementViewProps {
  currentUser: Employee;
  onRosterUpdated: () => Promise<void>;
}

export function TeamManagementView({ currentUser, onRosterUpdated }: TeamManagementViewProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Employee Form
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('正職');
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  const [newLimit, setNewLimit] = useState(2);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);

  // Roster Search & Edit
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editLimit, setEditLimit] = useState(2);
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Settings Form
  const [storeNameInput, setStoreNameInput] = useState('');
  const [dailyMaxLeaveInput, setDailyMaxLeaveInput] = useState(2);
  const [warningThresholdInput, setWarningThresholdInput] = useState(3);
  const [allowPeerView, setAllowPeerView] = useState(true);
  const [showLoginHint, setShowLoginHint] = useState(true);
  const [enableWeeklyLock, setEnableWeeklyLock] = useState(true);
  const [lockWeekday, setLockWeekday] = useState(3);
  const [lockTime, setLockTime] = useState('21:30');
  const [newRoleTag, setNewRoleTag] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchAllEmployees();
      setEmployees(data.employees);
      setSettings(data.settings);
      setStoreNameInput(data.settings.storeName);
      setDailyMaxLeaveInput(data.settings.dailyMaxLeave ?? 2);
      setWarningThresholdInput(data.settings.maxDailyLeaveWarning);
      setAllowPeerView(data.settings.allowEmployeesViewAll);
      setShowLoginHint(data.settings.showLoginHint);
      setEnableWeeklyLock(data.settings.enableWeeklyLock ?? true);
      setLockWeekday(data.settings.lockWeekday ?? 3);
      setLockTime(data.settings.lockTime ?? '21:30');
      if (data.settings.roles.length > 0 && !data.settings.roles.includes(newRole)) {
        setNewRole(data.settings.roles[0]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '無法載入員工名單');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2600);
  }

  const rolesList = useMemo(() => {
    const set = new Set<string>(
      settings?.roles ?? ['店長', '副店長', '正職', '工讀生', '計時員', '實習生'],
    );
    for (const emp of employees) {
      if (emp.role) set.add(emp.role);
    }
    return Array.from(set);
  }, [settings, employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      if (roleFilter !== 'ALL' && emp.role !== roleFilter) return false;
      if (q && !emp.id.toLowerCase().includes(q) && !emp.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [employees, searchQuery, roleFilter]);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const resolvedRole = (useCustomRole ? customRoleInput : newRole).trim();
    if (!newId.trim() || !newName.trim() || !resolvedRole) {
      setErrorMsg('請完整填寫員工編號、姓名與職位');
      return;
    }

    setAdding(true);
    try {
      await createEmployee({
        id: newId.trim().toUpperCase(),
        name: newName.trim(),
        role: resolvedRole,
        isAdmin: newIsAdmin,
        weeklyLeaveLimit: newLimit,
      });
      setNewId('');
      setNewName('');
      setCustomRoleInput('');
      setUseCustomRole(false);
      setNewIsAdmin(false);
      await loadData();
      await onRosterUpdated();
      flashSuccess('已成功新增員工至登入名單');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '新增員工失敗');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleAdmin(emp: Employee) {
    setErrorMsg(null);
    setSavingEmpId(emp.id);
    try {
      await updateEmployee(emp.id, { isAdmin: !emp.isAdmin });
      await loadData();
      await onRosterUpdated();
      flashSuccess(
        !emp.isAdmin ? `已將 ${emp.name} 設為管理員` : `已取消 ${emp.name} 的管理員權限`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '更新權限失敗');
    } finally {
      setSavingEmpId(null);
    }
  }

  async function handleToggleActive(emp: Employee) {
    setErrorMsg(null);
    setSavingEmpId(emp.id);
    try {
      await updateEmployee(emp.id, { active: !emp.active });
      await loadData();
      await onRosterUpdated();
      flashSuccess(!emp.active ? `已重新啟用 ${emp.name}` : `已停用 ${emp.name}（該編號無法再登入）`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '更新狀態失敗');
    } finally {
      setSavingEmpId(null);
    }
  }

  function startEdit(emp: Employee) {
    setEditingEmp(emp);
    setEditId(emp.id);
    setEditName(emp.name);
    setEditRole(emp.role);
    setEditLimit(emp.weeklyLeaveLimit);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmp) return;
    setErrorMsg(null);
    setSavingEmpId(editingEmp.id);
    try {
      await updateEmployee(editingEmp.id, {
        id: editId.trim().toUpperCase(),
        name: editName.trim(),
        role: editRole.trim(),
        weeklyLeaveLimit: editLimit,
      });
      setEditingEmp(null);
      await loadData();
      await onRosterUpdated();
      flashSuccess('員工資料已更新');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSavingEmpId(null);
    }
  }

  async function handleDeleteEmployee(emp: Employee) {
    setErrorMsg(null);
    setSavingEmpId(emp.id);
    try {
      await deleteEmployee(emp.id);
      setConfirmDeleteId(null);
      await loadData();
      await onRosterUpdated();
      flashSuccess(`已移除員工 ${emp.name}（${emp.id}）`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSavingEmpId(null);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSavingSettings(true);
    try {
      await updateSettings({
        storeName: storeNameInput.trim() || '門市',
        dailyMaxLeave: dailyMaxLeaveInput,
        maxDailyLeaveWarning: warningThresholdInput,
        allowEmployeesViewAll: allowPeerView,
        showLoginHint,
        enableWeeklyLock,
        lockWeekday,
        lockTime,
      });
      await loadData();
      await onRosterUpdated();
      flashSuccess('門市設定已儲存');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存設定失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddRoleTag() {
    const clean = newRoleTag.trim();
    if (!clean || !settings) return;
    if (settings.roles.includes(clean)) {
      setNewRoleTag('');
      return;
    }
    setSavingSettings(true);
    try {
      await updateSettings({ roles: [...settings.roles, clean] });
      setNewRoleTag('');
      await loadData();
      flashSuccess(`已新增職位「${clean}」`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '新增職位失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleRemoveRoleTag(roleToRemove: string) {
    if (!settings || settings.roles.length <= 1) return;
    setSavingSettings(true);
    try {
      await updateSettings({
        roles: settings.roles.filter((r) => r !== roleToRemove),
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '移除職位失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  const activeCount = employees.filter((e) => e.active).length;
  const adminCount = employees.filter((e) => e.active && e.isAdmin).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">員工名單與管理員設定</h2>
          <p className="text-sm text-slate-600 mt-1 tabular-nums">
            在職名單內共 <span className="font-semibold text-slate-900">{activeCount}</span> 人
            <span aria-hidden="true"> · </span>
            管理員 <span className="font-semibold text-teal-700">{adminCount}</span> 人
            <span aria-hidden="true"> · </span>
            僅名單內且啟用中的員工編號可免密碼登入
          </p>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div role="status" className="text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add Employee Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-teal-700" />
          <h3 className="text-base font-semibold text-slate-900">新增員工</h3>
        </div>

        <form onSubmit={handleAddEmployee} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label htmlFor="new-emp-id" className="block text-xs font-semibold text-slate-700 mb-1.5">
              員工編號（登入用）
            </label>
            <input
              id="new-emp-id"
              type="text"
              required
              maxLength={16}
              value={newId}
              onChange={(e) => setNewId(e.target.value.toUpperCase())}
              placeholder="例如 E003、PT03"
              className="w-full min-h-[44px] px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="new-emp-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
              員工姓名
            </label>
            <input
              id="new-emp-name"
              type="text"
              required
              maxLength={24}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如 周雅婷"
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="new-emp-role" className="text-xs font-semibold text-slate-700">
                職位
              </label>
              <button
                type="button"
                onClick={() => setUseCustomRole(!useCustomRole)}
                className="text-[11px] font-medium text-teal-700 hover:underline cursor-pointer"
              >
                {useCustomRole ? '選擇現有職位' : '自訂職位'}
              </button>
            </div>
            {useCustomRole ? (
              <input
                id="new-emp-role"
                type="text"
                required
                maxLength={20}
                value={customRoleInput}
                onChange={(e) => setCustomRoleInput(e.target.value)}
                placeholder="輸入新職位名稱"
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
            ) : (
              <select
                id="new-emp-role"
                value={newRole}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewRole(val);
                  if (val.includes('工讀') || val.includes('計時')) setNewLimit(3);
                  else setNewLimit(2);
                }}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {rolesList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="new-emp-limit" className="block text-xs font-semibold text-slate-700 mb-1.5">
              每週建議休假天數
            </label>
            <select
              id="new-emp-limit"
              value={newLimit}
              onChange={(e) => setNewLimit(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
            >
              <option value={0}>不限</option>
              <option value={1}>1 天</option>
              <option value={2}>2 天</option>
              <option value={3}>3 天</option>
              <option value={4}>4 天</option>
              <option value={5}>5 天</option>
            </select>
          </div>

          <div className="flex items-center min-h-[44px]">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span className="font-medium">設為管理員</span>
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={adding}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{adding ? '新增中...' : '加入名單'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Employee Roster Card (Mobile Cards + Desktop Table) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋編號或姓名..."
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                roleFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              全部
            </button>
            {rolesList.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  roleFilter === r
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Touch Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">載入名單中...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">沒有符合條件的員工資料</div>
          ) : (
            filteredEmployees.map((emp) => {
              const isSelf = emp.id === currentUser.id;
              const isBusy = savingEmpId === emp.id;

              return (
                <div
                  key={emp.id}
                  className={`p-4 space-y-3 ${!emp.active ? 'opacity-65 bg-slate-50/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded tabular-nums">
                          {emp.id}
                        </span>
                        <span className="text-base font-semibold text-slate-900">{emp.name}</span>
                        {isSelf && (
                          <span className="text-xs font-medium text-teal-700">(目前登入)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 tabular-nums">
                        {emp.role} · 週休建議 {emp.weeklyLeaveLimit > 0 ? `${emp.weeklyLeaveLimit} 天` : '不限'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEdit(emp)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-100 rounded-xl cursor-pointer"
                      aria-label={`編輯 ${emp.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleAdmin(emp)}
                      className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                        emp.isAdmin
                          ? 'bg-teal-50 border-teal-200 text-teal-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {emp.isAdmin ? (
                        <>
                          <Shield className="w-3.5 h-3.5" />
                          <span>管理員</span>
                        </>
                      ) : (
                        <>
                          <ShieldOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>設為管理員</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isSelf}
                      onClick={() => handleToggleActive(emp)}
                      className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        emp.active
                          ? 'bg-white border-slate-200 text-slate-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      } ${isSelf ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {emp.active ? '啟用中' : '已停用'}
                    </button>
                  </div>

                  {!isSelf && (
                    <div>
                      {confirmDeleteId === emp.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteEmployee(emp)}
                            className="flex-1 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
                          >
                            確定刪除 {emp.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[40px] px-4 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(emp.id)}
                          className="w-full min-h-[38px] text-xs text-slate-400 hover:text-red-600 py-1.5 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>刪除員工</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 whitespace-nowrap">員工編號</th>
                <th className="py-3 px-4 whitespace-nowrap">姓名</th>
                <th className="py-3 px-4 whitespace-nowrap">職位</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">週休建議</th>
                <th className="py-3 px-4 whitespace-nowrap">管理員權限</th>
                <th className="py-3 px-4 whitespace-nowrap">帳號狀態</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    載入名單中...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    沒有符合條件的員工資料
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelf = emp.id === currentUser.id;
                  const isBusy = savingEmpId === emp.id;

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !emp.active ? 'opacity-60 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {emp.id}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {emp.name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs font-normal text-teal-700">(目前登入)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{emp.role}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {emp.weeklyLeaveLimit > 0 ? `${emp.weeklyLeaveLimit} 天` : '不限'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleAdmin(emp)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                            emp.isAdmin
                              ? 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {emp.isAdmin ? (
                            <>
                              <Shield className="w-3.5 h-3.5" />
                              <span>管理員</span>
                            </>
                          ) : (
                            <>
                              <ShieldOff className="w-3.5 h-3.5 text-slate-400" />
                              <span>一般員工（設為管理員）</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isBusy || isSelf}
                          onClick={() => handleToggleActive(emp)}
                          title={isSelf ? '無法停用自己目前登入的帳號' : '點擊切換啟用或停用'}
                          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                            emp.active
                              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                          } ${isSelf ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                        >
                          {emp.active ? '啟用中（可登入）' : '已停用（禁止登入）'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === emp.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteEmployee(emp)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                            >
                              確定刪除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(emp)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="編輯編號、姓名與職位"
                              aria-label={`編輯 ${emp.name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(emp.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                title="刪除員工"
                                aria-label={`刪除 ${emp.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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

      {/* Store & Role Configuration */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-teal-700" />
          <h3 className="text-base font-semibold text-slate-900">門市規則與常用職位設定</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label htmlFor="store-name-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                店鋪名稱
              </label>
              <input
                id="store-name-input"
                type="text"
                maxLength={30}
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label htmlFor="daily-max-leave-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                每日全店可排休人數上限（包含正職與計時員）
              </label>
              <select
                id="daily-max-leave-select"
                value={dailyMaxLeaveInput}
                onChange={(e) => setDailyMaxLeaveInput(Number(e.target.value))}
                className="w-full sm:w-64 min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              >
                <option value={0}>不限人數</option>
                <option value={1}>每日最多 1 位</option>
                <option value={2}>每日最多 2 位（預設）</option>
                <option value={3}>每日最多 3 位</option>
                <option value={4}>每日最多 4 位</option>
                <option value={5}>每日最多 5 位</option>
                <option value={6}>每日最多 6 位</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                一般員工（含正職、工讀生、計時員）當日合計滿額後即無法點選；僅管理員可於總覽頁面手動加劃第 {(dailyMaxLeaveInput || 2) + 1} 位以上人員。
              </p>
            </div>

            <div>
              <label htmlFor="warning-threshold-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                單日總休假人數提醒門檻（超過此人數顯示人力留意）
              </label>
              <input
                id="warning-threshold-input"
                type="number"
                min={1}
                max={20}
                value={warningThresholdInput}
                onChange={(e) => setWarningThresholdInput(Number(e.target.value))}
                className="w-32 min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="space-y-3 pt-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableWeeklyLock}
                    onChange={(e) => setEnableWeeklyLock(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span className="font-medium">
                    啟用每週自動鎖定下週劃假（一般員工無法自行異動，管理員仍可調整）
                  </span>
                </label>

                {enableWeeklyLock && (
                  <div className="pl-6 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="lock-weekday-select"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          鎖定星期（前一週）
                        </label>
                        <select
                          id="lock-weekday-select"
                          value={lockWeekday}
                          onChange={(e) => setLockWeekday(Number(e.target.value))}
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                        >
                          <option value={1}>上週一</option>
                          <option value={2}>上週二</option>
                          <option value={3}>上週三（預設）</option>
                          <option value={4}>上週四</option>
                          <option value={5}>上週五</option>
                          <option value={6}>上週六</option>
                          <option value={7}>上週日</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="lock-time-input"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          鎖定時間（24 小時制）
                        </label>
                        <input
                          id="lock-time-input"
                          type="time"
                          required
                          value={lockTime}
                          onChange={(e) => setLockTime(e.target.value || '21:30')}
                          className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 tabular-nums">
                      目前設定：每{formatLockWeekdayLabel(lockWeekday)} {lockTime} 後鎖定下週班表（台灣時間）
                    </p>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPeerView}
                  onChange={(e) => setAllowPeerView(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>允許一般員工在週總覽查看其他同事的劃假名字</span>
              </label>

              <label className="flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLoginHint}
                  onChange={(e) => setShowLoginHint(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>在登入頁面顯示快速登入名單提示（正式使用建議關閉）</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              {savingSettings ? '儲存中...' : '儲存門市設定'}
            </button>
          </form>

          {/* Role Preset Manager */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">
                店內職位選項清單（如：正職、工讀生、計時員、店長）
              </h4>
              <div className="flex flex-wrap gap-2">
                {(settings?.roles ?? []).map((role) => (
                  <div
                    key={role}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  >
                    <span>{role}</span>
                    {(settings?.roles.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRoleTag(role)}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                        title={`移除職位 ${role}`}
                        aria-label={`移除職位 ${role}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={20}
                value={newRoleTag}
                onChange={(e) => setNewRoleTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddRoleTag();
                  }
                }}
                placeholder="新增職位名稱，例如：早班計時員"
                className="flex-1 min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
              />
              <button
                type="button"
                disabled={!newRoleTag.trim() || savingSettings}
                onClick={handleAddRoleTag}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                新增職位
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-lg pb-[env(safe-area-inset-bottom)]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">編輯員工資料</h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5">{editingEmp.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label htmlFor="edit-emp-id" className="block text-sm font-medium text-slate-700 mb-1.5">
                  員工編號（登入用）
                </label>
                <input
                  id="edit-emp-id"
                  type="text"
                  required
                  maxLength={16}
                  value={editId}
                  onChange={(e) => setEditId(e.target.value.toUpperCase())}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  修改編號後，原有排休紀錄會自動保留並轉移至新編號。
                </p>
              </div>

              <div>
                <label htmlFor="edit-emp-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  姓名
                </label>
                <input
                  id="edit-emp-name"
                  type="text"
                  required
                  maxLength={24}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">職位</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  list="role-suggestions"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                />
                <datalist id="role-suggestions">
                  {rolesList.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  每週建議休假天數
                </label>
                <select
                  value={editLimit}
                  onChange={(e) => setEditLimit(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  <option value={0}>不限</option>
                  <option value={1}>1 天</option>
                  <option value={2}>2 天</option>
                  <option value={3}>3 天</option>
                  <option value={4}>4 天</option>
                  <option value={5}>5 天</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingEmpId === editingEmp.id}
                  className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-xl cursor-pointer"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
