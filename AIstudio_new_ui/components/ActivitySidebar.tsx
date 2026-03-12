
import React from 'react';
import { ActivityJob, CurrentTask } from '../types';

interface ActivitySidebarProps {
  currentTask: CurrentTask | null;
  recentJobs: ActivityJob[];
  onClearJobs: () => void;
  onCancelTask?: () => void;
  performanceMode?: boolean;
  onPreviewJob?: (job: ActivityJob) => void;
}

const ActivitySidebar: React.FC<ActivitySidebarProps> = ({ currentTask, recentJobs, onClearJobs, onCancelTask, performanceMode, onPreviewJob }) => {
  const isFinished = currentTask?.status === 'completed' || currentTask?.progress === 100;
  const isFailed = currentTask?.status === 'failed';
  const isRunning = currentTask && !isFinished && !isFailed;
  const progressValue = Math.max(0, Math.min(100, Math.round(currentTask?.progress ?? 0)));
  const etaText = (currentTask?.timeRemaining || '').trim();
  const statusLabel = isFailed
    ? 'Failed'
    : isFinished
      ? 'Completed'
      : progressValue > 0
        ? `Working • ${progressValue}%`
        : 'Starting...';
  const hasItemCounters = Number(currentTask?.itemTotal || 0) > 1;

  return (
    <aside className="w-80 flex-shrink-0 bg-slate-50 dark:bg-rail-dark border-l border-slate-200 dark:border-white/5 flex flex-col transition-colors duration-500">
      <div className="h-16 px-6 flex items-center flex-shrink-0 border-b border-slate-200 dark:border-white/5">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Activity Rail</h2>
      </div>
      
      <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-10">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Operation</p>
          {currentTask ? (
            <div className={`bg-white dark:bg-surface-dark p-5 rounded-[2rem] border transition-all duration-500 shadow-sm ${isFailed ? 'border-red-500/60 bg-red-50/10' : isFinished ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200 dark:border-white/5'}`}>
              <div className="flex items-start gap-4 mb-5">
                <div className={`mt-1 flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-500 ${isFailed ? 'bg-red-500 text-white' : isFinished ? 'bg-emerald-500 text-white' : 'bg-primary/20 text-primary'}`}>
                  <span className={`material-symbols-outlined text-lg ${!isFinished && !isFailed ? 'animate-spin' : ''}`}>
                    {isFailed ? 'error' : isFinished ? 'done_all' : 'progress_activity'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-black leading-tight transition-colors duration-500 ${isFailed ? 'text-red-500' : isFinished ? 'text-emerald-500' : 'dark:text-white uppercase'}`}
                    style={{
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                    title={currentTask.name}
                  >
                    {currentTask.name}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                    {statusLabel}
                  </p>
                  {!isFailed && !isFinished && (
                    <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                      {etaText && etaText !== '--' ? etaText : 'Starting transfer...'}
                    </p>
                  )}
                  {!isFailed && hasItemCounters && (
                    <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                      Item {Math.max(1, Number(currentTask?.itemIndex || 1))} / {Math.max(1, Number(currentTask?.itemTotal || 1))}
                    </p>
                  )}
                  {isFailed && etaText && (
                    <p className="text-[10px] font-bold text-red-400/80 mt-1 uppercase tracking-widest">
                      {etaText}
                    </p>
                  )}
                  {isFinished && (
                    <p className="text-[10px] font-bold text-emerald-400/80 mt-1 uppercase tracking-widest">
                      100% complete
                    </p>
                  )}
                </div>
                {isRunning && onCancelTask && (
                  <button
                    type="button"
                    onClick={onCancelTask}
                    className="px-3 py-1.5 rounded-xl border border-red-400/30 text-red-400 hover:bg-red-500/10 text-[9px] font-black uppercase tracking-wider transition-colors"
                  >
                    Cancel
                  </button>
                )}
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
                  onClick={() => {
                    if (job.status === 'completed' && job.type === 'Analyzed') {
                      onPreviewJob?.(job);
                    }
                  }}
                  className={`flex items-center gap-4 p-4 bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-all group ${job.status === 'completed' && job.type === 'Analyzed' ? 'cursor-pointer' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${job.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    <span className="material-symbols-outlined text-sm">{job.status === 'failed' ? 'error' : 'check_circle'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black truncate dark:text-white tracking-tight uppercase">{job.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{job.status === 'failed' ? 'Failed' : job.type} • {job.timestamp}</p>
                  </div>
                  {job.status === 'completed' && (
                    <div
                      className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${job.type === 'Analyzed' ? 'text-slate-400 group-hover:text-primary' : 'text-slate-400/70'}`}
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                    </div>
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
