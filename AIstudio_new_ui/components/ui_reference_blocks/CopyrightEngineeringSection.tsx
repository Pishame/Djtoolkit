import React from 'react';

interface CopyrightEngineeringSectionProps {
  onOpenMP4Generator: () => void;
  onOpenMP4Concatenator: () => void;
}

const PremiumBadge: React.FC = () => (
  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-primary">
    Premium
  </span>
);

const CopyrightEngineeringSection: React.FC<CopyrightEngineeringSectionProps> = ({
  onOpenMP4Generator,
  onOpenMP4Concatenator,
}) => {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-4 px-2">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Copyright Engineering</h3>
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <button
          type="button"
          onClick={onOpenMP4Generator}
          className="p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <span className="material-symbols-outlined text-3xl text-primary">movie</span>
            <PremiumBadge />
          </div>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">MP4 Batch Generator</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Batch MP3 to Copyright Video</p>
        </button>
        <button
          type="button"
          onClick={onOpenMP4Concatenator}
          className="p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <span className="material-symbols-outlined text-3xl text-indigo-500">merge</span>
            <PremiumBadge />
          </div>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">MP4 Concatenator</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Merge MP4s for Long Tests</p>
        </button>
      </div>
    </section>
  );
};

export default CopyrightEngineeringSection;
