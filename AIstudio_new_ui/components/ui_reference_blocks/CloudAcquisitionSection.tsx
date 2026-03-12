import React from 'react';

interface CloudAcquisitionSectionProps {
  onOpenYoutube: () => void;
  onOpenTiktok: () => void;
}

const CloudAcquisitionSection: React.FC<CloudAcquisitionSectionProps> = ({
  onOpenYoutube,
  onOpenTiktok,
}) => {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-4 px-2">
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Cloud Acquisition</h3>
        <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <button
          type="button"
          onClick={onOpenYoutube}
          className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]"
        >
          <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white mb-6">
            <span className="material-symbols-outlined text-3xl">play_arrow</span>
          </div>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">YouTube</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Extract 4K Video or HQ Audio</p>
        </button>
        <button
          type="button"
          onClick={onOpenTiktok}
          className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.97]"
        >
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white mb-6">
            <span className="material-symbols-outlined text-3xl">music_video</span>
          </div>
          <p className="text-2xl font-black dark:text-white uppercase tracking-tight">TikTok</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Acquire Short-form Assets</p>
        </button>
        <div className="p-8 bg-slate-50 dark:bg-surface-dark/30 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center gap-3 opacity-60">
          <span className="material-symbols-outlined text-3xl text-slate-400">add_circle</span>
          <div>
            <p className="text-sm font-black dark:text-white uppercase tracking-tight">More Coming Soon</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Expanding Neural Nodes</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CloudAcquisitionSection;

