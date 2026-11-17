import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Employee, LeaveEntry, StoreDatabase, StoreSettings } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const SECRET_FILE = path.join(DATA_DIR, '.auth_secret');

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonday(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatYMD(d);
}

function createInitialDatabase(): StoreDatabase {
  const nowIso = new Date().toISOString();
  const mon = getMonday(new Date());

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
      role: '工讀生',
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
    const date = addDays(mon, item.offset);
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
    roleDailyLimits: {
      正職: 1,
      工讀生: 2,
    },
    maxDailyLeaveWarning: 3,
    allowEmployeesViewAll: true,
    showLoginHint: true,
    lockNextWeekOnWednesday: true,
  };

  return { settings, employees, leaves };
}

let writeChain: Promise<void> = Promise.resolve();
let cachedSecret: string | null = null;

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getAuthSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }
  await ensureDataDir();
  try {
    const existing = await fs.readFile(SECRET_FILE, 'utf8');
    if (existing.trim().length >= 32) {
      cachedSecret = existing.trim();
      return cachedSecret;
    }
  } catch {
    // Generate new secret below
  }
  const secret = crypto.randomBytes(32).toString('hex');
  await fs.writeFile(SECRET_FILE, secret, 'utf8');
  cachedSecret = secret;
  return secret;
}

export async function readStore(): Promise<StoreDatabase> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoreDatabase;
    if (parsed.settings) {
      if (parsed.settings.lockNextWeekOnWednesday === undefined) {
        parsed.settings.lockNextWeekOnWednesday = true;
      }
      if (!parsed.settings.roleDailyLimits || typeof parsed.settings.roleDailyLimits !== 'object') {
        parsed.settings.roleDailyLimits = { 正職: 1, 工讀生: 2 };
      }
    }
    return parsed;
  } catch {
    const initial = createInitialDatabase();
    await writeStoreDirect(initial);
    return initial;
  }
}

async function writeStoreDirect(data: StoreDatabase): Promise<void> {
  await ensureDataDir();
  const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpFile, DB_FILE);
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
