import React, { useEffect, useState } from 'react';
import { Notification } from '../types';

interface ToastNotificationProps {
  notification: Notification;
  onClose: (id: string) => void;
  onView?: () => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ notification, onClose, onView }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      window.setTimeout(() => onClose(notification.id), 250);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [notification.id, onClose]);

  const palette = notification.type === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
    : notification.type === 'error'
      ? 'border-red-500/20 bg-red-500/10 text-red-500'
      : 'border-blue-500/20 bg-blue-500/10 text-blue-500';

  const icon = notification.type === 'success'
    ? 'check_circle'
    : notification.type === 'error'
      ? 'error'
      : 'info';

  return (
    <div className={`fixed bottom-10 right-6 z-[170] w-80 rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-300 ${palette} ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
      <div className="flex gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${notification.type === 'success' ? 'bg-emerald-500 text-white' : notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-[11px] font-black uppercase tracking-widest">{notification.title}</h4>
            <button type="button" onClick={() => onClose(notification.id)} className="text-slate-400 transition-colors hover:text-white">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
          <p className="mt-1 text-[10px] font-medium text-slate-600 dark:text-slate-300">{notification.message}</p>
          {onView && (
            <button type="button" onClick={onView} className="mt-3 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary transition-all hover:brightness-110">
              <span className="material-symbols-outlined text-sm">visibility</span>
              View History
            </button>
          )}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-current animate-[toastProgress_5s_linear_forwards]"></div>
          </div>
        </div>
      </div>
      <style>{`@keyframes toastProgress { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
};

export default ToastNotification;
