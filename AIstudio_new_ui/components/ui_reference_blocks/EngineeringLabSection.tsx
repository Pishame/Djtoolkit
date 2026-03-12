import React from 'react';

interface EngineeringLabSectionProps {
  onOpenKey: () => void;
  onOpenStem: () => void;
  onOpenVocalFix: () => void;
}

const EngineeringLabSection: React.FC<EngineeringLabSectionProps> = ({
  onOpenKey,
  onOpenStem,
  onOpenVocalFix,
}) => {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-4 px-2">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Engineering Lab</h3>
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <button type="button" onClick={onOpenKey} className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]">
          <span className="material-symbols-outlined text-3xl text-indigo-500 mb-5">analytics</span>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">BPM & Key</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Neural Track Analysis</p>
        </button>
        <button type="button" onClick={onOpenStem} className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]">
          <span className="material-symbols-outlined text-3xl text-emerald-500 mb-5">dynamic_feed</span>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">Stems</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Isolate Drums/Bass/Vocal</p>
        </button>
        <button type="button" onClick={onOpenVocalFix} className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]">
          <span className="material-symbols-outlined text-3xl text-purple-500 mb-5">record_voice_over</span>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">Vocal Fix</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Remove Instrumental Leak</p>
        </button>
      </div>
    </section>
  );
};

export default EngineeringLabSection;


