
import React from 'react';
import { ActivityJob } from '../types';

interface JobDetailModalProps {
  job: ActivityJob | null;
  onClose: () => void;
}

const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar animate-[modalScaleUp_0.3s_ease-out]">
        {/* Header */}
        <div className="px-10 pt-12 pb-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl ${
                job.type === 'Downloaded' ? 'bg-blue-500' :
                job.type === 'Separated' ? 'bg-emerald-500' :
                job.type === 'Analyzed' ? 'bg-indigo-500' : 'bg-primary'
              }`}>
                <span className="material-symbols-outlined text-4xl">
                  {job.type === 'Downloaded' ? 'download' :
                   job.type === 'Separated' ? 'dynamic_feed' :
                   job.type === 'Analyzed' ? 'analytics' : 'description'}
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white truncate max-w-[350px]">{job.name}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{job.type} • {job.timestamp}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-10 space-y-10">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-sm font-black uppercase tracking-tight text-emerald-500">Completed</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Neural Engine</p>
              <p className="text-sm font-black dark:text-white uppercase tracking-tight">V4.2.2 Stable</p>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">File Format</p>
              <p className="text-sm font-black dark:text-white uppercase tracking-tight">{job.name.split('.').pop()?.toUpperCase() || 'UNKNOWN'}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Processing Time</p>
              <p className="text-sm font-black dark:text-white uppercase tracking-tight">{job.processingTime || '1.2s'}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Input Location</p>
                <span className="material-symbols-outlined text-sm text-primary">link</span>
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                {job.inputPath || '---'}
              </p>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Output Location</p>
                <span className="material-symbols-outlined text-sm text-primary">folder_open</span>
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                {job.outputPath || `/Downloads/DJ-Toolkit/Exports/${job.name}`}
              </p>
            </div>

            {job.parameters && job.parameters.length > 0 && (
              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Specific Parameters</p>
                <div className="flex flex-wrap gap-2">
                  {job.parameters.map((p, i) => (
                    <span key={i} className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button className="flex-1 py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3">
              <span className="material-symbols-outlined">play_arrow</span>
              Play Asset
            </button>
            <button className="flex-1 py-5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 dark:hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center gap-3">
              <span className="material-symbols-outlined">folder</span>
              Reveal in Explorer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobDetailModal;
