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
  roleDailyLimits: Record<string, number>;
  maxDailyLeaveWarning: number;
  allowEmployeesViewAll: boolean;
  showLoginHint: boolean;
  lockNextWeekOnWednesday: boolean;
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
  lockCutoffDate: string;
  isWeekLocked: boolean;
  employees: Employee[];
  leaves: LeaveEntry[];
  settings: StoreSettings;
}

export interface PublicConfigResponse {
  storeName: string;
  showLoginHint: boolean;
  hintAccounts: Array<{ id: string; name: string; role: string; isAdmin: boolean }>;
}
