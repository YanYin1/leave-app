import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      <span>目前處於離線狀態，已使用手機快取畫面，恢復網路連線後請重新整理同步資料</span>
    </div>
  );
}
