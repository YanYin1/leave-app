import React, { useState } from 'react';
import { ArrowRight, Info, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import type { Employee, PublicConfigResponse } from '../types.ts';
import { bootstrapAdmin, loginWithEmployeeId } from '../api/client.ts';

interface LoginScreenProps {
  publicConfig: PublicConfigResponse | null;
  onLoginSuccess: (user: Employee) => void;
}

export function LoginScreen({ publicConfig, onLoginSuccess }: LoginScreenProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [adminId, setAdminId] = useState('M001');
  const [adminName, setAdminName] = useState('林店長');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = publicConfig?.storeName || '門市';
  const needsBootstrap = publicConfig?.needsBootstrap ?? false;
  const isLocalFallback = publicConfig?.isLocalFallback ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = employeeId.trim();
    if (!trimmed) {
      setError('請輸入員工編號');
      return;
    }
    await performLogin(trimmed);
  }

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user } = await bootstrapAdmin(adminId, adminName);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立管理員失敗');
    } finally {
      setLoading(false);
    }
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
            {needsBootstrap
              ? '首次啟用：請先建立第一位管理員帳號'
              : '輸入管理員建立的員工編號即可登入，無需輸入密碼'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
          {needsBootstrap ? (
            <form onSubmit={handleBootstrapSubmit} className="space-y-4">
              <div>
                <label htmlFor="bootstrap-id" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  設定管理員編號
                </label>
                <input
                  id="bootstrap-id"
                  type="text"
                  required
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                  placeholder="例如：M001"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label htmlFor="bootstrap-name" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  管理員姓名
                </label>
                <input
                  id="bootstrap-name"
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="例如：林店長"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
                />
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
                <span>{loading ? '建立中...' : '建立管理員並登入'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
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
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            僅限在職員工名單內的編號可登入。預設管理員編號為 <span className="font-mono font-semibold text-slate-700">M001</span>（登入後可自行修改）。
          </div>
        </div>

        {isLocalFallback && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              {publicConfig?.kvNeedsBinding ? (
                <>
                  已偵測到 Cloudflare Pages 環境！目前尚未綁定 KV 資料庫，暫時先以瀏覽器本機儲存運作（仍可先用 <span className="font-mono font-semibold">M001</span> 登入體驗）。若要讓所有店員手機同步資料，請到 Cloudflare 後台建立 KV 空間並於 Pages 的 <strong>設定 → 繫結（Bindings）</strong>新增變數名稱 <span className="font-mono font-semibold">LEAVE_STORE</span> 後重新部署。
                </>
              ) : (
                <>
                  目前為純靜態瀏覽器模式（資料僅保存於此裝置瀏覽器中）；若已部署於 Cloudflare Pages，請確認專案包含 <span className="font-mono">functions/api/[[path]].ts</span> 並綁定 KV 空間 <span className="font-mono font-semibold">LEAVE_STORE</span> 以啟用多裝置同步。
                </>
              )}
            </div>
          </div>
        )}

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
