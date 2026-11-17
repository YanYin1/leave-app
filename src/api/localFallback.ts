import type {
  Employee,
  LeaveEntry,
  PublicConfigResponse,
  ScheduleResponse,
  StoreDatabase,
  StoreSettings,
} from '../types.ts';
import {
  addDaysYMD,
  formatYMD,
  getWeekDays,
  getWeekLockCutoffYMD,
  getWeekStart,
  getWeekStartFromYMD,
} from '../utils/date.ts';

const DB_KEY = 'shiftoff_static_db_v1';
const SESSION_KEY = 'shiftoff_static_session_id';

function createSeedDatabase(): StoreDatabase {
  const nowIso = new Date().toISOString();
  const mon = getWeekStart();

  const employees: Employee[] = [
    { id: 'M001', name: '林店長', role: '店長', isAdmin: true, weeklyLeaveLimit: 2, active: true, createdAt: nowIso },
    { id: 'E001', name: '陳小美', role: '正職', isAdmin: false, weeklyLeaveLimit: 2, active: true, createdAt: nowIso },
    { id: 'E002', name: '張家豪', role: '正職', isAdmin: false, weeklyLeaveLimit: 2, active: true, createdAt: nowIso },
    { id: 'PT01', name: '林志豪', role: '工讀生', isAdmin: false, weeklyLeaveLimit: 3, active: true, createdAt: nowIso },
    { id: 'PT02', name: '王怡君', role: '工讀生', isAdmin: false, weeklyLeaveLimit: 3, active: true, createdAt: nowIso },
  ];

  const seedLeaves: Array<{ empId: string; offset: number }> = [
    { empId: 'M001', offset: 2 },
    { empId: 'E001', offset: 0 },
    { empId: 'E001', offset: 4 },
    { empId: 'E002', offset: 1 },
    { empId: 'E002', offset: 5 },
    { empId: 'PT01', offset: 1 },
    { empId: 'PT01', offset: 3 },
    { empId: 'PT02', offset: 3 },
    { empId: 'PT02', offset: 6 },
  ];

  const leaves: LeaveEntry[] = seedLeaves.map((item) => {
    const date = addDaysYMD(mon, item.offset);
    return {
      id: `${item.empId}_${date}`,
      employeeId: item.empId,
      date,
      updatedAt: nowIso,
      updatedBy: item.empId,
    };
  });

  const settings: StoreSettings = {
    storeName: '日和門市',
    roles: ['店長', '副店長', '正職', '工讀生', '實習生'],
    roleDailyLimits: { 正職: 1, 工讀生: 2 },
    maxDailyLeaveWarning: 3,
    allowEmployeesViewAll: true,
    showLoginHint: true,
    lockNextWeekOnWednesday: true,
  };

  return { settings, employees, leaves };
}

function readDb(): StoreDatabase {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      return JSON.parse(raw) as StoreDatabase;
    }
  } catch {
    // Fallback to fresh seed
  }
  const seed = createSeedDatabase();
  writeDb(seed);
  return seed;
}

function writeDb(db: StoreDatabase): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota errors
  }
}

function getCurrentUser(db: StoreDatabase): Employee | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return db.employees.find((e) => e.id === id && e.active) ?? null;
  } catch {
    return null;
  }
}

function requireCurrentUser(db: StoreDatabase): Employee {
  const user = getCurrentUser(db);
  if (!user) throw new Error('請先輸入員工編號登入');
  return user;
}

export function localGetPublicConfig(): PublicConfigResponse {
  const db = readDb();
  const activeAdmins = db.employees.filter((e) => e.active && e.isAdmin);
  return {
    storeName: db.settings.storeName,
    showLoginHint: db.settings.showLoginHint,
    needsBootstrap: activeAdmins.length === 0,
    isLocalFallback: true,
    hintAccounts: db.settings.showLoginHint
      ? db.employees
          .filter((e) => e.active)
          .slice(0, 6)
          .map((e) => ({ id: e.id, name: e.name, role: e.role, isAdmin: e.isAdmin }))
      : [],
  };
}

export function localLogin(rawId: string): { token: string; user: Employee } {
  const id = rawId.trim().toUpperCase();
  if (!id) throw new Error('請輸入員工編號');
  const db = readDb();
  const emp = db.employees.find((e) => e.id === id && e.active);
  if (!emp) {
    throw new Error(`查無啟用中的員工編號「${id}」，請確認是否已在名單內。`);
  }
  localStorage.setItem(SESSION_KEY, emp.id);
  return { token: `local:${emp.id}`, user: emp };
}

export function localBootstrapAdmin(idRaw: string, nameRaw: string): { token: string; user: Employee } {
  const id = idRaw.trim().toUpperCase();
  const name = nameRaw.trim().slice(0, 24);
  if (!/^[A-Z0-9_-]{2,16}$/.test(id)) throw new Error('員工編號需為 2–16 碼英數字');
  if (!name) throw new Error('請輸入姓名');
  const db = readDb();
  if (db.employees.some((e) => e.active && e.isAdmin)) {
    throw new Error('系統已存在管理員，請直接以管理員編號登入');
  }
  const emp: Employee = {
    id,
    name,
    role: '店長',
    isAdmin: true,
    weeklyLeaveLimit: 2,
    active: true,
    createdAt: new Date().toISOString(),
  };
  db.employees.push(emp);
  writeDb(db);
  localStorage.setItem(SESSION_KEY, emp.id);
  return { token: `local:${emp.id}`, user: emp };
}

export function localLogout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function localFetchMe(): { user: Employee } {
  const db = readDb();
  return { user: requireCurrentUser(db) };
}

export function localFetchSchedule(rawWeekStart: string): ScheduleResponse {
  const db = readDb();
  const user = requireCurrentUser(db);
  const weekStart = getWeekStartFromYMD(rawWeekStart);
  const days = getWeekDays(weekStart);
  const serverToday = formatYMD(new Date());
  const lockCutoffDate = getWeekLockCutoffYMD(weekStart);
  const isWeekLocked = db.settings.lockNextWeekOnWednesday && serverToday >= lockCutoffDate;
  const canViewAll = user.isAdmin || db.settings.allowEmployeesViewAll;

  const employees = db.employees
    .filter((e) => e.active && (canViewAll || e.id === user.id))
    .sort((a, b) => (a.isAdmin !== b.isAdmin ? (a.isAdmin ? -1 : 1) : a.id.localeCompare(b.id)));
  const daySet = new Set(days);
  const activeIds = new Set(employees.map((e) => e.id));
  const leaves = db.leaves.filter((l) => daySet.has(l.date) && activeIds.has(l.employeeId));

  return {
    weekStart,
    weekEnd: days[6],
    days,
    serverToday,
    lockCutoffDate,
    isWeekLocked,
    employees,
    leaves,
    settings: db.settings,
  };
}

export function localToggleLeave(payload: {
  date: string;
  employeeId?: string;
  mode?: 'toggle' | 'upsert' | 'remove';
}): { status: 'saved' | 'removed'; entry: LeaveEntry | null } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  const targetId = payload.employeeId ? payload.employeeId.trim().toUpperCase() : actor.id;
  if (targetId !== actor.id && !actor.isAdmin) {
    throw new Error('一般員工僅能修改自己的排休紀錄');
  }
  const weekStart = getWeekStartFromYMD(payload.date);
  const cutoff = getWeekLockCutoffYMD(weekStart);
  const today = formatYMD(new Date());
  if (db.settings.lockNextWeekOnWednesday && !actor.isAdmin && today >= cutoff) {
    throw new Error('該週已於週三鎖定劃假，如需異動請洽管理員');
  }
  const targetEmp = db.employees.find((e) => e.id === targetId && e.active);
  if (!targetEmp) throw new Error('找不到此有效員工編號');

  const existingIdx = db.leaves.findIndex((l) => l.employeeId === targetId && l.date === payload.date);
  if (payload.mode === 'remove' || (payload.mode !== 'upsert' && existingIdx !== -1)) {
    if (existingIdx !== -1) db.leaves.splice(existingIdx, 1);
    writeDb(db);
    return { status: 'removed', entry: null };
  }

  const roleLimit = db.settings.roleDailyLimits?.[targetEmp.role] ?? 0;
  if (!actor.isAdmin && roleLimit > 0 && existingIdx === -1) {
    const sameRoleIds = new Set(
      db.employees.filter((e) => e.active && e.role === targetEmp.role).map((e) => e.id),
    );
    const count = db.leaves.filter((l) => l.date === payload.date && sameRoleIds.has(l.employeeId)).length;
    if (count >= roleLimit) {
      throw new Error(`「${targetEmp.role}」該日排休名額已滿（每日上限 ${roleLimit} 位）`);
    }
  }

  const entry: LeaveEntry = {
    id: `${targetId}_${payload.date}`,
    employeeId: targetId,
    date: payload.date,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  if (existingIdx !== -1) db.leaves[existingIdx] = entry;
  else db.leaves.push(entry);
  writeDb(db);
  return { status: 'saved', entry };
}

export function localFetchAllEmployees(): { employees: Employee[]; settings: StoreSettings } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  if (!actor.isAdmin) throw new Error('需要管理員權限');
  return { employees: db.employees, settings: db.settings };
}

export function localCreateEmployee(payload: {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  weeklyLeaveLimit: number;
}): { employee: Employee } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  if (!actor.isAdmin) throw new Error('需要管理員權限');
  const id = payload.id.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,16}$/.test(id)) throw new Error('員工編號需為 2–16 碼英數字（可含 - 或 _）');
  if (db.employees.some((e) => e.id === id)) throw new Error(`員工編號「${id}」已存在`);
  const emp: Employee = {
    id,
    name: payload.name.trim(),
    role: payload.role.trim(),
    isAdmin: payload.isAdmin,
    weeklyLeaveLimit: payload.weeklyLeaveLimit,
    active: true,
    createdAt: new Date().toISOString(),
  };
  db.employees.push(emp);
  if (!db.settings.roles.includes(emp.role)) db.settings.roles.push(emp.role);
  writeDb(db);
  return { employee: emp };
}

export function localUpdateEmployee(
  targetRawId: string,
  payload: Partial<Pick<Employee, 'id' | 'name' | 'role' | 'isAdmin' | 'weeklyLeaveLimit' | 'active'>>,
): { employee: Employee; newToken?: string } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  if (!actor.isAdmin) throw new Error('需要管理員權限');
  const targetId = targetRawId.trim().toUpperCase();
  const emp = db.employees.find((e) => e.id === targetId);
  if (!emp) throw new Error('找不到該員工');

  const nextId = payload.id !== undefined ? payload.id.trim().toUpperCase() : targetId;
  if (!/^[A-Z0-9_-]{2,16}$/.test(nextId)) throw new Error('員工編號需為 2–16 碼英數字（可含 - 或 _）');
  if (nextId !== targetId && db.employees.some((e) => e.id === nextId)) {
    throw new Error(`員工編號「${nextId}」已存在，無法重複使用`);
  }

  const nextIsAdmin = payload.isAdmin ?? emp.isAdmin;
  const nextActive = payload.active ?? emp.active;
  if (emp.id === actor.id && !nextActive) throw new Error('無法停用自己目前登入的帳號');
  const remainingAdmins = db.employees.filter((e) => e.id !== targetId && e.active && e.isAdmin).length;
  if (remainingAdmins === 0 && (!nextIsAdmin || !nextActive)) {
    throw new Error('系統至少需要保留一位啟用中的管理員');
  }

  if (nextId !== targetId) {
    for (const l of db.leaves) {
      if (l.employeeId === targetId) {
        l.employeeId = nextId;
        l.id = `${nextId}_${l.date}`;
      }
      if (l.updatedBy === targetId) l.updatedBy = nextId;
    }
    emp.id = nextId;
    if (targetId === actor.id) {
      localStorage.setItem(SESSION_KEY, nextId);
    }
  }

  if (payload.name !== undefined) emp.name = payload.name.trim();
  if (payload.role !== undefined) emp.role = payload.role.trim();
  emp.isAdmin = nextIsAdmin;
  emp.active = nextActive;
  if (payload.weeklyLeaveLimit !== undefined) emp.weeklyLeaveLimit = payload.weeklyLeaveLimit;
  if (!db.settings.roles.includes(emp.role)) db.settings.roles.push(emp.role);

  writeDb(db);
  return {
    employee: emp,
    ...(targetId === actor.id && nextId !== targetId ? { newToken: `local:${nextId}` } : {}),
  };
}

export function localDeleteEmployee(targetRawId: string): { ok: boolean } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  if (!actor.isAdmin) throw new Error('需要管理員權限');
  const targetId = targetRawId.trim().toUpperCase();
  if (targetId === actor.id) throw new Error('無法刪除自己目前登入的帳號');
  const idx = db.employees.findIndex((e) => e.id === targetId);
  if (idx === -1) throw new Error('找不到該員工');
  const remainingAdmins = db.employees.filter((e) => e.id !== targetId && e.active && e.isAdmin).length;
  if (remainingAdmins === 0) throw new Error('系統至少需要保留一位啟用中的管理員');
  db.employees.splice(idx, 1);
  db.leaves = db.leaves.filter((l) => l.employeeId !== targetId);
  writeDb(db);
  return { ok: true };
}

export function localUpdateSettings(payload: Partial<StoreSettings>): { settings: StoreSettings } {
  const db = readDb();
  const actor = requireCurrentUser(db);
  if (!actor.isAdmin) throw new Error('需要管理員權限');
  db.settings = { ...db.settings, ...payload };
  writeDb(db);
  return { settings: db.settings };
}
