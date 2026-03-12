
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NavItem, AppSettings, ActivityJob, UsageStats } from '../types';

interface MainContentProps {
  activeTab: NavItem;
  onAddTask?: (name: string, isPlaylist?: boolean, stems?: string[]) => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (val: boolean) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  onViewJob?: (jobId: string) => void;
  jobs: ActivityJob[];
  usageStats: UsageStats;
  setUsageStats: (stats: UsageStats) => void;
}

const WaveformVisualizer: React.FC<{ performanceMode?: boolean }> = ({ performanceMode }) => {
  if (performanceMode) {
    return (
      <div className="flex items-end justify-between gap-1 h-12 px-4 w-full opacity-20">
        {[...Array(24)].map((_, i) => (
          <div key={i} className="bg-primary w-1 rounded-full h-[30%]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-1 h-12 px-4 w-full opacity-30 group-hover:opacity-60 transition-opacity">
      {[...Array(32)].map((_, i) => (
        <div 
          key={i} 
          className="bg-primary w-1 rounded-full animate-pulse" 
          style={{ 
            height: `${Math.random() * 100}%`,
            animationDelay: `${i * 0.05}s`,
            animationDuration: `${0.4 + Math.random()}s`
          }} 
        />
      ))}
    </div>
  );
};

const CustomSelect: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  className?: string;
}> = ({ value, options, onChange, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 hover:border-primary/30 rounded-2xl px-5 py-4 text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all active:scale-[0.98]"
      >
        <span className="truncate">{selectedOption.label}</span>
        <span className={`material-symbols-outlined transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-[150] overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-colors ${
                value === opt.value 
                  ? 'bg-primary text-white' 
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const KeyDetectView: React.FC<{ performanceMode?: boolean, onAddTask?: (name: string, isPlaylist?: boolean) => void }> = ({ performanceMode, onAddTask }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<{name: string, key: string, bpm: string, confidence: string}[]>([]);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = () => {
    setFiles(['Euphoric_Daze.mp3', 'Midnight_Loop_Master.wav', 'Sunset_Synth_Core.flac']);
  };

  const startAnalysis = () => {
    setIsAnalyzing(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setResults([
          { name: 'Euphoric_Daze.mp3', key: '8A', bpm: '124', confidence: '99%' },
          { name: 'Midnight_Loop_Master.wav', key: '10B', bpm: '128', confidence: '94%' },
          { name: 'Sunset_Synth_Core.flac', key: '1A', bpm: '126', confidence: '97%' },
        ]);
        setIsAnalyzing(false);
        onAddTask?.(`Batch Analysis Completed: ${files.length} Tracks Identified`);
      }
    }, performanceMode ? 15 : 40);
  };

  const reset = () => {
    setFiles([]);
    setResults([]);
    setIsAnalyzing(false);
    setProgress(0);
  };

  if (files.length === 0 && results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-12 animate-[fadeIn_0.5s_ease-out]">
        <div 
          onClick={handleFileSelect}
          className="w-full max-w-2xl aspect-video border-4 border-dashed border-slate-200 dark:border-white/10 rounded-[4rem] flex flex-col items-center justify-center gap-8 group hover:border-primary/50 hover:bg-primary/[0.02] transition-all cursor-pointer relative overflow-hidden"
        >
          <div className="w-28 h-28 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
            <span className="material-symbols-outlined text-6xl">cloud_upload</span>
          </div>
          <div className="text-center space-y-3">
            <h2 className="text-4xl font-black uppercase tracking-tighter dark:text-white">Neural Key Analysis</h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Please upload your MP3/WAV files first to begin the extraction process.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (files.length > 0 && results.length === 0 && !isAnalyzing) {
    return (
      <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-4xl mx-auto space-y-10">
        <div className="flex items-center justify-between px-4">
           <div>
              <h2 className="text-3xl font-black dark:text-white uppercase tracking-tighter">Tracks Staged</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{files.length} Assets Loaded</p>
           </div>
           <button onClick={reset} className="px-6 py-3 bg-slate-100 dark:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors">Clear Batch</button>
        </div>
        
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[3rem] overflow-hidden shadow-xl">
           <div className="divide-y divide-slate-100 dark:divide-white/5">
              {files.map((f, i) => (
                <div key={i} className="px-10 py-6 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                   <div className="flex items-center gap-5">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400">
                         <span className="material-symbols-outlined">audiotrack</span>
                      </div>
                      <span className="text-base font-black dark:text-white uppercase tracking-tight">{f}</span>
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                      READY
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                   </span>
                </div>
              ))}
           </div>
        </div>

        <button 
          onClick={startAnalysis}
          className="w-full py-7 bg-primary text-white rounded-[2.5rem] font-black uppercase tracking-[0.4em] shadow-2xl shadow-primary/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 text-sm"
        >
          START NEURAL EXTRACTION
          <span className="material-symbols-outlined">bolt</span>
        </button>
      </div>
    );
  }

  if (isAnalyzing) {
     return (
       <div className="flex flex-col items-center justify-center min-h-[70vh] p-12 space-y-16 animate-[fadeIn_0.5s_ease-out]">
          <div className="relative w-64 h-64">
             <svg className="w-full h-full transform -rotate-90">
                <circle cx="128" cy="128" r="110" className="stroke-slate-100 dark:stroke-white/5 fill-none stroke-[12]" />
                <circle cx="128" cy="128" r="110" className="stroke-primary fill-none stroke-[12] transition-all duration-300" style={{ strokeDasharray: 691, strokeDashoffset: 691 - (691 * progress) / 100 }} />
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-6xl font-black text-primary tracking-tighter">{progress}%</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Harmonic Syncing</span>
             </div>
          </div>
       </div>
     );
  }

  return (
    <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-[1400px] mx-auto pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-10">
          <div className="flex items-center justify-between px-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight dark:text-white mb-2 uppercase">Extraction Results</h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Detailed breakdown of processed audio nodes.</p>
            </div>
            <button onClick={reset} className="px-8 py-4 bg-primary/10 text-primary border border-primary/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-3">
              <span className="material-symbols-outlined text-sm">refresh</span>
              New Scan
            </button>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[3rem] overflow-hidden shadow-2xl dark:shadow-none min-h-[400px]">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
                      <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Track Identity</th>
                      <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Harmonic Key</th>
                      <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Tempo (BPM)</th>
                      <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Confidence</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                   {results.map((res, i) => (
                     <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-10 py-7 text-base font-black dark:text-white uppercase tracking-tight">{res.name}</td>
                        <td className="px-10 py-7 text-center">
                           <span className="px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20">{res.key}</span>
                        </td>
                        <td className="px-10 py-7 text-base font-black dark:text-slate-300 text-center">{res.bpm}</td>
                        <td className="px-10 py-7 text-right">
                           <span className="text-emerald-500 font-black text-sm">{res.confidence}</span>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </div>

        <div className="space-y-8">
           <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[3rem] p-10 shadow-2xl dark:shadow-none space-y-10 sticky top-8">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <span className="material-symbols-outlined text-sm">donut_large</span>
                 </div>
                 <h2 className="text-[11px] font-black uppercase tracking-[0.2em] dark:text-white">Harmonic Radar</h2>
              </div>
              <CamelotWheel performanceMode={performanceMode} highlightedKey={results[0]?.key} />
           </div>
        </div>
      </div>
    </div>
  );
};

const MP4GeneratorModal: React.FC<{ isOpen: boolean; onClose: () => void; onStart: (name: string, isPlaylist?: boolean) => void; performanceMode?: boolean; settings: AppSettings }> = ({ isOpen, onClose, onStart, performanceMode, settings }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [offset, setOffset] = useState('30s');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = () => {
    setFiles(['Euphoric_Daze.mp3', 'Midnight_Loop_Master.wav', 'Sunset_Synth_Core.flac']);
  };

  const startGeneration = () => {
    setIsGenerating(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setIsGenerating(false);
        onStart(`MP4 Generated: ${files.length} Tracks @ ${offset} Offset`);
        onClose();
        setFiles([]);
        setProgress(0);
      }
    }, performanceMode ? 50 : 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar animate-[modalScaleUp_0.3s_ease-out]">
        <div className="px-10 pt-10 pb-6 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl">
              <span className="material-symbols-outlined text-3xl">movie</span>
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white">MP4 Copyright Generator</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Batch convert MP3s to MP4 with blank visual</p>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8">
          {!isGenerating ? (
            <>
              <div 
                onClick={handleFileSelect}
                className={`border-2 border-dashed rounded-[2.5rem] p-12 text-center cursor-pointer transition-all ${files.length > 0 ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-white/10 hover:border-primary/50'}`}
              >
                <span className="material-symbols-outlined text-5xl mb-4 text-primary">library_music</span>
                <p className="text-sm font-black dark:text-white uppercase tracking-widest">
                  {files.length > 0 ? `${files.length} Tracks Selected` : 'Drop MP3 Batch Here'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Copyright Offset</label>
                  <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl">
                    {['30s', '60s', 'Full'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setOffset(o)}
                        className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${offset === o ? 'bg-white dark:bg-white/10 text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Output Target</label>
                  <div className="px-5 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-sm">folder</span>
                    <span className="text-[9px] font-black text-slate-500 truncate uppercase tracking-widest">{settings.globalOutputPath}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={startGeneration}
                disabled={files.length === 0}
                className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                GENERATE CUSTOM MP4 BATCH
              </button>
            </>
          ) : (
            <div className="py-10 text-center space-y-8">
              <div className="relative w-40 h-40 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="75" className="stroke-slate-100 dark:stroke-white/5 fill-none stroke-[10]" />
                  <circle cx="80" cy="80" r="75" className="stroke-primary fill-none stroke-[10] transition-all duration-300" style={{ strokeDasharray: 471, strokeDashoffset: 471 - (471 * progress) / 100 }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-primary">{progress}%</div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">Encoding Neural Video Stream...</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Processing: {files[Math.floor((progress/100) * files.length)] || files[0]}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MP4ConcatenatorModal: React.FC<{ isOpen: boolean; onClose: () => void; onStart: (name: string, isPlaylist?: boolean) => void; performanceMode?: boolean; settings: AppSettings }> = ({ isOpen, onClose, onStart, performanceMode, settings }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [segmentDuration, setSegmentDuration] = useState('30s');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = () => {
    setFiles(['Video_A.mp4', 'Video_B.mp4', 'Video_C.mp4', 'Video_D.mp4']);
  };

  const startConcatenation = () => {
    setIsProcessing(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setIsProcessing(false);
        onStart(`Concatenated MP4: ${files.length} Segments @ ${segmentDuration} each`);
        onClose();
        setFiles([]);
        setProgress(0);
      }
    }, performanceMode ? 50 : 150);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar animate-[modalScaleUp_0.3s_ease-out]">
        <div className="px-10 pt-10 pb-6 border-b border-slate-100 dark:border-white/5 bg-indigo-500/5">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-xl">
              <span className="material-symbols-outlined text-3xl">merge</span>
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white">MP4 Concatenator</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Merge multiple MP4s into one long test video</p>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8">
          {!isProcessing ? (
            <>
              <div 
                onClick={handleFileSelect}
                className={`border-2 border-dashed rounded-[2.5rem] p-12 text-center cursor-pointer transition-all ${files.length > 0 ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-200 dark:border-white/10 hover:border-indigo-500/50'}`}
              >
                <span className="material-symbols-outlined text-5xl mb-4 text-indigo-500">video_library</span>
                <p className="text-sm font-black dark:text-white uppercase tracking-widest">
                  {files.length > 0 ? `${files.length} Videos Selected` : 'Drop MP4 Batch to Merge'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Segment Duration</label>
                  <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl">
                    {['30s', '60s', 'Full'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setSegmentDuration(d)}
                        className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${segmentDuration === d ? 'bg-white dark:bg-white/10 text-indigo-500 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Output Target</label>
                  <div className="px-5 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center gap-3">
                    <span className="material-symbols-outlined text-indigo-500 text-sm">folder</span>
                    <span className="text-[9px] font-black text-slate-500 truncate uppercase tracking-widest">{settings.globalOutputPath}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={startConcatenation}
                disabled={files.length === 0}
                className="w-full py-5 bg-indigo-500 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                START MERGE PROCESS
              </button>
            </>
          ) : (
            <div className="py-10 text-center space-y-8">
              <div className="relative w-40 h-40 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="75" className="stroke-slate-100 dark:stroke-white/5 fill-none stroke-[10]" />
                  <circle cx="80" cy="80" r="75" className="stroke-indigo-500 fill-none stroke-[10] transition-all duration-300" style={{ strokeDasharray: 471, strokeDashoffset: 471 - (471 * progress) / 100 }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-indigo-500">{progress}%</div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-500 animate-pulse">Stitching Video Streams...</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Merging Segment: {Math.floor((progress/100) * files.length) + 1} of {files.length}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CopyrightView: React.FC<{ performanceMode?: boolean; onAddTask?: (name: string, isPlaylist?: boolean) => void; settings: AppSettings; usageStats: UsageStats; onUpgrade: () => void }> = ({ performanceMode, onAddTask, settings, usageStats, onUpgrade }) => {
  const [isMP4ModalOpen, setIsMP4ModalOpen] = useState(false);
  const [isConcatenatorOpen, setIsConcatenatorOpen] = useState(false);
  
  const scanLimit = 100;
  const isOverLimit = !usageStats.isPremium && usageStats.copyrightScans >= scanLimit;

  const [scannedTracks] = useState([
    { name: 'Midnight_Techno_Master.wav', status: 'Cleared', action: 'DETAILS' },
    { name: 'House_Anthem_Edit_v2.mp3', status: 'Flagged', action: 'FIX' },
    { name: 'Groove_Sample_Pack_04.flac', status: 'Processing', action: 'CANCEL' },
    { name: 'Skyline_Vibe_Ambient.mp3', status: 'Cleared', action: 'DETAILS' },
  ]);

  return (
    <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-[1400px] mx-auto space-y-10 pb-24 relative">
      {isOverLimit && (
        <div className="absolute inset-0 z-50 bg-slate-950/20 backdrop-blur-sm flex items-center justify-center p-8 rounded-[4rem]">
          <div className="bg-white dark:bg-surface-dark p-12 rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 max-w-lg text-center space-y-8 animate-[modalScaleUp_0.3s_ease-out]">
            <div className="w-24 h-24 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mx-auto">
              <span className="material-symbols-outlined text-5xl">workspace_premium</span>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white">Premium Required</h2>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                You've reached the free limit of {scanLimit} copyright scans.<br />
                Upgrade to a Professional license for unlimited library auditing.
              </p>
            </div>
            <button 
              onClick={onUpgrade}
              className="w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              Upgrade to Premium
            </button>
          </div>
        </div>
      )}

      <MP4GeneratorModal 
        isOpen={isMP4ModalOpen} 
        onClose={() => setIsMP4ModalOpen(false)} 
        onStart={(n) => onAddTask?.(n)} 
        performanceMode={performanceMode} 
        settings={settings}
      />
      <MP4ConcatenatorModal 
        isOpen={isConcatenatorOpen} 
        onClose={() => setIsConcatenatorOpen(false)} 
        onStart={(n) => onAddTask?.(n)} 
        performanceMode={performanceMode} 
        settings={settings}
      />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-10">
        <div className="space-y-10">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-black dark:text-white uppercase tracking-tighter">Copyright Scanner</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Check your library for metadata accuracy and legal compliance.
            </p>
          </div>

          {/* Drop Zone */}
          <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[3rem] p-16 flex flex-col items-center justify-center gap-6 bg-white/5 relative group hover:border-primary/50 transition-all">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
              <span className="material-symbols-outlined text-4xl">upload_file</span>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black dark:text-white uppercase tracking-tight">Drop files to scan</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                Drag and drop your audio files here or click to browse.<br />
                Supports MP3, WAV, and FLAC formats.
              </p>
            </div>
            <button className="mt-4 px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all">
              Scan Now
            </button>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl dark:shadow-none">
            <div className="px-10 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] dark:text-white">Scanned Tracks</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing last 12 scans</span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-black/40">
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">File Name</th>
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Status</th>
                  <th className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {scannedTracks.map((track, i) => (
                  <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-10 py-6 text-sm font-black dark:text-white uppercase tracking-tight">{track.name}</td>
                    <td className="px-10 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto w-fit ${
                        track.status === 'Cleared' ? 'bg-emerald-500/10 text-emerald-500' : 
                        track.status === 'Flagged' ? 'bg-red-500/10 text-red-500' : 
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {track.status === 'Processing' && <span className="material-symbols-outlined text-[10px] animate-spin">sync</span>}
                        {track.status === 'Cleared' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                        {track.status === 'Flagged' && <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>}
                        {track.status}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <button className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                        track.action === 'FIX' ? 'text-primary' : 'text-slate-400 hover:text-white'
                      }`}>
                        {track.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Prominent Tools Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-primary p-10 rounded-[3rem] text-white shadow-2xl shadow-primary/30 relative overflow-hidden group cursor-pointer" onClick={() => setIsMP4ModalOpen(true)}>
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">movie</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">MP4 Batch Generator</h3>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] mt-1">Convert MP3s to Copyright-Ready Video</p>
                </div>
                <button className="px-8 py-3 bg-white text-primary rounded-xl font-black uppercase tracking-widest text-[10px] group-hover:scale-105 transition-transform">
                  LAUNCH GENERATOR
                </button>
              </div>
              <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[12rem] opacity-10 group-hover:rotate-12 transition-transform duration-500">video_settings</span>
              <div className="absolute top-6 right-6 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/20">
                <span className="text-[8px] font-black uppercase tracking-widest">Premium</span>
              </div>
            </div>

            <div className="bg-indigo-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden group cursor-pointer" onClick={() => setIsConcatenatorOpen(true)}>
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">merge</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">MP4 Concatenator</h3>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] mt-1">Merge Multiple MP4s into One Long Test</p>
                </div>
                <button className="px-8 py-3 bg-white text-indigo-600 rounded-xl font-black uppercase tracking-widest text-[10px] group-hover:scale-105 transition-transform">
                  LAUNCH MERGER
                </button>
              </div>
              <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[12rem] opacity-10 group-hover:-rotate-12 transition-transform duration-500">movie_edit</span>
              <div className="absolute top-6 right-6 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/20">
                <span className="text-[8px] font-black uppercase tracking-widest">Premium</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Scan Summary */}
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] p-8 shadow-2xl dark:shadow-none space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-sm">analytics</span>
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] dark:text-white">Scan Summary</h2>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Tracks</p>
                  <p className="text-2xl font-black dark:text-white">{usageStats.copyrightScans.toLocaleString()}</p>
                </div>
                <span className="material-symbols-outlined text-slate-400">list</span>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Cleared</p>
                  <p className="text-2xl font-black dark:text-white">1,232</p>
                </div>
                <span className="material-symbols-outlined text-emerald-500">check_circle</span>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Flagged</p>
                  <p className="text-2xl font-black dark:text-white">16</p>
                </div>
                <span className="material-symbols-outlined text-red-500">cancel</span>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Compliance Score</span>
                <span className="text-sm font-black dark:text-white">98%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[98%]"></div>
              </div>
            </div>
          </div>

          {/* Bulk Fix */}
          <div className="bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
            <div className="relative z-10 space-y-4">
              <h3 className="text-lg font-black dark:text-white uppercase tracking-tight leading-tight">Bulk Fix Available</h3>
              <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                You have 16 tracks flagged for metadata issues. Click below to auto-correct all basic copyright tags.
              </p>
              <button className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3">
                AUTO-FIX ALL
                <span className="material-symbols-outlined text-sm">magic_button</span>
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-9xl">verified_user</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HistoryView: React.FC<{ jobs: ActivityJob[]; onViewJob?: (jobId: string) => void }> = ({ jobs, onViewJob }) => {
  const [historyItems] = useState<ActivityJob[]>([
    { 
      id: '1', 
      name: 'Euphoric_Daze_Master.wav', 
      type: 'Downloaded', 
      timestamp: '2023-11-01 10:20', 
      status: 'completed',
      processingTime: '12.4s',
      inputPath: 'https://youtube.com/watch?v=...',
      outputPath: '/neural/output/euphoric_daze.wav',
      parameters: ['44.1kHz', '320kbps']
    },
    { 
      id: '2', 
      name: 'Deep_Loop_Techno.mp3', 
      type: 'Analyzed', 
      timestamp: '2023-10-28 15:45', 
      status: 'completed',
      processingTime: '8.2s',
      inputPath: '/neural/input/deep_loop.mp3',
      outputPath: '/neural/analysis/deep_loop.json',
      parameters: ['BPM: 128', 'Key: Am']
    },
    { 
      id: '3', 
      name: 'Vocals_Sunset_Drive.wav', 
      type: 'Separated', 
      timestamp: '2023-10-27 09:12', 
      status: 'completed',
      processingTime: '24.1s',
      inputPath: '/neural/input/sunset_drive.wav',
      outputPath: '/neural/stems/sunset_drive_vocals.wav',
      parameters: ['4-Stem', 'High-Res']
    },
    { 
      id: '4', 
      name: 'Drum_Loops_V2.zip', 
      type: 'Converted', 
      timestamp: '2023-10-26 18:30', 
      status: 'completed',
      processingTime: '45.0s',
      inputPath: '/neural/input/drum_loops.zip',
      outputPath: '/neural/output/drum_loops_v2.zip',
      parameters: ['Batch', 'FLAC to WAV']
    },
    { 
      id: '5', 
      name: 'Bass_Isolate_01.flac', 
      type: 'Separated', 
      timestamp: '2023-10-25 11:05', 
      status: 'failed',
      processingTime: '2.1s',
      inputPath: '/neural/input/bass_01.flac',
      parameters: ['4-Stem']
    },
  ]);

  const allItems = [
    ...jobs,
    ...historyItems
  ];

  return (
    <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-[1400px] mx-auto pb-24">
      <div className="space-y-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight dark:text-white mb-2 uppercase">Extraction Logs</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Comprehensive history of all neural station operations.</p>
          </div>
          <button className="px-8 py-4 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:border-primary/50 transition-all shadow-sm">
            Export Logs
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
           {[
             { label: 'Operations', value: allItems.length.toString(), icon: 'sync_alt', color: 'text-primary' },
             { label: 'Storage Sync', value: '42.8 GB', icon: 'cloud_done', color: 'text-blue-500' },
             { label: 'Efficiency', value: '99.8%', icon: 'bolt', color: 'text-emerald-500' },
             { label: 'Total Nodes', value: '142h', icon: 'memory', color: 'text-amber-500' },
           ].map((stat, i) => (
             <div key={i} className="p-8 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] shadow-sm group hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-5">
                   <div className={`w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center ${stat.color}`}>
                      <span className="material-symbols-outlined">{stat.icon}</span>
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</span>
                </div>
                <p className="text-3xl font-black dark:text-white uppercase tracking-tighter group-hover:text-primary transition-colors">{stat.value}</p>
             </div>
           ))}
        </div>

        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[3rem] overflow-hidden shadow-2xl dark:shadow-none min-h-[500px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Operation Asset</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Modality</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Neural Time</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Parameters</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {allItems.map((item) => (
                <tr key={item.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${item.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-primary'}`}>
                         <span className="material-symbols-outlined text-sm">{item.status === 'failed' ? 'error' : 'description'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-base font-black dark:text-white uppercase tracking-tight">{item.name}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[200px]" title={item.inputPath}>
                            IN: {item.inputPath || '---'}
                          </span>
                          <span className="text-slate-300 dark:text-white/10">|</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[200px]" title={item.outputPath}>
                            OUT: {item.outputPath || '---'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all inline-block w-fit">
                        {item.type}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">{item.timestamp}</span>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-2">
                       <span className="material-symbols-outlined text-xs text-slate-400">timer</span>
                       <span className="text-[11px] font-black dark:text-white uppercase tracking-widest">{item.processingTime || '---'}</span>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex flex-wrap gap-2">
                      {item.parameters?.map((p, i) => (
                        <span key={i} className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/5">
                          {p}
                        </span>
                      )) || <span className="text-[9px] font-bold text-slate-400 uppercase italic">No Params</span>}
                    </div>
                  </td>
                  <td className="px-10 py-7 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {item.status === 'completed' && onViewJob && (
                        <>
                          <button 
                            onClick={() => onViewJob(item.id)}
                            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover:opacity-100"
                            title="View Details"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                          </button>
                          <button 
                            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all opacity-0 group-hover:opacity-100"
                            title="Download Result"
                          >
                            <span className="material-symbols-outlined text-sm">download</span>
                          </button>
                        </>
                      )}
                      {item.status === 'failed' && (
                        <button 
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Retry Operation"
                        >
                          <span className="material-symbols-outlined text-sm">refresh</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ProfileView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-[fadeIn_0.5s_ease-out] pb-32">
      <div className="bg-white dark:bg-surface-dark rounded-[3rem] shadow-xl p-10 border border-slate-200 dark:border-white/5 space-y-12">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 border-primary/20 shadow-2xl group-hover:border-primary transition-all">
              <img src="https://picsum.photos/200/200?random=1" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-sm">edit</span>
            </button>
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white">Professional DJ</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Neural Suite Member since 2024</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Display Name</label>
            <input 
              type="text" 
              defaultValue="Professional DJ"
              className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm dark:text-white transition-all"
            />
          </div>
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Email Address</label>
            <input 
              type="email" 
              defaultValue="dj@protoolkit.com"
              className="w-full bg-slate-50 dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm dark:text-white transition-all"
            />
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Account Statistics</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Cloud Sync', value: 'Active', icon: 'cloud_done' },
              { label: 'Neural Usage', value: '142h', icon: 'memory' },
              { label: 'Assets', value: '1.2k', icon: 'library_music' },
            ].map((stat, i) => (
              <div key={i} className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 text-center">
                <span className="material-symbols-outlined text-primary mb-2">{stat.icon}</span>
                <p className="text-xl font-black dark:text-white uppercase tracking-tighter">{stat.value}</p>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <button className="w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all">
          Update Profile
        </button>
      </div>
    </div>
  );
};

const UpgradePlansModal: React.FC<{ isOpen: boolean; onClose: () => void; usageStats: UsageStats; setUsageStats: (s: UsageStats) => void }> = ({ isOpen, onClose, usageStats, setUsageStats }) => {
  if (!isOpen) return null;

  const plans = [
    {
      name: 'Free Tier',
      price: '$0',
      desc: 'Basic extraction & analysis',
      features: ['5 Daily Downloads', '100 Copyright Scans', 'Standard Speed', 'Community Support'],
      isCurrent: !usageStats.isPremium,
      color: 'bg-slate-100 dark:bg-white/5',
      textColor: 'text-slate-500 dark:text-slate-400'
    },
    {
      name: 'Professional',
      price: '$19',
      period: '/mo',
      desc: 'For power users & DJs',
      features: ['Unlimited Downloads', 'Unlimited Scans', 'Neural Priority Speed', '4K Video Support', 'Stem Separation Beta'],
      isCurrent: usageStats.isPremium,
      color: 'bg-primary text-white',
      textColor: 'text-white',
      highlight: true
    },
    {
      name: 'Studio',
      price: '$49',
      period: '/mo',
      desc: 'Full production suite',
      features: ['Everything in Pro', 'Batch Processing', 'API Access', 'Custom Neural Models', '24/7 Priority Support'],
      isCurrent: false,
      color: 'bg-indigo-600 text-white',
      textColor: 'text-white'
    }
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-5xl rounded-[3.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar animate-[modalScaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="p-12 lg:p-16 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-black uppercase tracking-tighter dark:text-white">Upgrade Your Neural Node</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium max-w-xl mx-auto">
              Unlock the full potential of the DJ Toolkit with our professional and studio grade processing engines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div key={i} className={`p-10 rounded-[2.5rem] border flex flex-col gap-8 relative transition-all duration-500 ${plan.highlight ? 'border-primary shadow-2xl shadow-primary/20 scale-105 z-10' : 'border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'} ${plan.color}`}>
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white text-primary text-[8px] font-black uppercase tracking-widest rounded-full shadow-lg">
                    Most Popular
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className={`text-xl font-black uppercase tracking-tight ${plan.textColor}`}>{plan.name}</h3>
                  <p className={`text-[10px] font-bold uppercase tracking-widest opacity-60 ${plan.textColor}`}>{plan.desc}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-4xl font-black ${plan.textColor}`}>{plan.price}</span>
                  {plan.period && <span className={`text-sm font-bold opacity-60 ${plan.textColor}`}>{plan.period}</span>}
                </div>
                <div className="space-y-4 flex-1">
                  {plan.features.map((feat, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-sm ${plan.textColor} opacity-60`}>check_circle</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${plan.textColor} opacity-80`}>{feat}</span>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => {
                    if (plan.name === 'Professional') {
                      setUsageStats({ ...usageStats, isPremium: true });
                      onClose();
                    }
                  }}
                  disabled={plan.isCurrent}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${
                    plan.isCurrent 
                    ? 'bg-black/10 text-black/40 cursor-default' 
                    : plan.highlight 
                      ? 'bg-white text-primary hover:scale-105 shadow-xl' 
                      : 'bg-primary text-white hover:brightness-110'
                  }`}
                >
                  {plan.isCurrent ? 'Current Plan' : 'Select Plan'}
                </button>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button onClick={onClose} className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-primary transition-colors">
              Continue with current setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ isDarkMode: boolean; setIsDarkMode: (v: boolean) => void; settings: AppSettings; setSettings: (s: AppSettings) => void }> = ({ isDarkMode, setIsDarkMode, settings, setSettings }) => {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setFeedback('');
      alert("Feedback transmitted to neural core. Thank you.");
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-[fadeIn_0.5s_ease-out] pb-32">
      <div className="bg-white dark:bg-surface-dark rounded-[3rem] shadow-xl p-10 border border-slate-200 dark:border-white/5 space-y-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">System Management</h2>
          <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-2xl border border-primary/20">
             <span className="material-symbols-outlined text-primary text-sm">settings_suggest</span>
             <span className="text-[10px] font-black uppercase tracking-widest text-primary">V4.2.1-PRO</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Performance</h3>
            <div className="space-y-4">
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Performance Mode</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">CPU task prioritization.</p>
                </div>
                <button onClick={() => setSettings({...settings, isPerformanceMode: !settings.isPerformanceMode})} className={`w-10 h-6 rounded-full p-1 transition-all ${settings.isPerformanceMode ? 'bg-primary' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${settings.isPerformanceMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Low RAM Mode</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">Compress background nodes.</p>
                </div>
                <button onClick={() => setSettings({...settings, lowRamMode: !settings.lowRamMode})} className={`w-10 h-6 rounded-full p-1 transition-all ${settings.lowRamMode ? 'bg-blue-500' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${settings.lowRamMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Interface</h3>
            <div className="space-y-4">
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Dark Theme</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">OLED optimized interface.</p>
                </div>
                <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-10 h-6 rounded-full p-1 transition-all ${isDarkMode ? 'bg-primary' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Reduce Motion</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">Disable all animations.</p>
                </div>
                <button onClick={() => setSettings({...settings, reduceMotion: !settings.reduceMotion})} className={`w-10 h-6 rounded-full p-1 transition-all ${settings.reduceMotion ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${settings.reduceMotion ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Storage & Exports</h3>
          <div className="p-8 bg-slate-50 dark:bg-white/[0.02] rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-black dark:text-white uppercase tracking-widest text-xs">Global Output Directory</p>
              <span className="text-[8px] font-black text-primary uppercase tracking-widest">Neural Station Default</span>
            </div>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">folder_open</span>
              <input 
                type="text"
                value={settings.globalOutputPath}
                onChange={(e) => setSettings({...settings, globalOutputPath: e.target.value})}
                className="w-full bg-white dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-14 pr-6 py-4 text-sm dark:text-white transition-all outline-none"
                placeholder="Enter export path..."
              />
            </div>
            <p className="text-[9px] font-medium text-slate-500 ml-4">This path will be used for all MP4 generation and concatenation tasks.</p>
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Neural Feedback</h3>
          <div className="p-8 bg-slate-50 dark:bg-white/[0.02] rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-6">
            <div className="space-y-2">
              <p className="font-black dark:text-white uppercase tracking-widest text-xs">System Improvement Report</p>
              <p className="text-[9px] font-medium text-slate-500">Help us optimize the neural processing engines.</p>
            </div>
            <textarea 
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe your experience or report an anomaly..."
              className="w-full h-32 bg-white dark:bg-white/5 border-2 border-transparent focus:border-primary/20 rounded-2xl p-6 text-sm dark:text-white transition-all outline-none resize-none"
            />
            <button 
              onClick={handleFeedback}
              disabled={!feedback || isSubmitting}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'TRANSMITTING...' : 'SEND FEEDBACK'}
              {!isSubmitting && <span className="material-symbols-outlined text-sm">send</span>}
            </button>
          </div>
        </section>

        <div className="pt-8 border-t border-slate-100 dark:border-white/5">
          <button 
            onClick={() => alert("Memory Purge Completed: 1.4GB Released")}
            className="w-full py-4 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-primary hover:text-white transition-all border border-slate-100 dark:border-white/5"
          >
            Purge System Cache & RAM
          </button>
        </div>
      </div>
    </div>
  );
};

const ToolkitCard: React.FC<{ icon: string, title: string, desc: string, color: string, onClick: () => void, badge?: string, performanceMode?: boolean }> = ({ icon, title, desc, color, onClick, badge, performanceMode }) => (
  <button onClick={onClick} className={`p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left transition-all group relative overflow-hidden flex flex-col items-start gap-4 ${performanceMode ? '' : 'hover:border-primary/50 hover:-translate-y-1'}`}>
    <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center text-white shadow-lg ${performanceMode ? '' : 'group-hover:scale-110 transition-transform duration-300'}`}>
      <span className="material-symbols-outlined text-3xl">{icon}</span>
    </div>
    <div>
      <p className="text-xl font-black uppercase tracking-tighter dark:text-white transition-colors">{title}</p>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-relaxed">{desc}</p>
    </div>
    {badge && (
      <span className="absolute top-6 right-6 px-3 py-1 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest rounded-full border border-primary/10">
        {badge}
      </span>
    )}
  </button>
);

const NeuralWave: React.FC<{ color: string }> = ({ color }) => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <motion.div 
      animate={{ 
        scale: [1, 1.05, 1],
        opacity: [0.35, 0.45, 0.35]
      }}
      transition={{ 
        duration: 10, 
        repeat: Infinity, 
        ease: "linear" 
      }}
      className={`absolute inset-0 bg-gradient-to-br ${color}`}
    />
    <div className="absolute inset-0 opacity-30">
      <motion.svg 
        animate={{ 
          y: [0, -8, 0],
        }}
        transition={{ 
          duration: 5, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="absolute bottom-0 left-0 w-full h-32 text-white/20" 
        viewBox="0 0 1440 320" 
        preserveAspectRatio="none"
      >
        <path fill="currentColor" d="M0,160L48,176C96,192,192,224,288,224C384,224,480,192,576,165.3C672,139,768,117,864,128C960,139,1056,181,1152,197.3C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
      </motion.svg>
    </div>
    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2"></div>
    <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-[40px] translate-y-1/2 -translate-x-1/2"></div>
  </div>
);

const VideoModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onDownload: (type: string, format: string, url: string) => void; 
  settings: AppSettings; 
  type: 'youtube' | 'tiktok';
  usageStats: UsageStats;
}> = ({ isOpen, onClose, onDownload, settings, type, usageStats }) => {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('VIDEO');
  const [quality, setQuality] = useState('1080p');
  const brandColor = type === 'youtube' ? 'from-red-600 to-red-500' : 'from-slate-900 to-black';

  const audioQualities = ['128kbps', '256kbps', '320kbps', 'FLAC (Lossless)'];
  const videoQualities = ['720p', '1080p', '1440p', '4K (Ultra HD)'];

  const limit = 5;
  const currentUsage = type === 'youtube' ? usageStats.youtubeDownloads : usageStats.tiktokDownloads;
  const isOverLimit = !usageStats.isPremium && currentUsage >= limit;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" 
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white dark:bg-surface-dark w-full max-w-md rounded-[3.5rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/5 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            {/* Header Section */}
            <div className="relative h-48 flex flex-col justify-end p-10 overflow-hidden">
              <NeuralWave color={brandColor} />
              
              <div className="relative z-10 flex justify-between items-end">
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white shadow-2xl border border-white/20 mb-4">
                    <span className="material-symbols-outlined text-2xl">{type === 'youtube' ? 'play_arrow' : 'music_video'}</span>
                  </div>
                  <h3 className="text-3xl font-black uppercase tracking-tighter text-white leading-none">{type} Grabber</h3>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"></span>
                    <p className="text-[8px] font-black text-white/60 uppercase tracking-[0.4em]">Neural Extraction Engine V4.2</p>
                  </div>
                </div>
                
                <button 
                  onClick={onClose}
                  className="w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white/80 hover:text-white transition-all mb-1"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>
            
            <div className="p-10 space-y-8">
              {/* Usage Status */}
              <div className={`p-5 rounded-3xl border transition-all duration-500 ${isOverLimit ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOverLimit ? 'bg-amber-500/20 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                      <span className="material-symbols-outlined text-sm">{isOverLimit ? 'warning' : 'analytics'}</span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Daily Quota</p>
                      <p className={`text-sm font-black uppercase tracking-tight ${isOverLimit ? 'text-amber-500' : 'dark:text-white'}`}>
                        {usageStats.isPremium ? 'Unlimited' : `${currentUsage} / ${limit} Used`}
                      </p>
                    </div>
                  </div>
                  {!usageStats.isPremium && (
                    <div className="h-1.5 w-24 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((currentUsage / limit) * 100, 100)}%` }}
                        className={`h-full transition-all duration-1000 ${isOverLimit ? 'bg-amber-500' : 'bg-primary'}`} 
                      />
                    </div>
                  )}
                </div>
                {isOverLimit && (
                  <p className="text-[9px] font-medium text-amber-500/80 mt-3 leading-relaxed">
                    Neural nodes saturated. Upgrade to Professional for unlimited high-speed extractions.
                  </p>
                )}
              </div>

              {/* URL Input */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Source URL</label>
                  {url && <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-500"></span> Valid Link</span>}
                </div>
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-indigo-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000 group-focus-within:duration-200"></div>
                  <div className="relative flex items-center overflow-hidden rounded-2xl">
                    <span className="material-symbols-outlined absolute left-5 text-slate-400 group-focus-within:text-primary transition-colors text-lg z-10">link</span>
                    <input 
                      className="w-full bg-slate-50 dark:bg-white/[0.03] border-2 border-transparent focus:border-primary/30 rounded-2xl pl-14 pr-6 py-5 text-sm dark:text-white placeholder:text-slate-500 transition-all outline-none"
                      placeholder={`Paste ${type} link...`}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={isOverLimit}
                    />
                    {url && (
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '200%' }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/10 to-transparent pointer-events-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Format & Quality */}
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Extraction Format</label>
                  <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 dark:bg-white/5 rounded-[2rem]">
                    {['VIDEO', 'MP3'].map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setFormat(f);
                          setQuality(f === 'MP3' ? '320kbps' : '1080p');
                        }}
                        className={`relative py-4 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all duration-500 flex items-center justify-center gap-2 overflow-hidden ${format === f ? 'text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                        disabled={isOverLimit}
                      >
                        {format === f && (
                          <motion.div 
                            layoutId={`${type}Format`}
                            className="absolute inset-0 bg-primary shadow-lg shadow-primary/30"
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <span className="relative z-10 material-symbols-outlined text-base">{f === 'MP3' ? 'audiotrack' : 'movie'}</span>
                        <span className="relative z-10">{f}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Neural Resolution</label>
                  <CustomSelect 
                    value={quality}
                    options={(format === 'MP3' ? audioQualities : videoQualities).map(q => ({ value: q, label: q }))}
                    onChange={setQuality}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <button 
                  onClick={() => { onDownload(type, `${format} (${quality})`, url); onClose(); }}
                  className={`w-full py-6 rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs shadow-2xl transition-all duration-500 flex items-center justify-center gap-3 group ${
                    isOverLimit 
                    ? 'bg-slate-800 text-white shadow-slate-900/20 hover:bg-slate-900' 
                    : 'bg-primary text-white shadow-primary/30 hover:brightness-110 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:translate-y-0'
                  }`}
                  disabled={!url || isOverLimit}
                >
                  {isOverLimit ? 'UPGRADE TO PREMIUM' : 'INITIALIZE EXTRACTION'}
                  <span className={`material-symbols-outlined text-lg ${!isOverLimit && 'group-hover:rotate-12 transition-transform'}`}>
                    {isOverLimit ? 'workspace_premium' : 'bolt'}
                  </span>
                </button>
                <div className="flex items-center justify-center gap-4 mt-8">
                  <div className="h-px w-8 bg-slate-200 dark:bg-white/5"></div>
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.4em]">
                    Secure Cloud Protocol
                  </p>
                  <div className="h-px w-8 bg-slate-200 dark:bg-white/5"></div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const KeyAnalysisModal: React.FC<{ isOpen: boolean; onClose: () => void; onFinished: (data: {key: string, bpm: string}) => void, performanceMode?: boolean }> = ({ isOpen, onClose, onFinished, performanceMode }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{key: string, bpm: string} | null>(null);

  const startAnalysis = () => {
    setAnalyzing(true);
    setResult(null);
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        const data = {key: '8A', bpm: '126'};
        setResult(data);
        onFinished(data);
      }
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 p-10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black uppercase tracking-tighter dark:text-white">Neural Key Analysis</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Precision harmonic detection</p>
        </div>
        
        {!analyzing ? (
          <div onClick={startAnalysis} className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2.5rem] p-16 text-center hover:bg-primary/5 cursor-pointer transition-all group">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mx-auto mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-4xl">analytics</span>
            </div>
            <p className="text-sm font-black dark:text-white uppercase tracking-widest">Select Audio File to Scan</p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">Supports MP3, WAV, FLAC</p>
          </div>
        ) : result ? (
          <div className="py-8 space-y-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="flex justify-center gap-8">
              <div className="text-center space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Harmonic Key</p>
                <div className="w-32 h-32 bg-primary rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl shadow-primary/30">
                  <span className="text-5xl font-black tracking-tighter">{result.key}</span>
                </div>
              </div>
              <div className="text-center space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Tempo (BPM)</p>
                <div className="w-32 h-32 bg-slate-100 dark:bg-white/5 rounded-[2.5rem] border border-slate-200 dark:border-white/10 flex items-center justify-center dark:text-white">
                  <span className="text-4xl font-black tracking-tighter">{result.bpm}</span>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Confidence</p>
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">99.4%</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[99.4%]"></div>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              DONE
            </button>
          </div>
        ) : (
          <div className="py-12 text-center space-y-10">
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r="76" className="stroke-slate-100 dark:stroke-white/5 fill-none stroke-8" />
                <circle cx="80" cy="80" r="76" className="stroke-primary fill-none stroke-8 transition-all duration-300" style={{ strokeDasharray: 477, strokeDashoffset: 477 - (477 * progress) / 100 }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-primary">{progress}%</span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Scanning</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">Syncing Neural Nodes...</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Detecting harmonic transients</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StemSeparatorModal: React.FC<{ isOpen: boolean; onClose: () => void; onStart: (name: string, isPlaylist?: boolean, stems?: string[]) => void, performanceMode?: boolean }> = ({ isOpen, onClose, onStart, performanceMode }) => {
  const [file, setFile] = useState<string | null>(null);
  const [selectedStems, setSelectedStems] = useState<string[]>(['Drums', 'Vocals', 'Bass', 'Melody']);

  const toggleStem = (stem: string) => {
    setSelectedStems(prev => 
      prev.includes(stem) ? prev.filter(s => s !== stem) : [...prev, stem]
    );
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className={`absolute inset-0 bg-slate-950/80 ${performanceMode ? '' : 'backdrop-blur-xl'} animate-[fadeIn_0.3s_ease-out]`} onClick={onClose}></div>
      <div className={`relative bg-white dark:bg-surface-dark w-full max-w-xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 p-10 space-y-8 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar`}>
        <div className="text-center">
          <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white">AI Stem Separator</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Deconstruct audio into 4 channels</p>
        </div>
        
        <div onClick={() => setFile('track_master.wav')} className={`border-2 border-dashed rounded-[2.5rem] p-12 text-center cursor-pointer transition-all ${file ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-white/10 hover:border-primary/50'}`}>
          <span className="material-symbols-outlined text-5xl mb-4 text-primary">dynamic_feed</span>
          <p className="text-sm font-black dark:text-white uppercase tracking-widest">{file || 'Drop Master Audio File'}</p>
        </div>

        {file && (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-4">Select Stems to Extract</label>
            <div className="grid grid-cols-2 gap-4">
              {['Drums', 'Vocals', 'Bass', 'Melody'].map(stem => (
                <button 
                  key={stem}
                  onClick={() => toggleStem(stem)}
                  className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between font-black uppercase tracking-widest text-[10px] ${
                    selectedStems.includes(stem) 
                      ? 'border-primary bg-primary/10 text-primary shadow-lg shadow-primary/10' 
                      : 'border-slate-100 dark:border-white/5 text-slate-400 hover:border-slate-200 dark:hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-base">
                      {stem === 'Drums' ? '🥁' : stem === 'Vocals' ? 'mic' : stem === 'Bass' ? 'speaker' : 'piano'}
                    </span>
                    {stem}
                  </div>
                  {selectedStems.includes(stem) && <span className="material-symbols-outlined text-sm">check_circle</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <button 
          onClick={() => { if (file) { onStart(`Separating Stems: ${file}`, false, selectedStems); onClose(); } }}
          disabled={!file || selectedStems.length === 0}
          className="w-full py-6 bg-primary text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
        >
          GENERATE {selectedStems.length} STEMS
        </button>
      </div>
    </div>
  );
};

const CamelotWheel: React.FC<{ highlightedKey?: string, performanceMode?: boolean }> = ({ highlightedKey, performanceMode }) => {
  const innerRing = ["8A", "9A", "10A", "11A", "12A", "1A", "2A", "3A", "4A", "5A", "6A", "7A"];
  const outerRing = ["8B", "9B", "10B", "11B", "12B", "1B", "2B", "3B", "4B", "5B", "6B", "7B"];

  return (
    <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
      <svg viewBox="0 0 100 100" className={`w-full h-full transform -rotate-90 ${performanceMode ? '' : 'drop-shadow-2xl'}`}>
        {outerRing.map((key, i) => {
          const startAngle = (i * 30);
          const endAngle = ((i + 1) * 30);
          const x1 = 50 + 45 * Math.cos((startAngle * Math.PI) / 180);
          const y1 = 50 + 45 * Math.sin((startAngle * Math.PI) / 180);
          const x2 = 50 + 45 * Math.cos((endAngle * Math.PI) / 180);
          const y2 = 50 + 45 * Math.sin((endAngle * Math.PI) / 180);
          const isHighlighted = highlightedKey === key;
          
          return (
            <path
              key={key}
              d={`M 50 50 L ${x1} ${y1} A 45 45 0 0 1 ${x2} ${y2} Z`}
              className={`transition-all duration-700 ease-out ${isHighlighted ? 'fill-primary stroke-white/20 stroke-1' : 'fill-slate-200 dark:fill-white/5 stroke-white/5 dark:stroke-white/5 stroke-[0.5]'}`}
            />
          );
        })}
        {innerRing.map((key, i) => {
          const startAngle = (i * 30);
          const endAngle = ((i + 1) * 30);
          const x1 = 50 + 30 * Math.cos((startAngle * Math.PI) / 180);
          const y1 = 50 + 30 * Math.sin((startAngle * Math.PI) / 180);
          const x2 = 50 + 30 * Math.cos((endAngle * Math.PI) / 180);
          const y2 = 50 + 30 * Math.sin((endAngle * Math.PI) / 180);
          const isHighlighted = highlightedKey === key;

          return (
            <path
              key={key}
              d={`M 50 50 L ${x1} ${y1} A 30 30 0 0 1 ${x2} ${y2} Z`}
              className={`transition-all duration-700 ease-out ${isHighlighted ? 'fill-primary/80 stroke-white/20 stroke-1' : 'fill-slate-300 dark:fill-white/10 stroke-white/5 dark:stroke-white/5 stroke-[0.5]'}`}
            />
          );
        })}
        <circle cx="50" cy="50" r="15" className="fill-white dark:fill-surface-dark transition-colors duration-500" />
      </svg>
    </div>
  );
};

const MainContent: React.FC<MainContentProps> = React.memo(({ 
  activeTab, 
  onAddTask, 
  isDarkMode, 
  setIsDarkMode, 
  settings, 
  setSettings, 
  onViewJob, 
  jobs = [],
  usageStats,
  setUsageStats
}) => {
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [isTiktokModalOpen, setIsTiktokModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isStemModalOpen, setIsStemModalOpen] = useState(false);
  const [isMP4ModalOpen, setIsMP4ModalOpen] = useState(false);
  const [isConcatenatorOpen, setIsConcatenatorOpen] = useState(false);
  const [isJobDetailOpen, setIsJobDetailOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const handleDownload = (type: string, format: string, url: string) => {
    const isPlaylist = url.includes('list=') || url.includes('playlist');
    if (onAddTask) onAddTask(`Downloading: ${type.toUpperCase()} Asset (${format})`, isPlaylist);
    
    // Increment usage
    const key = type === 'youtube' ? 'youtubeDownloads' : 'tiktokDownloads';
    setUsageStats({
      ...usageStats,
      [key]: usageStats[key as keyof UsageStats] as number + 1
    });
  };

  if (activeTab === NavItem.Settings) return <SettingsView isDarkMode={!!isDarkMode} setIsDarkMode={setIsDarkMode || (() => {})} settings={settings} setSettings={setSettings} />;
  if (activeTab === NavItem.Profile) return <ProfileView />;
  if (activeTab === NavItem.Copyright) return <CopyrightView performanceMode={settings.isPerformanceMode} onAddTask={onAddTask} settings={settings} usageStats={usageStats} onUpgrade={() => setIsUpgradeModalOpen(true)} />;
  if (activeTab === NavItem.Music) return <KeyDetectView performanceMode={settings.isPerformanceMode} onAddTask={onAddTask} />;
  if (activeTab === NavItem.History) return <HistoryView jobs={jobs} onViewJob={onViewJob} />;

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-16 animate-[fadeIn_0.5s_ease-out] pb-32">
      <VideoModal type="youtube" isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} onDownload={handleDownload} settings={settings} usageStats={usageStats} />
      <VideoModal type="tiktok" isOpen={isTiktokModalOpen} onClose={() => setIsTiktokModalOpen(false)} onDownload={handleDownload} settings={settings} usageStats={usageStats} />
      <UpgradePlansModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} usageStats={usageStats} setUsageStats={setUsageStats} />
      <KeyAnalysisModal isOpen={isKeyModalOpen} onClose={() => setIsKeyModalOpen(false)} onFinished={(d) => onAddTask?.(`Analyzing: ${d.key} @ ${d.bpm} BPM`)} performanceMode={settings.isPerformanceMode} />
      <StemSeparatorModal isOpen={isStemModalOpen} onClose={() => setIsStemModalOpen(false)} onStart={(n) => onAddTask?.(n)} performanceMode={settings.isPerformanceMode} />
      <MP4GeneratorModal isOpen={isMP4ModalOpen} onClose={() => setIsMP4ModalOpen(false)} onStart={(n) => onAddTask?.(n)} performanceMode={settings.isPerformanceMode} settings={settings} />
      <MP4ConcatenatorModal isOpen={isConcatenatorOpen} onClose={() => setIsConcatenatorOpen(false)} onStart={(n) => onAddTask?.(n)} performanceMode={settings.isPerformanceMode} settings={settings} />

      {/* Hero Resource Dashboard */}
      <section className="bg-slate-900 p-8 lg:p-10 rounded-[3rem] flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-2xl border border-white/5">
         <div className="relative z-10 flex flex-col gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping"></div>
                <span className="text-[8px] font-black text-primary uppercase tracking-[0.5em]">Station Telemetry</span>
              </div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Neural Station</h2>
            </div>
            <div className="grid grid-cols-3 gap-6">
               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500 text-xs">bolt</span>
                    <span className="text-[7px] font-black text-white/40 uppercase tracking-widest">Power</span>
                  </div>
                  <span className="text-lg font-black text-white">OPTIMAL</span>
               </div>
               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400 text-xs">hub</span>
                    <span className="text-[7px] font-black text-white/40 uppercase tracking-widest">Nodes</span>
                  </div>
                  <span className="text-lg font-black text-blue-400">12/12</span>
               </div>
               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400 text-xs">database</span>
                    <span className="text-[7px] font-black text-white/40 uppercase tracking-widest">Storage</span>
                  </div>
                  <span className="text-lg font-black text-amber-400">HEALTHY</span>
               </div>
            </div>
            <button 
              onClick={() => setIsUpgradeModalOpen(true)}
              className="w-fit px-6 py-3 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:brightness-110 transition-all flex items-center gap-2"
            >
              UPGRADE NODE
              <span className="material-symbols-outlined text-sm">workspace_premium</span>
            </button>
         </div>
         <div className="relative z-10 flex-1 max-w-sm w-full group">
            <div className={`bg-white/5 border border-white/10 rounded-[2.5rem] p-8 ${settings.isPerformanceMode ? '' : 'backdrop-blur-md'} hover:border-primary/30 transition-all duration-500`}>
               <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                     <div className="w-6 h-6 bg-primary/20 rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-xs">graphic_eq</span>
                     </div>
                     <div>
                        <p className="text-[8px] font-black text-white uppercase tracking-widest">Neural Pulse</p>
                        <p className="text-[7px] font-bold text-white/40 uppercase tracking-widest">Stability: 99.8%</p>
                     </div>
                  </div>
                  <div className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                  </div>
               </div>
               <WaveformVisualizer performanceMode={settings.isPerformanceMode} />
            </div>
         </div>
         {!settings.isPerformanceMode && (
            <>
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
            </>
         )}
      </section>

      {/* Cloud Acquisition */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 px-2">
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
           <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Cloud Acquisition</h3>
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <ToolkitCard icon="play_arrow" title="YouTube" desc="Extract 4K Video or HQ Audio" color="bg-red-600" onClick={() => setIsYoutubeModalOpen(true)} performanceMode={settings.isPerformanceMode} />
          <ToolkitCard icon="music_video" title="TikTok" desc="Acquire Short-form Assets" color="bg-black" onClick={() => setIsTiktokModalOpen(true)} performanceMode={settings.isPerformanceMode} />
          <div className="p-8 bg-slate-50 dark:bg-surface-dark/30 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center gap-3 opacity-60">
            <span className="material-symbols-outlined text-3xl text-slate-400">add_circle</span>
            <div>
              <p className="text-sm font-black dark:text-white uppercase tracking-tight">More Coming Soon</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Expanding Neural Nodes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Lab */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 px-2">
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
           <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Engineering Lab</h3>
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <ToolkitCard icon="analytics" title="BPM & Key" desc="Neural Track Analysis" color="bg-indigo-600" onClick={() => setIsKeyModalOpen(true)} performanceMode={settings.isPerformanceMode} />
          <ToolkitCard icon="dynamic_feed" title="Stems" desc="Isolate Drums/Bass/Vocal" color="bg-emerald-600" onClick={() => setIsStemModalOpen(true)} badge="AI Beta" performanceMode={settings.isPerformanceMode} />
          <ToolkitCard icon="record_voice_over" title="Vocal Fix" desc="Remove Instrumental Leak" color="bg-purple-600" onClick={() => onAddTask?.('Vocal Fix Engine Initializing...')} performanceMode={settings.isPerformanceMode} />
        </div>
      </section>

      {/* Copyright Engineering (Quick Access) */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 px-2">
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
           <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Copyright Engineering</h3>
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ToolkitCard icon="movie" title="MP4 Generator" desc="Batch MP3 to Copyright Video" color="bg-primary" onClick={() => setIsMP4ModalOpen(true)} performanceMode={settings.isPerformanceMode} badge="Premium" />
          <ToolkitCard icon="merge" title="MP4 Concatenator" desc="Merge MP4s for Long Tests" color="bg-indigo-500" onClick={() => setIsConcatenatorOpen(true)} performanceMode={settings.isPerformanceMode} badge="Premium" />
        </div>
      </section>

      {/* System Utilities */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 px-2">
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
           <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">System Utilities</h3>
           <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-8 bg-slate-50 dark:bg-surface-dark/30 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center gap-3 opacity-60">
            <span className="material-symbols-outlined text-3xl text-slate-400">add_circle</span>
            <div>
              <p className="text-sm font-black dark:text-white uppercase tracking-tight">More Coming Soon</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Expanding Neural Nodes</p>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes modalScaleUp { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .perf-mode .animate-pulse { animation: none !important; }
        .reduce-motion * { transition: none !important; animation: none !important; }
      `}</style>
    </div>
  );
});

export default MainContent;
