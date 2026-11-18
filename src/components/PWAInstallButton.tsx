import { useState } from 'react';
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstalled, isIOS, hasNativePrompt, promptNativeInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (hasNativePrompt) {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') return;
    }
    setShowGuideModal(true);
  }

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-teal-700 shrink-0" />
          <span>下載成手機 App（加入主畫面）</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="將此系統安裝至手機主畫面"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">下載 App</span>
          <span className="sm:hidden">裝 App</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-teal-700" />
                <h3 id="pwa-guide-title" className="text-base font-bold text-slate-900">
                  將「店務劃假系統」裝到手機桌面
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                aria-label="關閉視窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              <p className="text-xs text-slate-500 leading-relaxed">
                安裝後就像一般手機 App 一樣，從桌面圖示一鍵開啟、全螢幕操作，無需每次重新輸入網址。
              </p>

              {isIOS ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="font-semibold text-slate-900 text-xs">iPhone / iPad（Safari 瀏覽器）步驟：</div>
                  <ol className="space-y-2 text-xs text-slate-700 list-decimal list-inside">
                    <li>
                      點擊瀏覽器下方工具列的{' '}
                      <span className="inline-flex items-center gap-1 font-semibold text-teal-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        <Share className="w-3 h-3" /> 分享
                      </span>{' '}
                      圖示
                    </li>
                    <li>
                      往下滑動並點選 <strong>「加入主畫面」</strong>
                    </li>
                    <li>
                      點擊右上角 <strong>「新增」</strong> 即可完成安裝
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="font-semibold text-slate-900 text-xs">Android 手機（Chrome 瀏覽器）：</div>
                    <ol className="space-y-1.5 text-xs text-slate-700 list-decimal list-inside">
                      <li>
                        點擊右上角{' '}
                        <span className="inline-flex items-center font-semibold text-slate-800 bg-white border border-slate-200 px-1 py-0.5 rounded">
                          <MoreVertical className="w-3 h-3" />
                        </span>{' '}
                        選單
                      </li>
                      <li>
                        點選 <strong>「安裝應用程式」</strong> 或 <strong>「加到主畫面」</strong>
                      </li>
                    </ol>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="font-semibold text-slate-900 text-xs">iPhone（Safari 瀏覽器）：</div>
                    <ol className="space-y-1.5 text-xs text-slate-700 list-decimal list-inside">
                      <li>
                        點擊底部{' '}
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                          <Share className="w-3 h-3" /> 分享
                        </span>{' '}
                        按鈕
                      </li>
                      <li>
                        選擇 <strong>「加入主畫面」</strong> 並按新增
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full min-h-[44px] py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
