import type { Employee, LeaveEntry, PublicConfigResponse, ScheduleResponse, StoreSettings } from '../types.ts';

const TOKEN_STORAGE_KEY = 'shiftoff_employee_token';

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
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;

  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
    }
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }

  return data;
}

export async function fetchPublicConfig(): Promise<PublicConfigResponse> {
  return request<PublicConfigResponse>('/api/public/config');
}

export async function loginWithEmployeeId(employeeId: string): Promise<{ token: string; user: Employee }> {
  const res = await request<{ token: string; user: Employee }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employeeId }),
  });
  setStoredToken(res.token);
  return res;
}

export async function fetchMe(): Promise<{ user: Employee }> {
  return request<{ user: Employee }>('/api/auth/me');
}

export async function fetchSchedule(weekStart: string): Promise<ScheduleResponse> {
  return request<ScheduleResponse>(`/api/schedule?weekStart=${encodeURIComponent(weekStart)}`);
}

export async function toggleLeave(payload: {
  date: string;
  employeeId?: string;
  mode?: 'toggle' | 'upsert' | 'remove';
}): Promise<{ status: 'saved' | 'removed'; entry: LeaveEntry | null }> {
  return request<{ status: 'saved' | 'removed'; entry: LeaveEntry | null }>('/api/leaves/toggle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAllEmployees(): Promise<{ employees: Employee[]; settings: StoreSettings }> {
  return request<{ employees: Employee[]; settings: StoreSettings }>('/api/employees');
}

export async function createEmployee(payload: {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  weeklyLeaveLimit: number;
}): Promise<{ employee: Employee }> {
  return request<{ employee: Employee }>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(
  id: string,
  payload: Partial<Pick<Employee, 'id' | 'name' | 'role' | 'isAdmin' | 'weeklyLeaveLimit' | 'active'>>,
): Promise<{ employee: Employee; newToken?: string }> {
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
}

export async function deleteEmployee(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/employees/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function updateSettings(payload: Partial<StoreSettings>): Promise<{ settings: StoreSettings }> {
  return request<{ settings: StoreSettings }>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
