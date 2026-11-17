import React, { useState } from 'react';
import { ArrowRight, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import type { Employee, PublicConfigResponse } from '../types.ts';
import { loginWithEmployeeId } from '../api/client.ts';

interface LoginScreenProps {
  publicConfig: PublicConfigResponse | null;
  onLoginSuccess: (user: Employee) => void;
}

export function LoginScreen({ publicConfig, onLoginSuccess }: LoginScreenProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = publicConfig?.storeName || '門市';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = employeeId.trim();
    if (!trimmed) {
      setError('請輸入員工編號');
      return;
    }
    await performLogin(trimmed);
  }

  async function performLogin(id: string) {
    setLoading(true);
    setError(null);
    try {
      const { user } = await loginWithEmployeeId(id);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="w-full max-w-md mx-auto">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-teal-700 tracking-wide mb-2">{storeName}</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">店務劃假系統</h1>
          <p className="mt-2 text-sm text-slate-600">
            輸入管理員建立的員工編號即可登入，無需輸入密碼
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="employee-id-input" className="block text-sm font-semibold text-slate-800 mb-2">
                員工編號
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="employee-id-input"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="例如：M001、E001、PT01"
                  className="w-full pl-10 pr-4 py-3 text-base font-mono uppercase bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>{loading ? '驗證編號中...' : '登入系統'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            僅限在職員工名單內的編號可登入。若忘記編號或尚未建檔，請聯繫店內管理員協助新增。
          </div>
        </div>

        {publicConfig?.showLoginHint && publicConfig.hintAccounts.length > 0 && (
          <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-700">快速登入測試名單</h2>
              <span className="text-xs text-slate-400">可於管理設定關閉此提示</span>
            </div>
            <div className="divide-y divide-slate-100">
              {publicConfig.hintAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmployeeId(acc.id);
                    void performLogin(acc.id);
                  }}
                  className="w-full py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded tabular-nums">
                      {acc.id}
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">{acc.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {acc.role}
                      {acc.isAdmin ? ' · 管理員' : ''}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-teal-700 flex items-center gap-1 shrink-0">
                    {acc.isAdmin ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    點此登入
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
