
import React from 'react';
import { NavItem } from '../types';
import { NAV_ITEMS } from '../constants';

interface SidebarProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ activeTab, onTabChange }) => {
  return (
    <aside className="w-16 flex-shrink-0 bg-white dark:bg-rail-dark border-r border-slate-200 dark:border-white/5 flex flex-col items-center py-6 gap-8 z-50">
      {/* App Logo */}
      <div className="mb-4">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 hover:rotate-12 transition-transform duration-300 cursor-pointer">
          <span className="material-symbols-outlined text-white text-2xl">graphic_eq</span>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex flex-col gap-4 w-full items-center">
        {NAV_ITEMS.map((item) => (
          <div 
            key={item.id} 
            className={`relative w-full flex justify-center group ${activeTab === item.id ? 'active-rail-item' : ''}`}
          >
            <button 
              onClick={() => onTabChange(item.id)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 hover:scale-105 ${
                activeTab === item.id 
                ? 'text-primary bg-primary/10' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
            <span className="absolute left-16 bg-slate-900 dark:bg-surface-dark text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl opacity-0 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0 transition-all pointer-events-none z-50 whitespace-nowrap shadow-xl">
              {item.label}
            </span>
          </div>
        ))}
      </nav>

      {/* Footer Nav */}
      <div className="mt-auto flex flex-col gap-4 w-full items-center">
        <div className={`relative w-full flex justify-center group ${activeTab === NavItem.Settings ? 'active-rail-item' : ''}`}>
          <button 
            onClick={() => onTabChange(NavItem.Settings)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 hover:scale-105 ${
              activeTab === NavItem.Settings 
              ? 'text-primary bg-primary/10' 
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <span className="absolute left-16 bg-slate-900 dark:bg-surface-dark text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl opacity-0 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0 transition-all pointer-events-none z-50 whitespace-nowrap shadow-xl">
            Settings
          </span>
        </div>
        
        <div 
          onClick={() => onTabChange(NavItem.Profile)}
          className={`w-8 h-8 rounded-full overflow-hidden border-2 cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90 ${
            activeTab === NavItem.Profile 
            ? 'border-primary ring-2 ring-primary/20 scale-105' 
            : 'border-white/10 hover:border-white/30'
          }`}
        >
          <img 
            alt="User Profile" 
            className="w-full h-full object-cover" 
            src="https://picsum.photos/100/100?random=1" 
          />
        </div>
      </div>
    </aside>
  );
});

export default Sidebar;
