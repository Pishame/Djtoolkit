
import React, { useState, useEffect, useCallback } from 'react';
import { NavItem, ActivityJob, CurrentTask, AppSettings } from './types';
import { INITIAL_JOBS } from './constants';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import ActivitySidebar from './components/ActivitySidebar';
import LoginView from './components/LoginView';

const App: React.FC = () => {
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<NavItem>(NavItem.Toolkit);
  const [jobs, setJobs] = useState<ActivityJob[]>([...INITIAL_JOBS]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({
    enableExtraFormats: false,
    defaultVideoQuality: '1080p',
    mp3OutputPath: '/Music/DJ-Toolkit/Audio',
    mp4OutputPath: '/Videos/DJ-Toolkit/Visuals',
    globalOutputPath: '/Downloads/DJ-Toolkit/Exports',
    isPerformanceMode: false,
    reduceMotion: false,
    lowRamMode: false,
    autoPurgeCache: true,
  });

  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null);

  // Boot sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBooting(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Performance Mode effect
  useEffect(() => {
    const root = document.documentElement;
    if (settings.isPerformanceMode) root.classList.add('perf-mode');
    else root.classList.remove('perf-mode');
    
    if (settings.reduceMotion) root.classList.add('reduce-motion');
    else root.classList.remove('reduce-motion');

    if (settings.lowRamMode) root.classList.add('low-ram');
    else root.classList.remove('low-ram');
  }, [settings.isPerformanceMode, settings.reduceMotion, settings.lowRamMode]);

  // Keyboard Shortcuts (Global)
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDarkMode(prev => !prev);
      }
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, isPerformanceMode: !prev.isPerformanceMode }));
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const handleClearJobs = useCallback(() => setJobs([]), []);

  const handleAddTask = useCallback((name: string) => {
    setCurrentTask({
      name,
      progress: 0,
      timeRemaining: 'Initializing...'
    });
    
    let prog = 0;
    const interval = setInterval(() => {
      prog += Math.random() * 15;
      if (prog >= 100) {
        clearInterval(interval);
        setCurrentTask(null);
        setJobs(prev => [{
          id: Date.now().toString(),
          name: name.replace('Downloading: ', '').replace('Converting: ', '').replace('Analyzing: ', '').replace('Separating Stems: ', ''),
          type: name.includes('Downloading') ? 'Downloaded' : name.includes('Converting') ? 'Converted' : name.includes('Separating') ? 'Separated' : 'Analyzed',
          timestamp: 'Just now',
          status: 'completed'
        }, ...prev]);
      } else {
        setCurrentTask(prev => prev ? { ...prev, progress: Math.min(prog, 100) } : null);
      }
    }, 300);
  }, []);

  const showActivitySidebar = activeTab !== NavItem.Copyright && activeTab !== NavItem.Settings;

  if (isBooting) {
    return (
      <div className="h-screen w-screen bg-background-dark flex flex-col items-center justify-center gap-8">
        <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/40 splash-logo">
          <span className="material-symbols-outlined text-white text-5xl">graphic_eq</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-white font-black uppercase tracking-[0.5em] text-sm">DJ Toolkit Pro</h1>
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[loading_2.5s_ease-in-out_infinite]"></div>
          </div>
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-2">Initializing Neural Engine...</p>
        </div>
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark transition-colors duration-500 overflow-hidden font-display">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <Header 
            onSearch={() => {}} 
            settings={settings} 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            jobs={jobs} 
            onLogout={() => setIsAuthenticated(false)}
          />
          <main className="flex-1 overflow-y-auto custom-scrollbar relative">
            <MainContent 
              activeTab={activeTab} 
              onAddTask={handleAddTask}
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              settings={settings}
              setSettings={setSettings}
            />
          </main>
        </div>

        {showActivitySidebar && (
          <ActivitySidebar 
            currentTask={currentTask}
            recentJobs={jobs}
            onClearJobs={handleClearJobs}
            performanceMode={settings.isPerformanceMode}
          />
        )}
      </div>

      <footer className="h-8 flex-shrink-0 bg-white dark:bg-rail-dark border-t border-slate-200 dark:border-white/5 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Engine Active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[10px] text-slate-500">database</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Database V3.0.1</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">CPU: 12%</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">RAM: 1.4GB</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Win11 Pro</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
