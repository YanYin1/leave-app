export interface Employee {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  weeklyLeaveLimit: number;
  active: boolean;
  createdAt: string;
}

export interface LeaveEntry {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  updatedAt: string;
  updatedBy: string;
}

export interface StoreSettings {
  storeName: string;
  roles: string[];
  dailyMaxLeave: number; // Combined daily cap across all roles (default 2; 0 = unlimited; admin can override)
  maxDailyLeaveWarning: number;
  allowEmployeesViewAll: boolean;
  showLoginHint: boolean;
  enableWeeklyLock: boolean;
  lockWeekday: number; // 1 = Mon ... 7 = Sun of preceding week (default 3 = Wednesday)
  lockTime: string; // "HH:mm" 24h Taiwan time (default "21:30")
}

export interface StoreDatabase {
  settings: StoreSettings;
  employees: Employee[];
  leaves: LeaveEntry[];
}

export interface ScheduleResponse {
  weekStart: string;
  weekEnd: string;
  days: string[];
  serverToday: string;
  serverNowTime: string;
  lockCutoffDate: string;
  lockCutoffTime: string;
  isWeekLocked: boolean;
  employees: Employee[];
  leaves: LeaveEntry[];
  settings: StoreSettings;
}

export interface PublicConfigResponse {
  storeName: string;
  showLoginHint: boolean;
  needsBootstrap?: boolean;
  isLocalFallback?: boolean;
  kvNeedsBinding?: boolean;
  hintAccounts: Array<{ id: string; name: string; role: string; isAdmin: boolean }>;
}
