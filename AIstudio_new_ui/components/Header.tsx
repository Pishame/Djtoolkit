
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppSettings, NavItem, ActivityJob, UserPlan } from '../types';

interface HeaderProps {
  onSearch: (query: string) => void;
  settings: AppSettings;
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  jobs: ActivityJob[];
  onLogout: () => void;
  plan?: UserPlan;
}

const Header: React.FC<HeaderProps> = ({ onSearch, settings, activeTab, onTabChange, jobs, onLogout, plan = 'free' }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const notifications = useMemo(() => {
    return jobs.slice(0, 10).map((job) => {
      const isFailed = job.status === 'failed';
      const title = isFailed
        ? 'Job Failed'
        : job.type === 'Downloaded'
          ? 'Download Complete'
          : `${job.type} Complete`;
      return {
        id: job.id,
        title,
        message: job.name,
        time: job.timestamp,
        type: isFailed ? 'error' : 'success',
      };
    });
  }, [jobs]);

  // Mock library data
  const libraryItems = [
    { id: 'l1', name: 'Euphoric_Daze.mp3', type: 'Library' },
    { id: 'l2', name: 'Midnight_Loop_Master.wav', type: 'Library' },
    { id: 'l3', name: 'Sunset_Synth_Core.flac', type: 'Library' },
    { id: 'l4', name: 'Deep_Techno_Kick.wav', type: 'Library' },
  ];

  const filteredResults = searchQuery.trim() === '' ? [] : [
    ...libraryItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())),
    ...jobs.filter(job => job.name.toLowerCase().includes(searchQuery.toLowerCase())).map(job => ({ ...job, type: 'Job' }))
  ].slice(0, 6);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
    setShowProfileMenu(false);
  };

  return (
    <header className="h-16 px-8 flex-shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-white/5 bg-background-light dark:bg-background-dark transition-colors duration-500 z-40">
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}></div>
          <div className="relative bg-white dark:bg-surface-dark w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 p-8 text-center animate-[modalScaleUp_0.2s_ease-out]">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-3xl">logout</span>
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter dark:text-white mb-2">Sign Out</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8">Are you sure you want to sign out of your professional session?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="py-4 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onLogout}
                className="py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-500/20 hover:brightness-110 transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-white text-xl">graphic_eq</span>
          </div>
          <div className="flex flex-col leading-none">
            <h1 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white uppercase">MyDJToolkit</h1>
            {plan === 'free' && (
              <span className="mt-1 text-[7px] font-black text-primary uppercase tracking-[0.2em]">Free Neural Tier</span>
            )}
          </div>
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          <div className="relative">
            <button 
              onClick={() => onTabChange(NavItem.Toolkit)}
              className={`text-[11px] font-black uppercase tracking-widest transition-colors ${
                activeTab === NavItem.Toolkit
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Toolkit
            </button>
            {activeTab === NavItem.Toolkit && <div className="absolute -bottom-[22px] left-0 right-0 h-0.5 bg-primary rounded-full"></div>}
          </div>
          <div className="relative">
            <button 
              onClick={() => onTabChange(NavItem.Copyright)}
              className={`text-[11px] font-black uppercase tracking-widest transition-colors ${
                activeTab === NavItem.Copyright
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Copyright
            </button>
            {activeTab === NavItem.Copyright && <div className="absolute -bottom-[22px] left-0 right-0 h-0.5 bg-primary rounded-full"></div>}
          </div>
        </nav>
      </div>

      <div className="flex-1 max-w-md mx-8 relative" ref={searchRef}>
        <div className="relative group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-primary transition-colors duration-300">search</span>
          <input 
            className="w-full bg-slate-100 dark:bg-surface-dark border-2 border-transparent focus:border-primary/20 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-0 text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all duration-300" 
            placeholder="Search library & history..." 
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
              onSearch(e.target.value);
            }}
            onFocus={() => setShowResults(true)}
          />
        </div>

        {showResults && filteredResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-[modalScaleUp_0.2s_ease-out]">
            <div className="p-2">
              {filteredResults.map((result: any, i) => (
                <button
                  key={result.id || i}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors text-left group"
                  onClick={() => {
                    setShowResults(false);
                    setSearchQuery('');
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${result.type === 'Library' ? 'bg-blue-500/10 text-blue-500' : 'bg-primary/10 text-primary'}`}>
                      <span className="material-symbols-outlined text-sm">{result.type === 'Library' ? 'library_music' : 'history'}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-black dark:text-white uppercase tracking-tight truncate max-w-[200px]">{result.name}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{result.type}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                </button>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-white/[0.02] px-4 py-2 border-t border-slate-100 dark:border-white/5">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Press Enter to see all results</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative" ref={notificationsRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`w-10 h-10 flex items-center justify-center transition-colors relative ${showNotifications ? 'text-primary' : 'text-slate-400 hover:text-white'}`}
            >
              <span className="material-symbols-outlined">notifications</span>
              {notifications.length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background-dark"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-[modalScaleUp_0.2s_ease-out] z-50">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] dark:text-white">Notifications</h3>
                  <span className="text-[8px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-full">{notifications.length} New</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          onTabChange(NavItem.History);
                          setShowNotifications(false);
                        }}
                        className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-b border-slate-50 dark:border-white/[0.02] last:border-0 group"
                      >
                        <div className="flex gap-3">
                          <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${n.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <span className="material-symbols-outlined text-sm">{n.type === 'success' ? 'check_circle' : 'info'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black dark:text-white uppercase tracking-tight truncate">{n.title}</p>
                            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2">{n.time}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-5 py-8 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-70">No notifications yet</p>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => {
                    onTabChange(NavItem.History);
                    setShowNotifications(false);
                  }}
                  className="w-full py-3 bg-slate-50 dark:bg-white/[0.02] text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors border-t border-slate-100 dark:border-white/5"
                >
                  View All Activity
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => onTabChange(NavItem.Settings)}
            className={`w-10 h-10 flex items-center justify-center transition-colors ${activeTab === NavItem.Settings ? 'text-primary' : 'text-slate-400 hover:text-white'}`}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="relative" ref={profileRef}>
            <div
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`w-8 h-8 rounded-full overflow-hidden border cursor-pointer transition-colors ${activeTab === NavItem.Profile || showProfileMenu ? 'border-primary' : 'border-white/10 hover:border-primary'}`}
            >
              <img src="https://picsum.photos/100/100?random=1" alt="User" className="w-full h-full object-cover" />
            </div>

            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="p-2">
                  <button
                    onClick={() => {
                      onTabChange(NavItem.Profile);
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors text-left group"
                  >
                    <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-primary">person</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">My Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      onTabChange(NavItem.Settings);
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors text-left group"
                  >
                    <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-primary">settings</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Settings</span>
                  </button>
                  <div className="h-px bg-slate-100 dark:bg-white/5 my-1 mx-2"></div>
                  <button
                    onClick={handleLogoutClick}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors text-left group"
                  >
                    <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-red-500">logout</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 group-hover:text-red-500">Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
