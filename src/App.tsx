import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, LogOut, ShieldCheck, Users } from 'lucide-react';
import type { Employee, PublicConfigResponse, ScheduleResponse } from './types.ts';
import {
  fetchMe,
  fetchPublicConfig,
  fetchSchedule,
  getStoredToken,
  setStoredToken,
} from './api/client.ts';
import { getWeekStart } from './utils/date.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { MyLeaveView } from './components/MyLeaveView.tsx';
import { WeeklyOverviewView } from './components/WeeklyOverviewView.tsx';
import { TeamManagementView } from './components/TeamManagementView.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { OfflineBanner } from './components/OfflineBanner.tsx';

type ActiveTab = 'overview' | 'my-leave' | 'team';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [publicConfig, setPublicConfig] = useState<PublicConfigResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [weekStart, setWeekStart] = useState<string>(() => getWeekStart());
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const loadPublicConfig = useCallback(async () => {
    try {
      const cfg = await fetchPublicConfig();
      setPublicConfig(cfg);
    } catch {
      // Ignore config errors during boot
    }
  }, []);

  const loadSchedule = useCallback(
    async (targetWeek: string) => {
      if (!currentUser) return;
      setScheduleLoading(true);
      try {
        const data = await fetchSchedule(targetWeek);
        setSchedule(data);
      } catch {
        const token = getStoredToken();
        if (!token) {
          setCurrentUser(null);
        }
      } finally {
        setScheduleLoading(false);
      }
    },
    [currentUser],
  );

  useEffect(() => {
    async function init() {
      await loadPublicConfig();
      const token = getStoredToken();
      if (token) {
        try {
          const { user } = await fetchMe();
          setCurrentUser(user);
          setActiveTab(user.isAdmin ? 'overview' : 'my-leave');
        } catch {
          setStoredToken(null);
          setCurrentUser(null);
        }
      }
      setBooting(false);
    }
    void init();
  }, [loadPublicConfig]);

  useEffect(() => {
    if (currentUser) {
      void loadSchedule(weekStart);
    }
  }, [currentUser, weekStart, loadSchedule]);

  function handleLoginSuccess(user: Employee) {
    setCurrentUser(user);
    setActiveTab(user.isAdmin ? 'overview' : 'my-leave');
  }

  function handleLogout() {
    setStoredToken(null);
    setCurrentUser(null);
    setSchedule(null);
    void loadPublicConfig();
  }

  async function handleRosterUpdated() {
    await loadPublicConfig();
    try {
      const { user } = await fetchMe();
      setCurrentUser(user);
    } catch {
      // ignore
    }
    await loadSchedule(weekStart);
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">載入系統中...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen publicConfig={publicConfig} onLoginSuccess={handleLoginSuccess} />;
  }

  const storeName = schedule?.settings.storeName || publicConfig?.storeName || '門市';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 3-Zone Single-Row Top Bar (Compact h-14 on mobile, h-16 on desktop) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3 md:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap truncate cursor-pointer"
          >
            {storeName} 劃假系統
          </button>

          {/* Zone 2: Desktop Primary Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 h-full" aria-label="主要功能選單">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`h-full inline-flex items-center gap-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>該週劃假總覽</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my-leave')}
              className={`h-full inline-flex items-center gap-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'my-leave'
                  ? 'border-teal-700 text-teal-800 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>我的劃假</span>
            </button>

            {currentUser.isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('team')}
                className={`h-full inline-flex items-center gap-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'team'
                    ? 'border-teal-700 text-teal-800 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>員工與權限管理</span>
              </button>
            )}
          </nav>

          {/* Zone 3: PWA Install + User Info + Logout */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton variant="header" />
            <span className="hidden lg:inline text-xs text-slate-600 whitespace-nowrap">
              {currentUser.isAdmin ? `${currentUser.name} · ${currentUser.id}` : currentUser.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>登出</span>
            </button>
          </div>
        </div>
      </header>

      <OfflineBanner />

      {/* Main Content (Extra bottom padding on mobile for fixed thumb-zone tab bar) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 pt-4 pb-24 md:py-8">
        {activeTab === 'overview' && (
          <WeeklyOverviewView
            currentUser={currentUser}
            weekStart={weekStart}
            schedule={schedule}
            loading={scheduleLoading}
            onChangeWeek={setWeekStart}
            onRefresh={() => loadSchedule(weekStart)}
          />
        )}

        {activeTab === 'my-leave' && (
          <MyLeaveView
            currentUser={currentUser}
            weekStart={weekStart}
            schedule={schedule}
            loading={scheduleLoading}
            onChangeWeek={setWeekStart}
            onRefresh={() => loadSchedule(weekStart)}
            onGoToOverview={() => setActiveTab('overview')}
          />
        )}

        {activeTab === 'team' && currentUser.isAdmin && (
          <TeamManagementView
            currentUser={currentUser}
            onRosterUpdated={handleRosterUpdated}
          />
        )}
      </main>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="手機版底部導覽列"
      >
        <div className="flex items-stretch justify-around">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 min-h-[56px] py-1.5 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'overview' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className={`w-5 h-5 ${activeTab === 'overview' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>該週總覽</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('my-leave')}
            className={`flex-1 min-h-[56px] py-1.5 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'my-leave' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarCheck className={`w-5 h-5 ${activeTab === 'my-leave' ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>我的劃假</span>
          </button>

          {currentUser.isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`flex-1 min-h-[56px] py-1.5 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'team' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck className={`w-5 h-5 ${activeTab === 'team' ? 'text-teal-700' : 'text-slate-400'}`} />
              <span>員工管理</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
