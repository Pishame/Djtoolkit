
import React, { useState } from 'react';
import { NavItem, UserPlan } from '../types';
import { NAV_ITEMS } from '../constants';

interface SidebarProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  plan?: UserPlan;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ activeTab, onTabChange, plan = 'free' }) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <aside className="relative z-[120] w-16 flex-shrink-0 overflow-visible bg-white dark:bg-rail-dark border-r border-slate-200 dark:border-white/5 flex flex-col items-center py-6 gap-8">
      {/* App Logo */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 hover:rotate-12 transition-transform duration-300 cursor-pointer">
          <span className="material-symbols-outlined text-white text-2xl">graphic_eq</span>
        </div>
        {plan === 'free' && (
          <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md">
            <span className="text-[6px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">FREE</span>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex flex-col gap-4 w-full items-center">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`relative w-full flex justify-center group ${activeTab === item.id ? 'active-rail-item' : ''}`}
            onMouseEnter={() => setHoveredItem(String(item.id))}
            onMouseLeave={() => setHoveredItem(null)}
            onPointerEnter={() => setHoveredItem(String(item.id))}
            onPointerLeave={() => setHoveredItem(null)}
          >
            <button
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 hover:scale-105 ${
                activeTab === item.id
                  ? 'text-primary bg-primary/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
            </button>
            <span data-sidebar-tooltip className={`pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 dark:bg-surface-dark text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all duration-200 z-[130] whitespace-nowrap shadow-xl ${
              hoveredItem === String(item.id)
                ? 'opacity-100 translate-x-0 scale-100'
                : 'opacity-0 translate-x-1 scale-95'
            }`}>
              {item.label}
            </span>
          </div>
        ))}
      </nav>

      {/* Footer Nav */}
      <div className="mt-auto flex flex-col gap-4 w-full items-center">
        <div
          className={`relative w-full flex justify-center group ${activeTab === NavItem.Settings ? 'active-rail-item' : ''}`}
          onMouseEnter={() => setHoveredItem(String(NavItem.Settings))}
          onMouseLeave={() => setHoveredItem(null)}
          onPointerEnter={() => setHoveredItem(String(NavItem.Settings))}
          onPointerLeave={() => setHoveredItem(null)}
        >
          <button
            onClick={() => onTabChange(NavItem.Settings)}
            aria-label="Settings"
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-90 hover:scale-105 ${
              activeTab === NavItem.Settings
                ? 'text-primary bg-primary/10'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <span data-sidebar-tooltip className={`pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 dark:bg-surface-dark text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all duration-200 z-[130] whitespace-nowrap shadow-xl ${
            hoveredItem === String(NavItem.Settings)
              ? 'opacity-100 translate-x-0 scale-100'
              : 'opacity-0 translate-x-1 scale-95'
          }`}>
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
