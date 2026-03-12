
import React from 'react';
import { ActivityJob, CurrentTask } from '../types';

interface ActivitySidebarProps {
  currentTask: CurrentTask | null;
  recentJobs: ActivityJob[];
  onClearJobs: () => void;
  performanceMode?: boolean;
  onViewJob?: (jobId: string) => void;
}

const ActivitySidebar: React.FC<ActivitySidebarProps> = ({ currentTask, recentJobs, onClearJobs, performanceMode, onViewJob }) => {
  const isFinished = currentTask?.progress === 100;

  return (
    <aside className="w-80 flex-shrink-0 bg-slate-50 dark:bg-rail-dark border-l border-slate-200 dark:border-white/5 flex flex-col transition-colors duration-500">
      <div className="h-16 px-6 flex items-center flex-shrink-0 border-b border-slate-200 dark:border-white/5">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Activity Rail</h2>
      </div>
      
      <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-10">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Operation</p>
          {currentTask ? (
            <div className={`bg-white dark:bg-surface-dark p-5 rounded-[2rem] border transition-all duration-500 shadow-sm ${isFinished ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200 dark:border-white/5'}`}>
              <div className="flex items-start gap-4 mb-5">
                <div className={`mt-1 flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-500 ${isFinished ? 'bg-emerald-500 text-white' : 'bg-primary/20 text-primary'}`}>
                  <span className={`material-symbols-outlined text-lg ${!isFinished && !performanceMode ? 'animate-spin' : ''}`}>
                    {isFinished ? 'done_all' : 'progress_activity'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black truncate transition-colors duration-500 ${isFinished ? 'text-emerald-500' : 'dark:text-white uppercase'}`}>
                    {currentTask.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {isFinished ? 'Completed' : 'Processing Node...'}
                    </p>
                    {currentTask.isPlaylist && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest rounded-md border border-primary/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">playlist_play</span>
                        Playlist
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="relative w-full h-2.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`absolute top-0 left-0 h-full bg-primary transition-all duration-300 ease-out`} 
                  style={{ width: `${currentTask.progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 dark:bg-surface-dark/30 p-8 rounded-[2rem] border border-dashed border-slate-300 dark:border-white/10 text-center">
              <span className="material-symbols-outlined text-slate-300 text-3xl mb-2 block">hourglass_empty</span>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Idle</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Job History</p>
            <button 
              onClick={onClearJobs}
              className="text-[9px] text-primary hover:text-primary/70 uppercase font-black tracking-widest transition-all active:scale-90"
              disabled={recentJobs.length === 0}
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {recentJobs.length > 0 ? (
              recentJobs.map((job) => (
                <div 
                  key={job.id} 
                  className="flex items-center gap-4 p-4 bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black truncate dark:text-white tracking-tight uppercase">{job.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{job.type} • {job.timestamp}</p>
                  </div>
                  {onViewJob && (
                    <button 
                      onClick={() => onViewJob(job.id)}
                      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-primary transition-all opacity-0 group-hover:opacity-100"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-50 italic">No previous logs</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default ActivitySidebar;
