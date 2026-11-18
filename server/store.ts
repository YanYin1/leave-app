import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Employee, LeaveEntry, StoreDatabase, StoreSettings } from '../src/types.ts';

const PRIMARY_DATA_DIR = path.resolve(process.cwd(), 'data');
const FALLBACK_DATA_DIR = path.join(os.tmpdir(), 'shiftoff-data');

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

function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function createInitialDatabase(): StoreDatabase {
  const nowIso = new Date().toISOString();
  const mon = getMondayFromYMD(getTaiwanTodayYMD());

  const employees: Employee[] = [
    {
      id: 'M001',
      name: '林店長',
      role: '店長',
      isAdmin: true,
      weeklyLeaveLimit: 2,
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'E001',
      name: '陳小美',
      role: '正職',
      isAdmin: false,
      weeklyLeaveLimit: 2,
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'E002',
      name: '張家豪',
      role: '正職',
      isAdmin: false,
      weeklyLeaveLimit: 2,
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'PT01',
      name: '林志豪',
      role: '工讀生',
      isAdmin: false,
      weeklyLeaveLimit: 3,
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'PT02',
      name: '王怡君',
      role: '計時員',
      isAdmin: false,
      weeklyLeaveLimit: 3,
      active: true,
      createdAt: nowIso,
    },
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
    roles: ['店長', '副店長', '正職', '工讀生', '計時員', '實習生'],
    dailyMaxLeave: 2,
    maxDailyLeaveWarning: 3,
    allowEmployeesViewAll: true,
    showLoginHint: true,
    lockNextWeekOnFriday: true,
  };

  return { settings, employees, leaves };
}

let writeChain: Promise<void> = Promise.resolve();
let cachedSecret: string | null = null;
let resolvedDataDir: string | null = null;
let memoryFallbackDb: StoreDatabase | null = null;

async function getWritableDataDir(): Promise<string | null> {
  if (resolvedDataDir) return resolvedDataDir;
  for (const candidate of [PRIMARY_DATA_DIR, FALLBACK_DATA_DIR]) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      const probe = path.join(candidate, `.probe_${process.pid}_${Date.now()}`);
      await fs.writeFile(probe, 'ok', 'utf8');
      await fs.unlink(probe);
      resolvedDataDir = candidate;
      return candidate;
    } catch {
      // Try next directory
    }
  }
  return null;
}

export async function getAuthSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }
  const dir = await getWritableDataDir();
  if (dir) {
    const secretFile = path.join(dir, '.auth_secret');
    try {
      const existing = await fs.readFile(secretFile, 'utf8');
      if (existing.trim().length >= 32) {
        cachedSecret = existing.trim();
        return cachedSecret;
      }
    } catch {
      // Generate new secret below
    }
    const secret = crypto.randomBytes(32).toString('hex');
    try {
      await fs.writeFile(secretFile, secret, 'utf8');
    } catch {
      // Keep in-memory secret if write fails
    }
    cachedSecret = secret;
    return secret;
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  return cachedSecret;
}

function normalizeStore(raw: unknown): StoreDatabase {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoreDatabase> & {
    settings?: Partial<StoreSettings> & { lockNextWeekOnWednesday?: boolean };
  };
  const defaults = createInitialDatabase();
  const rawSettings: Partial<StoreSettings> & { lockNextWeekOnWednesday?: boolean } =
    parsed.settings ?? {};

  const lockNextWeekOnFriday =
    typeof rawSettings.lockNextWeekOnFriday === 'boolean'
      ? rawSettings.lockNextWeekOnFriday
      : typeof rawSettings.lockNextWeekOnWednesday === 'boolean'
        ? rawSettings.lockNextWeekOnWednesday
        : true;

  const dailyMaxLeave =
    typeof rawSettings.dailyMaxLeave === 'number' && Number.isFinite(rawSettings.dailyMaxLeave)
      ? Math.max(0, Math.min(20, rawSettings.dailyMaxLeave))
      : 2;

  const roles =
    Array.isArray(rawSettings.roles) && rawSettings.roles.length > 0
      ? rawSettings.roles
      : defaults.settings.roles;

  if (!roles.includes('計時員')) {
    roles.push('計時員');
  }

  const settings: StoreSettings = {
    storeName: typeof rawSettings.storeName === 'string' && rawSettings.storeName.trim() ? rawSettings.storeName : defaults.settings.storeName,
    roles,
    dailyMaxLeave,
    maxDailyLeaveWarning:
      typeof rawSettings.maxDailyLeaveWarning === 'number'
        ? rawSettings.maxDailyLeaveWarning
        : defaults.settings.maxDailyLeaveWarning,
    allowEmployeesViewAll:
      typeof rawSettings.allowEmployeesViewAll === 'boolean'
        ? rawSettings.allowEmployeesViewAll
        : defaults.settings.allowEmployeesViewAll,
    showLoginHint:
      typeof rawSettings.showLoginHint === 'boolean'
        ? rawSettings.showLoginHint
        : defaults.settings.showLoginHint,
    lockNextWeekOnFriday,
  };

  return {
    settings,
    employees: Array.isArray(parsed.employees) ? parsed.employees : defaults.employees,
    leaves: Array.isArray(parsed.leaves) ? parsed.leaves : [],
  };
}

export async function readStore(): Promise<StoreDatabase> {
  const dir = await getWritableDataDir();
  if (!dir) {
    if (!memoryFallbackDb) {
      memoryFallbackDb = createInitialDatabase();
    }
    return memoryFallbackDb;
  }
  const dbFile = path.join(dir, 'store.json');
  try {
    const raw = await fs.readFile(dbFile, 'utf8');
    const parsed = normalizeStore(JSON.parse(raw));
    memoryFallbackDb = parsed;
    return parsed;
  } catch {
    const initial = createInitialDatabase();
    memoryFallbackDb = initial;
    await writeStoreDirect(initial);
    return initial;
  }
}

async function writeStoreDirect(data: StoreDatabase): Promise<void> {
  memoryFallbackDb = data;
  const dir = await getWritableDataDir();
  if (!dir) return;
  const dbFile = path.join(dir, 'store.json');
  const tmpFile = `${dbFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpFile, dbFile);
}

export async function mutateStore<T>(mutator: (db: StoreDatabase) => Promise<T> | T): Promise<T> {
  let result!: T;
  const next = writeChain.then(async () => {
    const db = await readStore();
    result = await mutator(db);
    await writeStoreDirect(db);
  });
  writeChain = next.catch(() => undefined);
  await next;
  return result;
}
