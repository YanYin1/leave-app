import type { Employee, LeaveEntry, StoreDatabase, StoreSettings } from './src/types.ts';

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface WorkerEnv {
  LEAVE_STORE?: KVNamespaceLike;
}

const DB_KEY = 'store_db_v1';
const SECRET_KEY = 'auth_secret_v1';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeEmployeeId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function isValidEmployeeId(id: string): boolean {
  return /^[A-Z0-9_-]{2,16}$/.test(id);
}

function isValidYMD(ymd: unknown): ymd is string {
  return typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}

function getTaiwanTodayYMD(): string {
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

function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getMondayFromYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getLockCutoffYMD(weekStartYMD: string): string {
  return addDaysYMD(weekStartYMD, -5);
}

function formatShortMMDD(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function createInitialDatabase(): StoreDatabase {
  const nowIso = new Date().toISOString();
  const mon = getMondayFromYMD(getTaiwanTodayYMD());

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

async function readStore(kv: KVNamespaceLike): Promise<StoreDatabase> {
  const raw = await kv.get(DB_KEY);
  if (!raw) {
    const initial = createInitialDatabase();
    await kv.put(DB_KEY, JSON.stringify(initial));
    return initial;
  }
  const parsed = JSON.parse(raw) as StoreDatabase;
  if (!parsed.settings.roleDailyLimits) {
    parsed.settings.roleDailyLimits = { 正職: 1, 工讀生: 2 };
  }
  if (parsed.settings.lockNextWeekOnWednesday === undefined) {
    parsed.settings.lockNextWeekOnWednesday = true;
  }
  return parsed;
}

async function writeStore(kv: KVNamespaceLike, db: StoreDatabase): Promise<void> {
  await kv.put(DB_KEY, JSON.stringify(db));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(kv: KVNamespaceLike): Promise<CryptoKey> {
  let secret = await kv.get(SECRET_KEY);
  if (!secret || secret.length < 32) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    secret = toBase64Url(buf);
    await kv.put(SECRET_KEY, secret);
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signToken(kv: KVNamespaceLike, employeeId: string): Promise<string> {
  const key = await getHmacKey(kv);
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ employeeId, iat: Date.now() })),
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sig = toBase64Url(new Uint8Array(sigBuf));
  return `${payload}.${sig}`;
}

async function verifyToken(kv: KVNamespaceLike, token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  try {
    const key = await getHmacKey(kv);
    const sigBytes = fromBase64Url(sig);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!ok) return null;
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      employeeId?: string;
    };
    return typeof decoded.employeeId === 'string' ? decoded.employeeId : null;
  } catch {
    return null;
  }
}

async function authenticate(
  req: Request,
  kv: KVNamespaceLike,
  db: StoreDatabase,
): Promise<{ user?: Employee; errorResponse?: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { errorResponse: jsonResponse({ error: '請先輸入員工編號登入' }, 401) };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const empId = await verifyToken(kv, token);
  if (!empId) {
    return { errorResponse: jsonResponse({ error: '登入憑證無效，請重新登入' }, 401) };
  }
  const user = db.employees.find((e) => e.id === empId && e.active);
  if (!user) {
    return { errorResponse: jsonResponse({ error: '此員工編號已不在有效名單內，請洽管理員' }, 401) };
  }
  return { user };
}

async function parseJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/health' && method === 'GET') {
    return jsonResponse({ ok: true, runtime: 'cloudflare', kvBound: Boolean(env.LEAVE_STORE) });
  }

  const kv = env.LEAVE_STORE;
  if (!kv) {
    return jsonResponse(
      {
        error: '尚未綁定 Cloudflare KV（LEAVE_STORE）',
        code: 'KV_NOT_BOUND',
      },
      503,
    );
  }

  if (path === '/api/public/config' && method === 'GET') {
    const db = await readStore(kv);
    const activeAdmins = db.employees.filter((e) => e.active && e.isAdmin);
    const hintAccounts = db.settings.showLoginHint
      ? db.employees
          .filter((e) => e.active)
          .slice(0, 6)
          .map((e) => ({ id: e.id, name: e.name, role: e.role, isAdmin: e.isAdmin }))
      : [];
    return jsonResponse({
      storeName: db.settings.storeName,
      showLoginHint: db.settings.showLoginHint,
      needsBootstrap: activeAdmins.length === 0,
      hintAccounts,
    });
  }

  if (path === '/api/setup/bootstrap-admin' && method === 'POST') {
    const body = await parseJson(request);
    const id = normalizeEmployeeId(body.id);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : '';
    if (!id || !isValidEmployeeId(id)) {
      return jsonResponse({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' }, 400);
    }
    if (!name) {
      return jsonResponse({ error: '請輸入管理員姓名' }, 400);
    }
    const db = await readStore(kv);
    if (db.employees.some((e) => e.active && e.isAdmin)) {
      return jsonResponse({ error: '系統已存在管理員，請直接以管理員編號登入' }, 400);
    }
    let emp = db.employees.find((e) => e.id === id);
    if (emp) {
      emp.name = name;
      emp.isAdmin = true;
      emp.active = true;
    } else {
      emp = {
        id,
        name,
        role: '店長',
        isAdmin: true,
        weeklyLeaveLimit: 2,
        active: true,
        createdAt: new Date().toISOString(),
      };
      db.employees.push(emp);
    }
    await writeStore(kv, db);
    const token = await signToken(kv, emp.id);
    return jsonResponse({ token, user: emp }, 201);
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await parseJson(request);
    const employeeId = normalizeEmployeeId(body.employeeId);
    if (!employeeId) {
      return jsonResponse({ error: '請輸入員工編號' }, 400);
    }
    const db = await readStore(kv);
    const employee = db.employees.find((e) => e.id === employeeId && e.active);
    if (!employee) {
      return jsonResponse(
        { error: `查無啟用中的員工編號「${employeeId}」，請確認是否已在名單內。` },
        401,
      );
    }
    const token = await signToken(kv, employee.id);
    return jsonResponse({ token, user: employee });
  }

  const db = await readStore(kv);
  const auth = await authenticate(request, kv, db);
  if (auth.errorResponse || !auth.user) {
    return auth.errorResponse!;
  }
  const actor = auth.user;

  if (path === '/api/auth/me' && method === 'GET') {
    return jsonResponse({ user: actor });
  }

  if (path === '/api/schedule' && method === 'GET') {
    const rawWeekStart = url.searchParams.get('weekStart');
    const serverToday = getTaiwanTodayYMD();
    const weekStart = isValidYMD(rawWeekStart)
      ? getMondayFromYMD(rawWeekStart)
      : getMondayFromYMD(serverToday);
    const days = Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i));
    const lockCutoffDate = getLockCutoffYMD(weekStart);
    const isWeekLocked = db.settings.lockNextWeekOnWednesday && serverToday >= lockCutoffDate;
    const canViewAll = actor.isAdmin || db.settings.allowEmployeesViewAll;

    const employees = db.employees
      .filter((e) => e.active && (canViewAll || e.id === actor.id))
      .sort((a, b) => (a.isAdmin !== b.isAdmin ? (a.isAdmin ? -1 : 1) : a.id.localeCompare(b.id)));
    const daySet = new Set(days);
    const activeIds = new Set(employees.map((e) => e.id));
    const leaves = db.leaves.filter((l) => daySet.has(l.date) && activeIds.has(l.employeeId));

    return jsonResponse({
      weekStart,
      weekEnd: days[6],
      days,
      serverToday,
      lockCutoffDate,
      isWeekLocked,
      employees,
      leaves,
      settings: db.settings,
    });
  }

  if (path === '/api/leaves/toggle' && method === 'POST') {
    const body = await parseJson(request);
    const date = body.date;
    const mode = body.mode;
    if (!isValidYMD(date)) {
      return jsonResponse({ error: '日期格式錯誤' }, 400);
    }
    const targetId = body.employeeId ? normalizeEmployeeId(body.employeeId) : actor.id;
    if (targetId !== actor.id && !actor.isAdmin) {
      return jsonResponse({ error: '一般員工僅能修改自己的排休紀錄' }, 403);
    }

    const serverToday = getTaiwanTodayYMD();
    const lockCutoffDate = getLockCutoffYMD(getMondayFromYMD(date));
    if (db.settings.lockNextWeekOnWednesday && !actor.isAdmin && serverToday >= lockCutoffDate) {
      return jsonResponse(
        { error: `該週已於 ${formatShortMMDD(lockCutoffDate)}（週三）鎖定劃假，如需異動請洽管理員` },
        403,
      );
    }

    const targetEmp = db.employees.find((e) => e.id === targetId && e.active);
    if (!targetEmp) {
      return jsonResponse({ error: '找不到此有效員工編號' }, 400);
    }

    const existingIdx = db.leaves.findIndex((l) => l.employeeId === targetId && l.date === date);
    if (mode === 'remove' || (mode !== 'upsert' && existingIdx !== -1)) {
      if (existingIdx !== -1) {
        db.leaves.splice(existingIdx, 1);
      }
      await writeStore(kv, db);
      return jsonResponse({ status: 'removed', entry: null });
    }

    const roleLimit = db.settings.roleDailyLimits?.[targetEmp.role] ?? 0;
    if (!actor.isAdmin && roleLimit > 0 && existingIdx === -1) {
      const sameRoleIds = new Set(
        db.employees.filter((e) => e.active && e.role === targetEmp.role).map((e) => e.id),
      );
      const count = db.leaves.filter((l) => l.date === date && sameRoleIds.has(l.employeeId)).length;
      if (count >= roleLimit) {
        return jsonResponse(
          { error: `${formatShortMMDD(date)}「${targetEmp.role}」排休名額已滿（每日上限 ${roleLimit} 位）` },
          409,
        );
      }
    }

    const entry: LeaveEntry = {
      id: `${targetId}_${date}`,
      employeeId: targetId,
      date,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    };
    if (existingIdx !== -1) db.leaves[existingIdx] = entry;
    else db.leaves.push(entry);

    await writeStore(kv, db);
    return jsonResponse({ status: 'saved', entry });
  }

  if (!actor.isAdmin) {
    return jsonResponse({ error: '需要管理員權限才能執行此操作' }, 403);
  }

  if (path === '/api/employees' && method === 'GET') {
    return jsonResponse({ employees: db.employees, settings: db.settings });
  }

  if (path === '/api/employees' && method === 'POST') {
    const body = await parseJson(request);
    const id = normalizeEmployeeId(body.id);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : '';
    const role = typeof body.role === 'string' ? body.role.trim().slice(0, 20) : '';
    const isAdmin = Boolean(body.isAdmin);
    const weeklyLeaveLimit = Math.max(0, Math.min(7, Number(body.weeklyLeaveLimit ?? 2) || 0));

    if (!id || !isValidEmployeeId(id)) {
      return jsonResponse({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' }, 400);
    }
    if (!name) return jsonResponse({ error: '請輸入員工姓名' }, 400);
    if (!role) return jsonResponse({ error: '請設定員工職位（例如：正職、工讀生）' }, 400);
    if (db.employees.some((e) => e.id === id)) {
      return jsonResponse({ error: `員工編號「${id}」已存在，請使用其他編號` }, 400);
    }

    const emp: Employee = {
      id,
      name,
      role,
      isAdmin,
      weeklyLeaveLimit,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.employees.push(emp);
    if (!db.settings.roles.includes(role)) db.settings.roles.push(role);
    await writeStore(kv, db);
    return jsonResponse({ employee: emp }, 201);
  }

  if (path.startsWith('/api/employees/')) {
    const targetId = normalizeEmployeeId(decodeURIComponent(path.slice('/api/employees/'.length)));

    if (method === 'PATCH') {
      const body = await parseJson(request);
      const requestedNewId = body.id !== undefined ? normalizeEmployeeId(body.id) : targetId;
      if (!requestedNewId || !isValidEmployeeId(requestedNewId)) {
        return jsonResponse({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' }, 400);
      }

      const emp = db.employees.find((e) => e.id === targetId);
      if (!emp) return jsonResponse({ error: '找不到該員工' }, 404);
      if (requestedNewId !== targetId && db.employees.some((e) => e.id === requestedNewId)) {
        return jsonResponse({ error: `員工編號「${requestedNewId}」已存在，無法重複使用` }, 400);
      }

      const nextName =
        typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 24) : emp.name;
      const nextRole =
        typeof body.role === 'string' && body.role.trim() ? body.role.trim().slice(0, 20) : emp.role;
      const nextIsAdmin = typeof body.isAdmin === 'boolean' ? body.isAdmin : emp.isAdmin;
      const nextActive = typeof body.active === 'boolean' ? body.active : emp.active;
      const nextLimit =
        body.weeklyLeaveLimit !== undefined
          ? Math.max(0, Math.min(7, Number(body.weeklyLeaveLimit) || 0))
          : emp.weeklyLeaveLimit;

      if (emp.id === actor.id && !nextActive) {
        return jsonResponse({ error: '無法停用自己目前登入的帳號' }, 400);
      }
      const remainingAdmins = db.employees.filter(
        (e) => e.id !== targetId && e.active && e.isAdmin,
      ).length;
      if (remainingAdmins === 0 && (!nextIsAdmin || !nextActive)) {
        return jsonResponse({ error: '系統至少需要保留一位啟用中的管理員' }, 400);
      }

      if (requestedNewId !== targetId) {
        for (const leave of db.leaves) {
          if (leave.employeeId === targetId) {
            leave.employeeId = requestedNewId;
            leave.id = `${requestedNewId}_${leave.date}`;
          }
          if (leave.updatedBy === targetId) leave.updatedBy = requestedNewId;
        }
        emp.id = requestedNewId;
      }

      emp.name = nextName;
      emp.role = nextRole;
      emp.isAdmin = nextIsAdmin;
      emp.active = nextActive;
      emp.weeklyLeaveLimit = nextLimit;
      if (!db.settings.roles.includes(nextRole)) db.settings.roles.push(nextRole);

      await writeStore(kv, db);
      const newToken =
        targetId === actor.id && requestedNewId !== targetId
          ? await signToken(kv, requestedNewId)
          : undefined;

      return jsonResponse({ employee: emp, ...(newToken ? { newToken } : {}) });
    }

    if (method === 'DELETE') {
      if (targetId === actor.id) {
        return jsonResponse({ error: '無法刪除自己目前登入的帳號' }, 400);
      }
      const index = db.employees.findIndex((e) => e.id === targetId);
      if (index === -1) return jsonResponse({ error: '找不到該員工' }, 404);
      const remainingAdmins = db.employees.filter(
        (e) => e.id !== targetId && e.active && e.isAdmin,
      ).length;
      if (remainingAdmins === 0) {
        return jsonResponse({ error: '系統至少需要保留一位啟用中的管理員' }, 400);
      }
      db.employees.splice(index, 1);
      db.leaves = db.leaves.filter((l) => l.employeeId !== targetId);
      await writeStore(kv, db);
      return jsonResponse({ ok: true });
    }
  }

  if (path === '/api/settings' && method === 'PATCH') {
    const body = await parseJson(request);
    if (typeof body.storeName === 'string' && body.storeName.trim()) {
      db.settings.storeName = body.storeName.trim().slice(0, 30);
    }
    if (Array.isArray(body.roles)) {
      const cleanRoles = Array.from(
        new Set<string>(
          body.roles
            .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
            .map((r) => r.trim().slice(0, 20)),
        ),
      );
      if (cleanRoles.length > 0) db.settings.roles = cleanRoles;
    }
    if (body.roleDailyLimits && typeof body.roleDailyLimits === 'object') {
      const nextLimits: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.roleDailyLimits as Record<string, unknown>)) {
        const roleKey = k.trim().slice(0, 20);
        const num = Math.max(0, Math.min(20, Number(v) || 0));
        if (roleKey && num > 0) nextLimits[roleKey] = num;
      }
      db.settings.roleDailyLimits = nextLimits;
    }
    if (body.maxDailyLeaveWarning !== undefined) {
      db.settings.maxDailyLeaveWarning = Math.max(
        1,
        Math.min(20, Number(body.maxDailyLeaveWarning) || 2),
      );
    }
    if (typeof body.allowEmployeesViewAll === 'boolean') {
      db.settings.allowEmployeesViewAll = body.allowEmployeesViewAll;
    }
    if (typeof body.showLoginHint === 'boolean') {
      db.settings.showLoginHint = body.showLoginHint;
    }
    if (typeof body.lockNextWeekOnWednesday === 'boolean') {
      db.settings.lockNextWeekOnWednesday = body.lockNextWeekOnWednesday;
    }
    await writeStore(kv, db);
    return jsonResponse({ settings: db.settings });
  }

  return jsonResponse({ error: 'Not Found' }, 404);
}
