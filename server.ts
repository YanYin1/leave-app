import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { getAuthSecret, getTaiwanTodayYMD, mutateStore, readStore } from './server/store.ts';
import type { Employee } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);

interface AuthenticatedRequest extends Request {
  currentUser?: Employee;
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
  // Friday 00:00 of the preceding week = Monday - 3 days
  return addDaysYMD(weekStartYMD, -3);
}

function formatShortMMDD(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

async function signToken(employeeId: string): Promise<string> {
  const secret = await getAuthSecret();
  const payload = Buffer.from(JSON.stringify({ employeeId, iat: Date.now() }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function verifyToken(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const secret = await getAuthSecret();
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { employeeId?: string };
    return typeof decoded.employeeId === 'string' ? decoded.employeeId : null;
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '請先輸入員工編號登入' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const employeeId = await verifyToken(token);
  if (!employeeId) {
    res.status(401).json({ error: '登入憑證無效，請重新登入' });
    return;
  }
  const db = await readStore();
  const employee = db.employees.find((e) => e.id === employeeId && e.active);
  if (!employee) {
    res.status(401).json({ error: '此員工編號已不在有效名單內，請洽管理員' });
    return;
  }
  req.currentUser = employee;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.currentUser?.isAdmin) {
    res.status(403).json({ error: '需要管理員權限才能執行此操作' });
    return;
  }
  next();
}

async function startServer(): Promise<void> {
  await getAuthSecret();
  await readStore();

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/public/config', async (_req, res) => {
    const db = await readStore();
    const activeAdmins = db.employees.filter((e) => e.active && e.isAdmin);
    const hintAccounts = db.settings.showLoginHint
      ? db.employees
          .filter((e) => e.active)
          .slice(0, 6)
          .map((e) => ({
            id: e.id,
            name: e.name,
            role: e.role,
            isAdmin: e.isAdmin,
          }))
      : [];
    res.json({
      storeName: db.settings.storeName,
      showLoginHint: db.settings.showLoginHint,
      needsBootstrap: activeAdmins.length === 0,
      hintAccounts,
    });
  });

  // One-time bootstrap endpoint only usable when 0 active admins exist
  app.post('/api/setup/bootstrap-admin', async (req, res) => {
    const id = normalizeEmployeeId(req.body?.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 24) : '';
    if (!id || !isValidEmployeeId(id)) {
      res.status(400).json({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: '請輸入管理員姓名' });
      return;
    }
    try {
      const created = await mutateStore((db) => {
        if (db.employees.some((e) => e.active && e.isAdmin)) {
          throw new Error('系統已存在管理員，請直接以管理員編號登入');
        }
        const existing = db.employees.find((e) => e.id === id);
        if (existing) {
          existing.name = name;
          existing.isAdmin = true;
          existing.active = true;
          return existing;
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
        return emp;
      });
      const token = await signToken(created.id);
      res.status(201).json({ token, user: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : '建立管理員失敗';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const employeeId = normalizeEmployeeId(req.body?.employeeId);
    if (!employeeId) {
      res.status(400).json({ error: '請輸入員工編號' });
      return;
    }

    const db = await readStore();
    const employee = db.employees.find((e) => e.id === employeeId && e.active);
    if (!employee) {
      res.status(401).json({ error: `查無啟用中的員工編號「${employeeId}」，請確認是否已在名單內。` });
      return;
    }

    const token = await signToken(employee.id);
    res.json({ token, user: employee });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.currentUser });
  });

  app.get('/api/schedule', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    const rawWeekStart = req.query.weekStart;
    const serverToday = getTaiwanTodayYMD();
    const weekStart = isValidYMD(rawWeekStart)
      ? getMondayFromYMD(rawWeekStart)
      : getMondayFromYMD(serverToday);
    const days = Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i));
    const weekEnd = days[6];

    const db = await readStore();
    const lockCutoffDate = getLockCutoffYMD(weekStart);
    const isWeekLocked = db.settings.lockNextWeekOnFriday && serverToday >= lockCutoffDate;
    const canViewAll = user.isAdmin || db.settings.allowEmployeesViewAll;

    const activeEmployees = db.employees
      .filter((e) => e.active && (canViewAll || e.id === user.id))
      .sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return a.id.localeCompare(b.id);
      });

    const daySet = new Set(days);
    const activeIds = new Set(activeEmployees.map((e) => e.id));
    const leaves = db.leaves.filter((l) => daySet.has(l.date) && activeIds.has(l.employeeId));

    res.json({
      weekStart,
      weekEnd,
      days,
      serverToday,
      lockCutoffDate,
      isWeekLocked,
      employees: activeEmployees,
      leaves,
      settings: db.settings,
    });
  });

  // Toggle off-day (排休) with Friday 00:00 lock & combined daily cap (2/day; admin can add 3rd+)
  app.post('/api/leaves/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const { date, employeeId: targetRaw, mode } = req.body ?? {};

    if (!isValidYMD(date)) {
      res.status(400).json({ error: '日期格式錯誤' });
      return;
    }

    const targetId = targetRaw ? normalizeEmployeeId(targetRaw) : actor.id;
    if (targetId !== actor.id && !actor.isAdmin) {
      res.status(403).json({ error: '一般員工僅能修改自己的排休紀錄' });
      return;
    }

    const targetWeekStart = getMondayFromYMD(date);
    const lockCutoffDate = getLockCutoffYMD(targetWeekStart);
    const serverToday = getTaiwanTodayYMD();

    try {
      const outcome = await mutateStore((db) => {
        if (db.settings.lockNextWeekOnFriday && !actor.isAdmin && serverToday >= lockCutoffDate) {
          throw new Error(
            `LOCKED:該週已於 ${formatShortMMDD(lockCutoffDate)}（週五 00:00）鎖定劃假，如需異動請洽管理員`,
          );
        }

        const targetEmp = db.employees.find((e) => e.id === targetId && e.active);
        if (!targetEmp) {
          throw new Error('找不到此有效員工編號');
        }

        const existingIndex = db.leaves.findIndex((l) => l.employeeId === targetId && l.date === date);
        const nowIso = new Date().toISOString();

        if (mode === 'remove' || (mode !== 'upsert' && existingIndex !== -1)) {
          if (existingIndex !== -1) {
            db.leaves.splice(existingIndex, 1);
          }
          return { status: 'removed' as const, entry: null };
        }

        // Combined daily quota check across all active employees (full-time + part-time)
        // Regular employees are blocked once dailyMaxLeave is reached; admins can add 3rd+
        const dailyMax = db.settings.dailyMaxLeave ?? 2;
        if (!actor.isAdmin && dailyMax > 0 && existingIndex === -1) {
          const activeIdSet = new Set(db.employees.filter((e) => e.active).map((e) => e.id));
          const dayLeaveCount = db.leaves.filter(
            (l) => l.date === date && activeIdSet.has(l.employeeId),
          ).length;

          if (dayLeaveCount >= dailyMax) {
            throw new Error(
              `QUOTA:${formatShortMMDD(date)} 排休名額已滿（每日全店上限 ${dailyMax} 位，包含正職與計時員；如需新增第 ${dailyMax + 1} 位以上請洽管理員）`,
            );
          }
        }

        const entry = {
          id: `${targetId}_${date}`,
          employeeId: targetId,
          date,
          updatedAt: nowIso,
          updatedBy: actor.id,
        };

        if (existingIndex !== -1) {
          db.leaves[existingIndex] = entry;
        } else {
          db.leaves.push(entry);
        }
        return { status: 'saved' as const, entry };
      });

      res.json(outcome);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '操作失敗';
      if (rawMsg.startsWith('LOCKED:')) {
        res.status(403).json({ error: rawMsg.slice('LOCKED:'.length) });
        return;
      }
      if (rawMsg.startsWith('QUOTA:')) {
        res.status(409).json({ error: rawMsg.slice('QUOTA:'.length) });
        return;
      }
      res.status(400).json({ error: rawMsg });
    }
  });

  app.get('/api/employees', requireAuth, requireAdmin, async (_req, res) => {
    const db = await readStore();
    res.json({ employees: db.employees, settings: db.settings });
  });

  app.post('/api/employees', requireAuth, requireAdmin, async (req, res) => {
    const id = normalizeEmployeeId(req.body?.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 24) : '';
    const role = typeof req.body?.role === 'string' ? req.body.role.trim().slice(0, 20) : '';
    const isAdmin = Boolean(req.body?.isAdmin);
    const weeklyLeaveLimit = Math.max(0, Math.min(7, Number(req.body?.weeklyLeaveLimit ?? 2) || 0));

    if (!id || !isValidEmployeeId(id)) {
      res.status(400).json({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: '請輸入員工姓名' });
      return;
    }
    if (!role) {
      res.status(400).json({ error: '請設定員工職位（例如：正職、計時員、工讀生）' });
      return;
    }

    try {
      const created = await mutateStore((db) => {
        if (db.employees.some((e) => e.id === id)) {
          throw new Error(`員工編號「${id}」已存在，請使用其他編號`);
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
        if (!db.settings.roles.includes(role)) {
          db.settings.roles.push(role);
        }
        return emp;
      });
      res.status(201).json({ employee: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : '新增員工失敗';
      res.status(400).json({ error: message });
    }
  });

  // Admin: update employee (including changing employee ID with leave migration)
  app.patch('/api/employees/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const targetId = normalizeEmployeeId(req.params.id);
    const actor = req.currentUser!;
    const requestedNewId =
      req.body?.id !== undefined ? normalizeEmployeeId(req.body.id) : targetId;

    if (!requestedNewId || !isValidEmployeeId(requestedNewId)) {
      res.status(400).json({ error: '員工編號需為 2–16 碼英數字（可含 - 或 _）' });
      return;
    }

    try {
      const updated = await mutateStore((db) => {
        const emp = db.employees.find((e) => e.id === targetId);
        if (!emp) {
          throw new Error('找不到該員工');
        }

        if (requestedNewId !== targetId && db.employees.some((e) => e.id === requestedNewId)) {
          throw new Error(`員工編號「${requestedNewId}」已存在，無法重複使用`);
        }

        const nextName =
          typeof req.body?.name === 'string' && req.body.name.trim()
            ? req.body.name.trim().slice(0, 24)
            : emp.name;
        const nextRole =
          typeof req.body?.role === 'string' && req.body.role.trim()
            ? req.body.role.trim().slice(0, 20)
            : emp.role;
        const nextIsAdmin = typeof req.body?.isAdmin === 'boolean' ? req.body.isAdmin : emp.isAdmin;
        const nextActive = typeof req.body?.active === 'boolean' ? req.body.active : emp.active;
        const nextLimit =
          req.body?.weeklyLeaveLimit !== undefined
            ? Math.max(0, Math.min(7, Number(req.body.weeklyLeaveLimit) || 0))
            : emp.weeklyLeaveLimit;

        if (emp.id === actor.id && !nextActive) {
          throw new Error('無法停用自己目前登入的帳號');
        }

        const remainingAdmins = db.employees.filter(
          (e) => e.id !== targetId && e.active && e.isAdmin,
        ).length;
        if (remainingAdmins === 0 && (!nextIsAdmin || !nextActive)) {
          throw new Error('系統至少需要保留一位啟用中的管理員');
        }

        if (requestedNewId !== targetId) {
          for (const leave of db.leaves) {
            if (leave.employeeId === targetId) {
              leave.employeeId = requestedNewId;
              leave.id = `${requestedNewId}_${leave.date}`;
            }
            if (leave.updatedBy === targetId) {
              leave.updatedBy = requestedNewId;
            }
          }
          emp.id = requestedNewId;
        }

        emp.name = nextName;
        emp.role = nextRole;
        emp.isAdmin = nextIsAdmin;
        emp.active = nextActive;
        emp.weeklyLeaveLimit = nextLimit;

        if (!db.settings.roles.includes(nextRole)) {
          db.settings.roles.push(nextRole);
        }

        return emp;
      });

      const newToken =
        targetId === actor.id && requestedNewId !== targetId
          ? await signToken(requestedNewId)
          : undefined;

      res.json({ employee: updated, ...(newToken ? { newToken } : {}) });
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新員工資料失敗';
      res.status(400).json({ error: message });
    }
  });

  app.delete('/api/employees/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    const targetId = normalizeEmployeeId(req.params.id);
    const actor = req.currentUser!;

    if (targetId === actor.id) {
      res.status(400).json({ error: '無法刪除自己目前登入的帳號' });
      return;
    }

    try {
      await mutateStore((db) => {
        const index = db.employees.findIndex((e) => e.id === targetId);
        if (index === -1) {
          throw new Error('找不到該員工');
        }
        const remainingAdmins = db.employees.filter(
          (e) => e.id !== targetId && e.active && e.isAdmin,
        ).length;
        if (remainingAdmins === 0) {
          throw new Error('系統至少需要保留一位啟用中的管理員');
        }
        db.employees.splice(index, 1);
        db.leaves = db.leaves.filter((l) => l.employeeId !== targetId);
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '刪除員工失敗';
      res.status(400).json({ error: message });
    }
  });

  app.patch('/api/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
      const updated = await mutateStore((db) => {
        if (typeof req.body?.storeName === 'string' && req.body.storeName.trim()) {
          db.settings.storeName = req.body.storeName.trim().slice(0, 30);
        }
        if (Array.isArray(req.body?.roles)) {
          const rawRoles: unknown[] = req.body.roles;
          const cleanRoles: string[] = Array.from(
            new Set<string>(
              rawRoles
                .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
                .map((r) => r.trim().slice(0, 20)),
            ),
          );
          if (cleanRoles.length > 0) {
            db.settings.roles = cleanRoles;
          }
        }
        if (req.body?.dailyMaxLeave !== undefined) {
          const parsedMax = Number(req.body.dailyMaxLeave);
          if (Number.isFinite(parsedMax)) {
            db.settings.dailyMaxLeave = Math.max(0, Math.min(20, Math.floor(parsedMax)));
          }
        }
        if (req.body?.maxDailyLeaveWarning !== undefined) {
          db.settings.maxDailyLeaveWarning = Math.max(
            1,
            Math.min(20, Number(req.body.maxDailyLeaveWarning) || 2),
          );
        }
        if (typeof req.body?.allowEmployeesViewAll === 'boolean') {
          db.settings.allowEmployeesViewAll = req.body.allowEmployeesViewAll;
        }
        if (typeof req.body?.showLoginHint === 'boolean') {
          db.settings.showLoginHint = req.body.showLoginHint;
        }
        if (typeof req.body?.lockNextWeekOnFriday === 'boolean') {
          db.settings.lockNextWeekOnFriday = req.body.lockNextWeekOnFriday;
        }
        return db.settings;
      });
      res.json({ settings: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新設定失敗';
      res.status(400).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
