
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
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(notification.id), 500);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onClose]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success': return 'check_circle';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  const getColors = () => {
    switch (notification.type) {
      case 'success': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500';
      case 'error': return 'bg-red-500/10 border-red-500/20 text-red-500';
      default: return 'bg-blue-500/10 border-blue-500/20 text-blue-500';
    }
  };

  return (
    <div 
      className={`fixed bottom-12 right-6 z-[100] w-80 p-4 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-500 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'} ${getColors()}`}
    >
      <div className="flex gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${notification.type === 'success' ? 'bg-emerald-500 text-white' : notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
          <span className="material-symbols-outlined text-xl">{getIcon()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-black uppercase tracking-widest">{notification.title}</h4>
            <button onClick={() => setIsVisible(false)} className="text-slate-400 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
          <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{notification.message}</p>
          {notification.type === 'success' && onView && (
            <button 
              onClick={(e) => { e.stopPropagation(); onView(); setIsVisible(false); }}
              className="mt-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all"
            >
              <span className="material-symbols-outlined text-sm">visibility</span>
              View Result
            </button>
          )}
          <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-current animate-[toastProgress_5s_linear_forwards]"></div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

export default ToastNotification;
