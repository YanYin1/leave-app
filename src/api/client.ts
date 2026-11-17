import type { Employee, LeaveEntry, PublicConfigResponse, ScheduleResponse, StoreSettings } from '../types.ts';
import {
  localBootstrapAdmin,
  localCreateEmployee,
  localDeleteEmployee,
  localFetchAllEmployees,
  localFetchMe,
  localFetchSchedule,
  localGetPublicConfig,
  localLogin,
  localLogout,
  localToggleLeave,
  localUpdateEmployee,
  localUpdateSettings,
} from './localFallback.ts';

const TOKEN_STORAGE_KEY = 'shiftoff_employee_token';

let useLocalFallback = false;
let kvNeedsBindingDetected = false;

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localLogout();
    }
  } catch {
    // Ignore storage errors
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error('__BACKEND_UNAVAILABLE__');
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;

  if (res.status === 503 && data.code === 'KV_NOT_BOUND') {
    kvNeedsBindingDetected = true;
    throw new Error('__BACKEND_UNAVAILABLE__');
  }

  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
    }
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }

  return data;
}

async function withFallback<T>(serverFn: () => Promise<T>, localFn: () => T): Promise<T> {
  if (useLocalFallback) {
    return localFn();
  }
  try {
    return await serverFn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === '__BACKEND_UNAVAILABLE__' || err instanceof TypeError) {
      useLocalFallback = true;
      return localFn();
    }
    throw err;
  }
}

export async function fetchPublicConfig(): Promise<PublicConfigResponse> {
  return withFallback(
    () => request<PublicConfigResponse>('/api/public/config'),
    () => ({
      ...localGetPublicConfig(),
      kvNeedsBinding: kvNeedsBindingDetected,
    }),
  );
}

export async function loginWithEmployeeId(employeeId: string): Promise<{ token: string; user: Employee }> {
  return withFallback(
    async () => {
      const res = await request<{ token: string; user: Employee }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      });
      setStoredToken(res.token);
      return res;
    },
    () => {
      const res = localLogin(employeeId);
      setStoredToken(res.token);
      return res;
    },
  );
}

export async function bootstrapAdmin(id: string, name: string): Promise<{ token: string; user: Employee }> {
  return withFallback(
    async () => {
      const res = await request<{ token: string; user: Employee }>('/api/setup/bootstrap-admin', {
        method: 'POST',
        body: JSON.stringify({ id, name }),
      });
      setStoredToken(res.token);
      return res;
    },
    () => {
      const res = localBootstrapAdmin(id, name);
      setStoredToken(res.token);
      return res;
    },
  );
}

export async function fetchMe(): Promise<{ user: Employee }> {
  const token = getStoredToken();
  if (token?.startsWith('local:')) {
    useLocalFallback = true;
  }
  return withFallback(
    () => request<{ user: Employee }>('/api/auth/me'),
    () => localFetchMe(),
  );
}

export async function fetchSchedule(weekStart: string): Promise<ScheduleResponse> {
  return withFallback(
    () => request<ScheduleResponse>(`/api/schedule?weekStart=${encodeURIComponent(weekStart)}`),
    () => localFetchSchedule(weekStart),
  );
}

export async function toggleLeave(payload: {
  date: string;
  employeeId?: string;
  mode?: 'toggle' | 'upsert' | 'remove';
}): Promise<{ status: 'saved' | 'removed'; entry: LeaveEntry | null }> {
  return withFallback(
    () =>
      request<{ status: 'saved' | 'removed'; entry: LeaveEntry | null }>('/api/leaves/toggle', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    () => localToggleLeave(payload),
  );
}

export async function fetchAllEmployees(): Promise<{ employees: Employee[]; settings: StoreSettings }> {
  return withFallback(
    () => request<{ employees: Employee[]; settings: StoreSettings }>('/api/employees'),
    () => localFetchAllEmployees(),
  );
}

export async function createEmployee(payload: {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  weeklyLeaveLimit: number;
}): Promise<{ employee: Employee }> {
  return withFallback(
    () =>
      request<{ employee: Employee }>('/api/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    () => localCreateEmployee(payload),
  );
}

export async function updateEmployee(
  id: string,
  payload: Partial<Pick<Employee, 'id' | 'name' | 'role' | 'isAdmin' | 'weeklyLeaveLimit' | 'active'>>,
): Promise<{ employee: Employee; newToken?: string }> {
  return withFallback(
    async () => {
      const res = await request<{ employee: Employee; newToken?: string }>(
        `/api/employees/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );
      if (res.newToken) {
        setStoredToken(res.newToken);
      }
      return res;
    },
    () => {
      const res = localUpdateEmployee(id, payload);
      if (res.newToken) {
        setStoredToken(res.newToken);
      }
      return res;
    },
  );
}

export async function deleteEmployee(id: string): Promise<{ ok: boolean }> {
  return withFallback(
    () =>
      request<{ ok: boolean }>(`/api/employees/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    () => localDeleteEmployee(id),
  );
}

export async function updateSettings(payload: Partial<StoreSettings>): Promise<{ settings: StoreSettings }> {
  return withFallback(
    () =>
      request<{ settings: StoreSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    () => localUpdateSettings(payload),
  );
}
