
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavItem, AppSettings, CurrentTask, ActivityJob, UsageStats, AnalysisResultData } from '../types';
import CloudAcquisitionSection from './ui_reference_blocks/CloudAcquisitionSection';
import EngineeringLabSection from './ui_reference_blocks/EngineeringLabSection';
import CopyrightEngineeringSection from './ui_reference_blocks/CopyrightEngineeringSection';
import { ENABLE_SERVER_BILLING, apiCreateCheckoutSession } from '../lib/apiClient';
import SpotifyArtView from './SpotifyArtView';

declare global {
  interface Window {
    pyBridge?: {
      bridgeCommand?: (commandJson: string) => string;
      pickFolder?: (key: string, currentPath: string, cb?: (result: string) => void) => string | void;
      pickFiles?: (mode: string) => string | void;
      runToolkitOption?: (option: string, payloadJson: string) => void;
      stopToolkit?: () => void;
    };
  }
}

interface MainContentProps {
  activeTab: NavItem;
  onTabChange?: (tab: NavItem) => void;
  isLoading?: boolean;
  onAddTask?: (name: string) => void;
  onRunToolkit?: (option: string, payload: Record<string, unknown>, taskName: string) => boolean;
  isDarkMode?: boolean;
  setIsDarkMode?: (val: boolean) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  autoPerfDetected?: boolean;
  copyrightState?: {
    scan: { running: boolean; progress: number; label: string; hashing: string };
    counts: {
      filesInToTest: number;
      alreadyTested: number;
      newFiles: number;
      totalTracks: number;
      totalTested: number;
      cleared: number;
      flagged: number;
      complianceScore: number;
    };
    rows: Array<{ name: string; status: string; action: string }>;
  };
  onScanCopyright?: () => void;
  currentTask?: CurrentTask | null;
  jobs?: ActivityJob[];
  usageStats?: UsageStats;
  onOpenJobFolder?: (job: ActivityJob) => void;
  previewJob?: ActivityJob | null;
  onPreviewHandled?: () => void;
}

// Decorative Waveform Component for "Studio" vibe
const WaveformVisualizer: React.FC<{ performanceMode: boolean }> = ({ performanceMode }) => {
  const bars = performanceMode ? 10 : 24;
  return (
    <div className="flex items-end justify-between gap-1 h-12 px-4 w-full opacity-30 group-hover:opacity-60 transition-opacity">
      {[...Array(bars)].map((_, i) => (
        <div 
          key={i} 
          className="bg-primary w-1 rounded-full transition-opacity duration-300"
          style={{ 
            height: `${30 + ((i * 37) % 65)}%`,
            opacity: performanceMode ? 0.45 : 0.65
          }} 
        />
      ))}
    </div>
  );
};

// Custom Pretty Dropdown Component
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-[150] overflow-hidden animate-[dropdownFadeIn_0.2s_ease-out]">
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

const ConverterModal: React.FC<{ isOpen: boolean; onClose: () => void; onConvert: (bitrate: string) => void }> = ({ isOpen, onClose, onConvert }) => {
  const [bitrate, setBitrate] = useState('320kbps');

  if (!isOpen) return null;

  const bitrateOptions = [
    { value: '128kbps', label: '128kbps (Standard)' },
    { value: '192kbps', label: '192kbps (High)' },
    { value: '256kbps', label: '256kbps (Premium)' },
    { value: '320kbps', label: '320kbps (Lossless Sim)' },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-[modalBackdropFade_0.3s_ease-out]" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-[modalScaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <span className="material-symbols-outlined text-2xl font-bold">swap_horiz</span>
            </div>
            <div>
              <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">MP4 to MP3</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audio Extraction Node</p>
            </div>
          </div>

          <div className="space-y-6 overflow-visible">
            <div 
              className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer group"
            >
              <span className="material-symbols-outlined text-3xl text-slate-300 group-hover:text-indigo-500 transition-colors mb-2 block">movie</span>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select MP4 File</p>
            </div>

            <div className="space-y-2 overflow-visible">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Output Bitrate</label>
              <CustomSelect 
                value={bitrate} 
                options={bitrateOptions} 
                onChange={setBitrate}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={onClose} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 dark:hover:text-white">Cancel</button>
              <button 
                onClick={() => { onConvert(bitrate); onClose(); }} 
                className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all active:scale-95"
              >
                Transcode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MP4GeneratorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onStart: (payload: { files: string[]; offset: string; outputPath: string }) => boolean;
  onPickFiles: () => Promise<string[]>;
  files: string[];
  setFiles: (files: string[]) => void;
  onPickOutputFolder: (currentPath: string) => Promise<string>;
  performanceMode?: boolean;
  settings: AppSettings;
}> = ({ isOpen, onClose, onStart, onPickFiles, files, setFiles, onPickOutputFolder, performanceMode, settings }) => {
  const [offset, setOffset] = useState('30s');
  const [outputPath, setOutputPath] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const isPickingFilesRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setOutputPath(String(settings.mp4OutputPath || '').trim());
  }, [isOpen, settings.mp4OutputPath]);

  const handleFileSelect = async () => {
    if (isPickingFilesRef.current) return;
    isPickingFilesRef.current = true;
    const picked = await onPickFiles();
    const normalized = Array.isArray(picked)
      ? picked.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (normalized.length > 0) {
      setFiles(normalized);
      if (!String(outputPath || '').trim() && normalized[0]) {
        const first = String(normalized[0]);
        const slash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
        if (slash > 0) {
          const inferred = first.slice(0, slash).trim();
          if (inferred) setOutputPath(inferred);
        }
      }
    }
    window.setTimeout(() => {
      isPickingFilesRef.current = false;
    }, 300);
  };

  const handlePickOutput = async () => {
    const picked = await onPickOutputFolder(outputPath || settings.mp4OutputPath || '');
    const clean = String(picked || '').trim();
    if (clean) setOutputPath(clean);
  };

  const startGeneration = () => {
    const started = onStart({ files, offset, outputPath: outputPath || settings.mp4OutputPath || '' });
    if (started) {
      setIsGenerating(false);
      setProgress(0);
      onClose();
      setFiles([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-[modalScaleUp_0.3s_ease-out]">
        <div className="px-10 pt-10 pb-6 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl">
              <span className="material-symbols-outlined text-3xl">movie</span>
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white">MP4 Copyright Generator</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Batch convert MP3s to MP4 with blank visual</p>
              <p className="text-[9px] font-bold text-primary/80 mt-1">BUILD MARKER: MP4GEN-STATE-V2</p>
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
                  {files.length > 0 ? `${files.length} Tracks Selected` : 'Select MP3/AAC/WAV Files'}
                </p>
              </div>
              {files.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] max-h-32 overflow-y-auto custom-scrollbar">
                  {files.slice(0, 8).map((f) => (
                    <div key={f} className="px-4 py-2 border-b last:border-b-0 border-slate-100 dark:border-white/5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {f.split(/[\\/]/).pop() || f}
                    </div>
                  ))}
                  {files.length > 8 && (
                    <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      +{files.length - 8} more files
                    </div>
                  )}
                </div>
              )}

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
                  <button
                    type="button"
                    onClick={handlePickOutput}
                    className="w-full text-left px-5 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center gap-3 hover:border-primary/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-primary text-sm">folder</span>
                    <span className="text-[9px] font-black text-slate-500 truncate uppercase tracking-widest">{outputPath || settings.mp4OutputPath || 'Click to select MP4 output folder'}</span>
                  </button>
                </div>
              </div>

              <button
                onClick={startGeneration}
                disabled={files.length === 0 || !(outputPath || settings.mp4OutputPath)}
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

const MP4ConcatenatorModal: React.FC<{ isOpen: boolean; onClose: () => void; onStart: (payload: { files: string[]; segmentDuration: string }) => boolean; onPickFiles: () => Promise<string[]>; performanceMode?: boolean; settings: AppSettings }> = ({ isOpen, onClose, onStart, onPickFiles, performanceMode, settings }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [segmentDuration, setSegmentDuration] = useState('30s');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const isPickingFilesRef = useRef(false);

  const handleFileSelect = async () => {
    if (isPickingFilesRef.current) return;
    isPickingFilesRef.current = true;
    const picked = await onPickFiles();
    if (Array.isArray(picked) && picked.length > 0) {
      setFiles(picked);
    }
    window.setTimeout(() => {
      isPickingFilesRef.current = false;
    }, 300);
  };

  const startConcatenation = () => {
    const started = onStart({ files, segmentDuration });
    if (started) {
      setIsProcessing(false);
      setProgress(0);
      onClose();
      setFiles([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-[modalScaleUp_0.3s_ease-out]">
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
                  {files.length > 0 ? `${files.length} Videos Selected` : 'Select MP4/MOV/MKV Files'}
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
                    <span className="text-[9px] font-black text-slate-500 truncate uppercase tracking-widest">{settings.mp4OutputPath || 'Use Settings to select MP4 output folder'}</span>
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

const CopyrightView: React.FC<{
  copyrightState: NonNullable<MainContentProps['copyrightState']>;
  onScanCopyright?: () => void;
  onOpenMP4Generator?: () => void;
  onOpenMP4Concatenator?: () => void;
  usageStats: UsageStats;
}> = ({ copyrightState, onScanCopyright, onOpenMP4Generator, onOpenMP4Concatenator, usageStats }) => {
  const rows = copyrightState.rows || [];
  const counts = copyrightState.counts;
  const scan = copyrightState.scan;

  return (
    <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-[1400px] mx-auto space-y-10 pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-10">
        {/* Left Column */}
        <div className="space-y-10">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight dark:text-white uppercase tracking-tighter">Copyright Scanner</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Check your library for metadata accuracy and legal compliance.
            </p>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
              Free limit: {usageStats.copyrightScanSongLimit} songs per scan
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onClick={onScanCopyright}
            className="relative group border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[3rem] bg-slate-50 dark:bg-white/[0.02] p-16 flex flex-col items-center justify-center text-center transition-all hover:border-primary/50 hover:bg-primary/[0.02] cursor-pointer"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary shadow-2xl shadow-primary/20 mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-4xl">upload_file</span>
            </div>
            <h3 className="text-2xl font-black dark:text-white uppercase tracking-tight mb-3">Drop files to scan</h3>
            <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 leading-relaxed mb-8 uppercase tracking-widest max-w-xl">
              Drag and drop your audio files here or click to browse. <br />
              {scan.running ? `${scan.label || 'Scanning...'} ${scan.hashing || ''}`.trim() : 'Supports MP3, WAV, and FLAC formats.'}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onScanCopyright?.(); }}
              className="px-10 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              {scan.running ? `Scanning ${scan.progress}%` : 'Scan Now'}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl dark:shadow-none">
            <div className="px-10 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] dark:text-white">Scanned Tracks</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing last {rows.length || 0} scans</span>
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
                {rows.map((track, i) => (
                  <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-10 py-6 text-sm font-black dark:text-white uppercase tracking-tight">{track.name}</td>
                    <td className="px-10 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto w-fit ${
                        track.status === 'Cleared'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : track.status === 'Flagged'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-blue-500/10 text-blue-500'
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
                {rows.length === 0 && (
                  <tr>
                    <td className="px-10 py-8 text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest" colSpan={3}>
                      No scan data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Prominent Tools Section (visual only) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-primary p-10 rounded-[3rem] text-white shadow-2xl shadow-primary/30 relative overflow-hidden group">
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">movie</span>
                </div>
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-white">Premium</span>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">MP4 Batch Generator</h3>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] mt-1">Convert MP3s to Copyright-Ready Video</p>
                </div>
                <button
                  onClick={onOpenMP4Generator}
                  className="px-8 py-3 bg-white text-primary rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  LAUNCH GENERATOR
                </button>
              </div>
              <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[12rem] opacity-10">video_settings</span>
            </div>

            <div className="bg-indigo-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden group">
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">merge</span>
                </div>
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-white">Premium</span>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">MP4 Concatenator</h3>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.3em] mt-1">Merge Multiple MP4s into One Long Test</p>
                </div>
                <button
                  onClick={onOpenMP4Concatenator}
                  className="px-8 py-3 bg-white text-indigo-600 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  LAUNCH MERGER
                </button>
              </div>
              <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[12rem] opacity-10">movie_edit</span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
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
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Tracks</p>
                  <p className="text-2xl font-black dark:text-white">{counts.totalTracks}</p>
                </div>
                <span className="material-symbols-outlined text-slate-400">list</span>
              </div>
              <div className="p-5 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Cleared</p>
                  <p className="text-2xl font-black dark:text-white">{counts.cleared}</p>
                </div>
                <span className="material-symbols-outlined text-emerald-500">check_circle</span>
              </div>
              <div className="p-5 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Flagged</p>
                  <p className="text-2xl font-black dark:text-white">{counts.flagged}</p>
                </div>
                <span className="material-symbols-outlined text-red-500">cancel</span>
              </div>
            </div>

              <div className="pt-4 space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Compliance Score</span>
                <span className="text-sm font-black dark:text-white">{counts.complianceScore}%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, counts.complianceScore))}%` }}></div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
            <div className="relative z-10 space-y-4">
              <h3 className="text-lg font-black dark:text-white uppercase tracking-tight leading-tight">Bulk Fix Available</h3>
              <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                You have {counts.flagged} tracks flagged for metadata issues. Click below to auto-correct all basic copyright tags.
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

const KeyDetectView: React.FC<{ performanceMode?: boolean; onAddTask?: (name: string) => void }> = ({ performanceMode, onAddTask }) => {
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

const HistoryView: React.FC<{ jobs: ActivityJob[]; onOpenJobFolder?: (job: ActivityJob) => void; onPreviewJob?: (job: ActivityJob) => void }> = ({ jobs, onOpenJobFolder, onPreviewJob }) => {
  const historyItems = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    type: job.type,
    date: job.timestamp,
    size: '-',
    status: job.status,
    outputPath: job.outputPath,
    outputFileName: job.outputFileName,
    optionId: job.optionId,
    analysisResult: job.analysisResult,
  }));
  const completedCount = historyItems.filter((i) => i.status === 'completed').length;
  const failedCount = historyItems.filter((i) => i.status === 'failed').length;
  const totalCount = historyItems.length;
  const successPct = totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}%` : '0%';

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
            { label: 'Operations', value: String(totalCount), icon: 'sync_alt', color: 'text-primary' },
            { label: 'Completed', value: String(completedCount), icon: 'check_circle', color: 'text-blue-500' },
            { label: 'Efficiency', value: successPct, icon: 'bolt', color: 'text-emerald-500' },
            { label: 'Failed', value: String(failedCount), icon: 'error', color: 'text-amber-500' },
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
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Timestamp</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Size</th>
                <th className="px-10 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {historyItems.map((item) => (
                <tr key={item.id} onClick={() => item.status === 'completed' && item.type === 'Analyzed' ? onPreviewJob?.(item as ActivityJob) : undefined} className={`group transition-colors ${item.status === 'completed' && item.type === 'Analyzed' ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}>
                  <td className="px-10 py-7 flex items-center gap-5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${item.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-primary'}`}>
                      <span className="material-symbols-outlined text-sm">{item.status === 'failed' ? 'error' : 'description'}</span>
                    </div>
                    <span className="text-base font-black dark:text-white uppercase tracking-tight">{item.name}</span>
                  </td>
                  <td className="px-10 py-7">
                    <span className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-10 py-7 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{item.date}</td>
                  <td className="px-10 py-7 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">{item.size}</td>
                  <td className="px-10 py-7 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenJobFolder?.(item as ActivityJob); }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition-all hover:bg-emerald-500/10 hover:text-emerald-500 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Open file location"
                        disabled={item.status !== 'completed'}
                      >
                        <span className="material-symbols-outlined text-sm">folder_open</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPreviewJob?.(item as ActivityJob); }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition-all hover:bg-primary/10 hover:text-primary dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Preview result"
                        disabled={item.status !== 'completed'}
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {historyItems.length === 0 && (
                <tr>
                  <td className="px-10 py-8 text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest" colSpan={5}>
                    No extraction logs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CAMELOT_FROM_MUSICAL_KEY: Record<string, string> = {
  'C MAJOR': '8B',
  'G MAJOR': '9B',
  'D MAJOR': '10B',
  'A MAJOR': '11B',
  'E MAJOR': '12B',
  'B MAJOR': '1B',
  'F# MAJOR': '2B',
  'C# MAJOR': '3B',
  'G# MAJOR': '4B',
  'D# MAJOR': '5B',
  'A# MAJOR': '6B',
  'F MAJOR': '7B',
  'A MINOR': '8A',
  'E MINOR': '9A',
  'B MINOR': '10A',
  'F# MINOR': '11A',
  'C# MINOR': '12A',
  'G# MINOR': '1A',
  'D# MINOR': '2A',
  'A# MINOR': '3A',
  'F MINOR': '4A',
  'C MINOR': '5A',
  'G MINOR': '6A',
  'D MINOR': '7A',
};

const resolveCamelotKey = (value?: string, musicalKey?: string) => {
  const explicit = String(value || '').trim().toUpperCase();
  if (/^([1-9]|1[0-2])[AB]$/.test(explicit)) return explicit;
  const normalizedMusical = String(musicalKey || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return CAMELOT_FROM_MUSICAL_KEY[normalizedMusical] || '';
};

const buildAnalysisResult = (input?: Partial<AnalysisResultData> & { key?: string; camelotKey?: string; musicalKey?: string; filename?: string; bpm?: string }): AnalysisResultData => {
  const musicalKey = String(input?.musicalKey || '').trim();
  const camelotKey = resolveCamelotKey(String(input?.camelotKey || input?.key || ''), musicalKey);
  return {
    filename: String(input?.filename || '').trim(),
    musicalKey,
    camelotKey,
    bpm: String(input?.bpm || '--').trim() || '--',
  };
};

const CamelotWheel: React.FC<{ highlightedKey?: string; performanceMode?: boolean }> = ({ highlightedKey, performanceMode }) => {
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
      {outerRing.map((key, i) => {
        const angle = ((i * 30) + 15 - 90) * (Math.PI / 180);
        const x = 50 + 41 * Math.cos(angle);
        const y = 50 + 41 * Math.sin(angle);
        const isHighlighted = highlightedKey === key;
        return (
          <span
            key={`outer-${key}`}
            className={`absolute text-[9px] font-black tracking-tight ${isHighlighted ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {key}
          </span>
        );
      })}
      {innerRing.map((key, i) => {
        const angle = ((i * 30) + 15 - 90) * (Math.PI / 180);
        const x = 50 + 24 * Math.cos(angle);
        const y = 50 + 24 * Math.sin(angle);
        const isHighlighted = highlightedKey === key;
        return (
          <span
            key={`inner-${key}`}
            className={`absolute text-[8px] font-black tracking-tight ${isHighlighted ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {key}
          </span>
        );
      })}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">{highlightedKey || 'Camelot'}</span>
      </div>
    </div>
  );
};

const KeyAnalysisModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onFinished: (data: {key: string, bpm: string}) => void;
  onPickFiles: () => Promise<string[]>;
  onStart: (files: string[]) => boolean;
  currentTask?: CurrentTask | null;
  initialResult?: AnalysisResultData | null;
}> = ({ isOpen, onClose, onFinished, onPickFiles, onStart, currentTask, initialResult = null }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [result, setResult] = useState<AnalysisResultData | null>(null);
  const [error, setError] = useState<string>('');
  const analysisStageLabel =
    progress >= 100
      ? 'Analysis complete'
      : progress >= 88
        ? 'Finalizing analysis report'
        : progress >= 72
          ? 'Mapping Camelot harmonic key'
          : progress >= 54
            ? 'Scoring key profile matches'
            : progress >= 34
              ? 'Extracting tonal fingerprint'
              : progress >= 12
                ? 'Loading and decoding audio'
                : 'Preparing analysis session';

  const callBridge = useCallback(async (command: string, payload: Record<string, unknown>) => {
    const bridge = window.pyBridge;
    if (!bridge?.bridgeCommand) return {} as Record<string, any>;
    try {
      const rawResolved = await Promise.resolve(bridge.bridgeCommand(JSON.stringify({
        version: '1.0',
        requestId: `${Date.now()}`,
        command,
        payload,
      })) as unknown);
      const rawText = typeof rawResolved === 'string' ? rawResolved : JSON.stringify(rawResolved ?? {});
      return rawText ? JSON.parse(rawText) as Record<string, any> : {};
    } catch {
      return {} as Record<string, any>;
    }
  }, []);

  const parseAnalysisReport = useCallback((textValue: string) => {
    const lines = String(textValue || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.includes('	')) continue;
      const parts = line.split('	').map((part) => part.trim());
      if (parts.length >= 4) {
        return {
          filename: parts[0],
          musicalKey: parts[1],
          key: parts[2] || parts[1],
          bpm: parts[3] || '--',
        };
      }
      if (parts.length >= 3) {
        return {
          filename: parts[0],
          musicalKey: parts[1],
          key: parts[2] || parts[1],
          bpm: '--',
        };
      }
    }
    return null;
  }, []);

  const loadBackendResult = useCallback(async () => {
    const stateParsed = await callBridge('system.get_state', {});
    const data = (stateParsed?.data?.data || stateParsed?.data || {}) as Record<string, any>;
    const job = (data.job || {}) as Record<string, any>;
    const output = (data.output || {}) as Record<string, any>;
    const option = String(job.option || '').trim();
    if (option !== '15') {
      return null;
    }

    const structured = (output.analysisResult || {}) as Record<string, any>;
    const structuredKey = String(structured.key || '').trim();
    if (structuredKey) {
      return buildAnalysisResult({
        filename: String(structured.filename || '').trim() || (selectedFile ? selectedFile.split(/[\/]/).pop() || selectedFile : 'analyzed_track'),
        musicalKey: String(structured.musicalKey || '').trim() || structuredKey,
        key: structuredKey,
        bpm: String(structured.bpm || '--').trim() || '--',
      });
    }

    const reportPath = String(output.filePath || '').trim();
    if (!reportPath) {
      return null;
    }
    const textParsed = await callBridge('system.read_text_file', { path: reportPath });
    const reportText = String(textParsed?.data?.text || textParsed?.data?.data?.text || '').trim();
    if (!reportText) {
      return null;
    }
    const parsed = parseAnalysisReport(reportText);
    return parsed ? buildAnalysisResult(parsed) : null;
  }, [callBridge, parseAnalysisReport, selectedFile]);
  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      setAnalyzing(false);
      setProgress(0);
      setSelectedFile('');
      setError('');
      return;
    }
    if (initialResult) {
      setResult(buildAnalysisResult(initialResult));
      setAnalyzing(false);
      setProgress(100);
      setSelectedFile(String(initialResult.filename || '').trim());
      setError('');
    }
  }, [initialResult, isOpen]);

  const pickAnalysisFile = useCallback(async () => {
    const picked = await onPickFiles();
    const next = Array.isArray(picked) ? picked.filter(Boolean).slice(0, 1) : [];
    if (next.length > 0) {
      setSelectedFile(next[0]);
      setError('');
      setResult(null);
      setProgress(0);
    }
  }, [onPickFiles]);

  const startAnalysis = useCallback(() => {
    if (analyzing) return;
    if (!selectedFile) {
      setError('Select an audio file first.');
      return;
    }
    const started = onStart([selectedFile]);
    if (!started) {
      setError('Could not start BPM & Key analysis.');
      return;
    }
    setAnalyzing(true);
    setProgress(0);
    setResult(null);
    setError('');
  }, [analyzing, onStart, selectedFile]);

  useEffect(() => {
    if (!isOpen || !analyzing || !currentTask) return;
    const nextProgress = Math.max(1, Math.min(100, Number(currentTask.progress || 0)));
    setProgress(nextProgress);
    if (currentTask.status === 'failed') {
      setAnalyzing(false);
      setError(String(currentTask.name || 'Analysis failed.').trim());
      return;
    }
    if (currentTask.status !== 'completed' && nextProgress < 100) return;
    let cancelled = false;
    void (async () => {
      const parsed = await loadBackendResult();
      if (cancelled) return;
      if (parsed) {
        const resolved = buildAnalysisResult(parsed);
        setResult(resolved);
        onFinished({ key: resolved.camelotKey, bpm: resolved.bpm });
      } else {
        setError('Analysis finished, but the result report could not be read.');
      }
      setAnalyzing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [analyzing, currentTask, isOpen, loadBackendResult, onFinished, selectedFile]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !analyzing && !result) {
        e.preventDefault();
        startAnalysis();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [isOpen, analyzing, result, onClose, startAnalysis]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-[modalBackdropFade_0.3s_ease-out]" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-[modalScaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="p-8">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <span className="material-symbols-outlined font-black">analytics</span>
              </div>
              <h2 className="text-xl font-black tracking-tight dark:text-white">Track Analysis Suite</h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-lg">ESC to cancel</span>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          {!analyzing && !result ? (
            <div className="space-y-6">
              <div
                onClick={pickAnalysisFile}
                className="group border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2rem] p-12 text-center hover:border-primary hover:bg-primary/5 transition-all duration-300 cursor-pointer active:scale-95"
              >
                <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-500">
                  <span className="material-symbols-outlined text-4xl">audio_file</span>
                </div>
                <h3 className="text-lg font-bold mb-2">Upload audio for BPM &amp; Key</h3>
                <p className="text-sm text-slate-500">Supports MP3, WAV, FLAC, AIFF, M4A, AAC</p>
                {selectedFile ? (
                  <p className="mt-4 text-xs font-semibold text-primary break-all">{selectedFile.split(/[\/]/).pop()}</p>
                ) : null}
              </div>
              {error ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</div>
              ) : null}
              <button onClick={startAnalysis} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50" disabled={!selectedFile}>
                Start Analysis
              </button>
            </div>
          ) : analyzing ? (
            <div className="text-center py-10 space-y-8 transition-opacity duration-300">
              <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="60" className="stroke-slate-100 dark:stroke-white/5 fill-none stroke-8" />
                  <circle cx="64" cy="64" r="60" className="stroke-primary fill-none stroke-8 transition-all duration-300 ease-out" style={{ strokeDasharray: 377, strokeDashoffset: 377 - (377 * progress) / 100 }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-primary">{Math.round(progress)}%</span>
                </div>
              </div>
              <div className="transition-opacity duration-300">
                <h3 className="text-lg font-black uppercase tracking-widest text-primary">Analyzing BPM &amp; Key</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">{selectedFile ? selectedFile.split(/[\/]/).pop() : 'Processing track'}</p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-3">{analysisStageLabel}</p>
              </div>
            </div>
          ) : result ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center animate-[modalScaleUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 dark:bg-white/[0.03] rounded-3xl border border-slate-100 dark:border-white/5 group hover:border-primary/30 transition-all">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Detected Musical Key</p>
                  <p className="text-5xl font-black text-primary tracking-tighter leading-none group-hover:scale-110 transition-transform origin-left">{result.musicalKey || 'Unknown'}</p>
                  <p className="text-[10px] font-black mt-3 text-slate-400 uppercase tracking-widest">Camelot {result.camelotKey || 'Unavailable'}</p>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-white/[0.03] rounded-3xl border border-slate-100 dark:border-white/5 group hover:border-primary/30 transition-all">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Detected BPM</p>
                  <p className="text-4xl font-black tracking-tight group-hover:scale-110 transition-transform origin-left">{result.bpm}</p>
                  <p className="text-[10px] font-black mt-3 text-slate-400 uppercase tracking-widest">{result.filename}</p>
                </div>
                <button onClick={onClose} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-95">Close</button>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Harmonic Alignment</p>
                <div className="scale-110">
                  <CamelotWheel highlightedKey={result.camelotKey} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const AudioTaskModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onStart: (files: string[]) => boolean;
  onPickFiles: () => Promise<string[]>;
  performanceMode?: boolean;
  title: string;
  subtitle: string;
  actionLabel: string;
  emptyLabel: string;
}> = ({ isOpen, onClose, onStart, onPickFiles, performanceMode, title, subtitle, actionLabel, emptyLabel }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setIsBusy(false);
    }
  }, [isOpen]);

  const handlePick = useCallback(async () => {
    const picked = await onPickFiles();
    if (Array.isArray(picked) && picked.length > 0) {
      setFiles(picked.filter(Boolean));
    }
  }, [onPickFiles]);

  const handleStart = useCallback(() => {
    if (!files.length || isBusy) return;
    const started = onStart(files);
    if (!started) return;
    setIsBusy(true);
    onClose();
  }, [files, isBusy, onClose, onStart]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 animate-[fadeIn_0.3s_ease-out]" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-surface-dark w-full max-w-xl rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/10 p-10 space-y-8 overflow-hidden">
        <div className="text-center">
          <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white">{title}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">{subtitle}</p>
        </div>
        <div onClick={handlePick} className={`border-2 border-dashed rounded-[2.5rem] p-10 text-center cursor-pointer transition-all ${performanceMode ? 'duration-150' : 'duration-300'} border-slate-200 dark:border-white/10 hover:border-primary hover:bg-primary/5`}>
          <span className="material-symbols-outlined text-5xl mb-4 text-primary">library_music</span>
          <p className="text-sm font-black dark:text-white uppercase tracking-widest">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : emptyLabel}</p>
          {files.length ? (
            <div className="mt-5 rounded-[1.75rem] border border-slate-200 dark:border-white/10 overflow-hidden text-left bg-slate-50/70 dark:bg-white/[0.03]">
              {files.slice(0, 4).map((file) => (
                <div key={file} className="px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-white/5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate" title={file}>
                  {file.split(/[\/]/).pop() || file}
                </div>
              ))}
              {files.length > 4 ? (
                <div className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  +{files.length - 4} more file{files.length - 4 === 1 ? '' : 's'}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          onClick={handleStart}
          disabled={!files.length || isBusy}
          className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

type PlaylistInfo = {
  isPlaylist: boolean;
  totalItems?: number;
  currentIndex?: number;
  currentTitle?: string;
};

const VideoModal: React.FC<{ isOpen: boolean; onClose: () => void; onDownload: (type: string, format: string, url: string, opts?: { cookiesPath?: string; selectedQuality?: string; isPlaylist?: boolean; playlistInfo?: PlaylistInfo }) => void; settings: AppSettings; type: 'youtube' | 'tiktok'; currentTask?: CurrentTask | null; usageStats?: UsageStats }> = ({ isOpen, onClose, onDownload, settings, type, currentTask, usageStats }) => {
  const [url, setUrl] = useState('');
  const [customExt, setCustomExt] = useState('mp4'); 
  const [videoQuality, setVideoQuality] = useState(settings.defaultVideoQuality);
  const [useCookies, setUseCookies] = useState(false);
  const [cookiesPath, setCookiesPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo>({ isPlaylist: false });

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setCustomExt('mp4'); 
      setVideoQuality(settings.defaultVideoQuality);
      setUseCookies(false);
      setCookiesPath('');
      setError(null);
      setIsProcessing(false);
      setPlaylistInfo({ isPlaylist: false });
    }
  }, [isOpen, settings.defaultVideoQuality]);

  const detectPlaylistMode = useCallback((input: string): boolean => {
    const normalized = String(input || '').toLowerCase();
    return normalized.includes('list=') || normalized.includes('/playlist') || normalized.includes('&list=');
  }, []);

  useEffect(() => {
    if (type !== 'youtube') {
      setPlaylistInfo({ isPlaylist: false });
      return;
    }
    const playlist = detectPlaylistMode(url);
    if (!playlist) {
      setPlaylistInfo({ isPlaylist: false });
      return;
    }
    let currentIndex: number | undefined;
    try {
      const parsed = new URL(url.trim());
      const idxRaw = parsed.searchParams.get('index') || parsed.searchParams.get('start');
      const idx = Number(idxRaw || '');
      if (Number.isFinite(idx) && idx > 0) currentIndex = idx;
    } catch {
      // keep lightweight detection only
    }
    setPlaylistInfo({
      isPlaylist: true,
      currentIndex,
      currentTitle: currentIndex ? `Item ${currentIndex}` : 'Preparing playlist...',
    });
  }, [url, type, detectPlaylistMode]);

  useEffect(() => {
    if (type !== 'youtube') return;
    if (!playlistInfo.isPlaylist) return;
    if (!currentTask) return;
    const taskName = String(currentTask.name || '').trim();
    const ratio = taskName.match(/(\d+)\s*\/\s*(\d+)/);
    const parsedIndex = Number.isFinite(Number(currentTask.itemIndex)) ? Number(currentTask.itemIndex) : (ratio ? Number(ratio[1]) : undefined);
    const parsedTotal = Number.isFinite(Number(currentTask.itemTotal)) ? Number(currentTask.itemTotal) : (ratio ? Number(ratio[2]) : undefined);
    setPlaylistInfo(prev => {
      const nextIndex = Number.isFinite(parsedIndex) ? parsedIndex : prev.currentIndex;
      const nextTotal = Number.isFinite(parsedTotal) ? parsedTotal : prev.totalItems;
      const nextTitle = taskName || prev.currentTitle || 'Preparing...';
      if (nextIndex === prev.currentIndex && nextTotal === prev.totalItems && nextTitle === prev.currentTitle) {
        return prev;
      }
      return { ...prev, currentIndex: nextIndex, totalItems: nextTotal, currentTitle: nextTitle };
    });
  }, [currentTask, playlistInfo.isPlaylist, type]);

  const validateUrl = (input: string): boolean => {
    if (!input) {
      setError("Please provide a media source URL.");
      return false;
    }

    const trimmed = input.trim().toLowerCase();
    
    if (type === 'youtube') {
      const isYoutube = trimmed.includes('youtube.com') || trimmed.includes('youtu.be');
      if (!isYoutube) {
        setError("Invalid Source: Expected a valid YouTube link.");
        return false;
      }
    } else if (type === 'tiktok') {
      const isTiktok = trimmed.includes('tiktok.com');
      if (!isTiktok) {
        setError("Invalid Source: Expected a valid TikTok link.");
        return false;
      }
    }

    try {
      new URL(trimmed); // Basic format check
    } catch {
      setError("Malformed URL: Please check the link structure.");
      return false;
    }

    return true;
  };

  const handleStart = useCallback(() => {
    setError(null);
    if (!validateUrl(url)) return;
    if (type === 'youtube' && useCookies && !cookiesPath.trim()) {
      setError('Cookies mode is enabled. Provide a cookies.txt file path.');
      return;
    }
    const isVideo = ['mp4', 'mkv'].includes(customExt.toLowerCase());
    const info = type === 'tiktok' ? 'Highest' : (isVideo ? videoQuality : '256kbps');
    setIsProcessing(true);
    const isPlaylistMode = type === 'youtube' && detectPlaylistMode(url);
    if (isPlaylistMode) {
      setPlaylistInfo((prev) => ({
        ...prev,
        isPlaylist: true,
        currentTitle: 'Preparing playlist...',
      }));
    }
    onDownload(type, `${customExt.toUpperCase()} (${info})`, url, {
      cookiesPath: type === 'youtube' && useCookies ? cookiesPath.trim() : '',
      selectedQuality: isVideo ? videoQuality : '',
      isPlaylist: isPlaylistMode,
      playlistInfo: isPlaylistMode ? playlistInfo : undefined,
    });
    setIsProcessing(false);
  }, [url, customExt, videoQuality, onDownload, type, useCookies, cookiesPath, detectPlaylistMode, playlistInfo]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && url && !isProcessing) handleStart();
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [isOpen, url, onClose, handleStart, isProcessing]);

  if (!isOpen) return null;

  const quickFormats = [
    { ext: 'mp4', label: 'MP4 Video', icon: 'videocam', extra: false },
    { ext: 'mp3', label: 'MP3 Audio', icon: 'audio_file', extra: false },
    { ext: 'wav', label: 'WAV Audio', icon: 'music_note', extra: true },
    { ext: 'flac', label: 'FLAC Audio', icon: 'high_quality', extra: true },
    { ext: 'mkv', label: 'MKV Video', icon: 'movie', extra: true },
    { ext: 'aac', label: 'AAC Audio', icon: 'settings_voice', extra: true },
  ].filter(f => !f.extra || settings.enableExtraFormats);

  const isVideo = ['mp4', 'mkv'].includes(customExt.toLowerCase());

  const remaining = type === 'youtube' ? usageStats?.youtubeRemaining ?? 0 : usageStats?.tiktokRemaining ?? 0;
  const dailyLimit = type === 'youtube' ? usageStats?.youtubeDailyLimit ?? 15 : usageStats?.tiktokDailyLimit ?? 15;
  const showUpgradePrompt = usageStats?.plan === 'free' && remaining <= 0;

  const qualityOptions = [
    { value: '720p', label: '720p High Def' },
    { value: '1080p', label: '1080p Full HD' },
    { value: '1440p', label: '1440p QHD' },
    { value: '4K', label: '4K Ultra HD' },
  ];

  const brandColor = type === 'tiktok' ? '#00F2EA' : '#ff0000';
  const brandAlt = type === 'tiktok' ? '#FF0050' : '#880000';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-[modalBackdropFade_0.3s_ease-out]" onClick={onClose}></div>
      <div className={`relative bg-white dark:bg-surface-dark w-full max-w-md max-h-[calc(100dvh-40px)] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-[modalScaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)] [will-change:transform,opacity] flex flex-col ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
        
        {/* Header with Brand Logo */}
        <div className="p-5 sm:p-6 md:p-8 pb-3 sm:pb-4 flex flex-col items-center flex-shrink-0">
           <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-xl transition-all duration-500" style={{ backgroundColor: type === 'tiktok' ? '#000' : brandColor }}>
             {type === 'tiktok' ? (
                <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white drop-shadow-md">
                   <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.6-4.13-1.42-.14.61-.2 1.25-.2 1.89l.01 6.57c-.01 1.34-.33 2.69-1.01 3.86-1.16 1.95-3.37 3.23-5.63 3.12-2.12-.04-4.18-1.2-5.17-3.08-1.11-2.02-.85-4.73.68-6.49 1.13-1.35 2.89-2.07 4.64-1.92.05-.13.1-.26.15-.39V4.62c-.01-.01-.01-.01-.02-.02 0-1.53-.01-3.06-.02-4.58.01-.01.01-.01.01-.02z"/>
                </svg>
             ) : (
                <span className="material-symbols-outlined text-white text-4xl font-bold">play_arrow</span>
             )}
           </div>
           <h3 className="text-xl font-black tracking-tighter dark:text-white uppercase">
              {type === 'youtube' ? 'YouTube' : 'TikTok'} Cloud Grabber
           </h3>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Professional High-Fidelity Extraction</p>
        </div>

         <div className="p-5 sm:p-6 md:p-8 space-y-5 sm:space-y-6 overflow-y-auto min-h-0 flex-1">
          {/* Section 1: URL Input */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {type === 'tiktok' ? 'TikTok Video URL' : 'YouTube Video URL'}
              </label>
              {error ? (
                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Critical Error</span>
              ) : (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">Secure Node</span>
              )}
            </div>
            <div className="relative group">
              <input 
                type="text" 
                placeholder={type === 'tiktok' ? "Paste TikTok URL (e.g., vt.tiktok.com/...)" : "Paste YouTube URL (e.g., youtube.com/watch?...)"}
                className={`w-full bg-slate-50 dark:bg-white/5 border-2 rounded-[1.5rem] px-6 py-5 text-sm font-medium focus:ring-0 transition-all placeholder:text-slate-400 shadow-inner ${error ? 'border-red-500/50 focus:border-red-500 text-red-600' : 'border-transparent focus:border-primary/20 text-slate-900 dark:text-white'}`} 
                value={url} 
                onChange={(e) => { setUrl(e.target.value); setError(null); }} 
                autoFocus 
              />
              {error && (
                <div className="absolute top-full left-0 mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-500 bg-red-500/5 px-3 py-2 rounded-xl border border-red-500/10 w-full animate-[slideUpFade_0.2s_ease-out]">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {error}
                </div>
              )}
            </div>
          </div>

          {type === 'youtube' && playlistInfo.isPlaylist && (
            <div className="bg-slate-50 dark:bg-white/[0.02] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Playlist Mode Detected</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Parent Job Active</p>
                </div>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">Playlist</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-surface-dark/50 rounded-2xl p-3 border border-slate-200 dark:border-white/10">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Current Item</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white mt-1">
                    {playlistInfo.totalItems ? `${playlistInfo.currentIndex ?? 1} / ${playlistInfo.totalItems}` : 'Preparing...'}
                  </p>
                </div>
                <div className="bg-white dark:bg-surface-dark/50 rounded-2xl p-3 border border-slate-200 dark:border-white/10">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Title</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white mt-1 truncate" title={playlistInfo.currentTitle || 'Preparing playlist...'}>
                    {playlistInfo.currentTitle || 'Preparing playlist...'}
                  </p>
                </div>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full bg-primary ${isProcessing ? 'animate-pulse' : ''}`}
                  style={{
                    width: `${playlistInfo.totalItems ? Math.max(5, Math.min(100, Math.round(((playlistInfo.currentIndex || 1) / Math.max(1, playlistInfo.totalItems || 1)) * 100))) : 5}%`,
                  }}
                />
              </div>
            </div>
          )}

          {type === 'youtube' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Cookies Authentication
                </label>
                <button
                  type="button"
                  onClick={() => setUseCookies(v => !v)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${
                    useCookies ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {useCookies ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              {useCookies && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Path to cookies.txt"
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
                    value={cookiesPath}
                    onChange={(e) => setCookiesPath(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Use exported YouTube `cookies.txt` for age-restricted/login-required videos.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Format Switcher (Segmented Control) */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Target Modality</label>
            <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-[2rem] gap-1 border border-slate-200 dark:border-white/5">
              {quickFormats.slice(0, 2).map((f) => (
                <button 
                  key={f.ext} 
                  type="button"
                  onClick={() => setCustomExt(f.ext)} 
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${customExt === f.ext ? 'bg-white dark:bg-surface-dark shadow-xl text-primary scale-100' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white scale-95 opacity-60'}`}
                >
                  <span className="material-symbols-outlined text-lg">{f.icon}</span>
                  {f.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Specifications Card */}
          <div className="bg-slate-50 dark:bg-white/[0.02] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-6 overflow-visible">
            <div className="flex items-center gap-3">
               <div className="w-1 h-4 bg-primary rounded-full" />
               <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Processing Specifications</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-5 overflow-visible">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Extension</label>
                <div className="bg-white dark:bg-surface-dark/50 rounded-2xl p-4 border border-slate-200 dark:border-white/10 flex items-center justify-between h-[52px]">
                  <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">{customExt}</p>
                  <span className="material-symbols-outlined text-slate-300 text-sm">lock_outline</span>
                </div>
              </div>
              
              <div className="space-y-2 overflow-visible">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                  {isVideo ? (type === 'tiktok' ? 'Precision' : 'Precision') : 'Flowrate'}
                </label>
                <div className="relative overflow-visible">
                  {isVideo && type !== 'tiktok' ? (
                    <CustomSelect
                      value={videoQuality}
                      options={qualityOptions}
                      onChange={(val) => setVideoQuality(val as any)}
                    />
                  ) : isVideo && type === 'tiktok' ? (
                    <div className="bg-white dark:bg-surface-dark/50 rounded-2xl p-4 border border-slate-200 dark:border-white/10 flex items-center justify-between h-[52px]">
                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Highest Available</p>
                      <span className="material-symbols-outlined text-emerald-500 text-sm">verified</span>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-surface-dark/50 rounded-2xl p-4 border border-slate-200 dark:border-white/10 flex items-center justify-between h-[52px]">
                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">256kbps</p>
                      <span className="material-symbols-outlined text-emerald-500 text-sm">verified</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {usageStats?.plan === 'free' && (
          <div className="mx-5 mb-4 rounded-[2rem] border border-slate-200 bg-white px-5 py-4 text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 sm:mx-6 md:mx-8">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Free quota</p>
            <p className="mt-2 text-xs font-black uppercase tracking-widest">{remaining} / {dailyLimit} downloads remaining today</p>
            {showUpgradePrompt && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-primary">Upgrade to Premium</p>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 md:p-6 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 flex gap-3 sm:gap-4 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Discard</button>
          <button 
            type="button"
            disabled={!url || isProcessing} 
            onClick={handleStart} 
            className="flex-1 py-5 rounded-[1.5rem] text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 dark:disabled:bg-white/10 disabled:shadow-none"
            style={{ backgroundColor: !url || isProcessing ? undefined : (type === 'tiktok' ? brandAlt : brandColor) }}
          >
            {isProcessing ? (
               <>
                 <span className="material-symbols-outlined">progress_activity</span>
                 Handshaking...
               </>
            ) : (
              <>
                <span className="material-symbols-outlined">sync_alt</span>
                Start {type === 'tiktok' ? 'TikTok' : 'YouTube'} Rip
              </>
            )}
          </button>
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

const UpgradePlansModal: React.FC<{ isOpen: boolean; onClose: () => void; usageStats: UsageStats }> = ({ isOpen, onClose, usageStats }) => {
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [billingError, setBillingError] = useState('');
  if (!isOpen) return null;

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: 'Free',
      period: '',
      isCurrent: usageStats.plan === 'free',
      features: ['Daily cloud downloads', 'Core toolkit access', 'Basic support'],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: '$19',
      period: '/month',
      isCurrent: usageStats.plan === 'premium',
      features: ['Unlimited downloads', 'Priority processing', 'Premium toolkit nodes'],
    },
    {
      id: 'studio',
      name: 'Studio',
      price: '$49',
      period: '/month',
      isCurrent: false,
      features: ['All premium features', 'Team-ready workflows', 'Dedicated support lane'],
    },
  ];

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close plans modal" />
      <div className="relative w-full max-w-5xl rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-surface-dark md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Upgrade Node</p>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Choose Your Plan</h3>
            {billingError && <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-red-500">{billingError}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-xl border border-slate-200 text-slate-500 transition-all hover:border-primary/30 hover:text-primary dark:border-white/10"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-[2rem] border p-6 ${
                plan.isCurrent
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.02]'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{plan.name}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{plan.price}</span>
                {plan.period && <span className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{plan.period}</span>}
              </div>
              <div className="mt-5 space-y-2">
                {plan.features.map((feature) => (
                  <p key={feature} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                    {feature}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={async () => {
                  setBillingError('');
                  if (plan.isCurrent || plan.id === 'starter') {
                    onClose();
                    return;
                  }
                  if (!ENABLE_SERVER_BILLING) {
                    setBillingError('Enable VITE_ENABLE_SERVER_BILLING=1 and API base URL.');
                    return;
                  }
                  try {
                    setProcessingPlan(plan.id);
                    const { url } = await apiCreateCheckoutSession(plan.id);
                    if (url) {
                      window.location.href = url;
                      return;
                    }
                    setBillingError('Checkout URL missing from server.');
                  } catch (err) {
                    setBillingError(err instanceof Error ? err.message : 'Billing server error.');
                  } finally {
                    setProcessingPlan(null);
                  }
                }}
                disabled={plan.isCurrent || processingPlan === plan.id}
                className={`mt-6 w-full rounded-xl py-3 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                  plan.isCurrent
                    ? 'cursor-default bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                    : 'bg-primary text-white hover:brightness-110 active:scale-[0.98]'
                }`}
              >
                {plan.isCurrent ? 'Current Plan' : processingPlan === plan.id ? 'Opening Checkout...' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ isDarkMode: boolean; setIsDarkMode: (v: boolean) => void; settings: AppSettings; setSettings: (s: AppSettings) => void; autoPerfDetected?: boolean; usageStats: UsageStats }> = ({ isDarkMode, setIsDarkMode, settings, setSettings, autoPerfDetected = false, usageStats }) => {
  const [feedback, setFeedback] = useState('');
  const qualityOptions = [
    { value: '720p', label: '720p HD' },
    { value: '1080p', label: '1080p FHD' },
    { value: '1440p', label: '1440p QHD' },
    { value: '4K', label: '4K Ultra' },
  ];

  const handlePickFolder = (key: 'mp3' | 'mp4') => {
    const currentPath = key === 'mp3' ? settings.mp3OutputPath : settings.mp4OutputPath;
    const applyPicked = (picked: string) => {
      const clean = (picked || '').trim();
      if (!clean) return;
      const next = (key === 'mp3'
        ? { ...settings, mp3OutputPath: clean }
        : { ...settings, mp4OutputPath: clean });
      setSettings(next);
      try {
        const bridge = window.pyBridge;
        if (bridge && typeof bridge.bridgeCommand === 'function') {
          bridge.bridgeCommand(JSON.stringify({
            version: '1.0',
            requestId: `${Date.now()}`,
            command: 'system.save_settings',
            payload: {
              mp3OutputPath: String(next.mp3OutputPath || ''),
              mp4OutputPath: String(next.mp4OutputPath || ''),
              defaultVideoQuality: String(next.defaultVideoQuality || '1080p'),
              tiktokWatermark: !!next.tiktokWatermark,
            },
          }));
        }
      } catch (err) {
        console.error('Immediate settings persist failed:', err);
      }
    };

    const bridge = window.pyBridge;
    if (bridge && typeof bridge.bridgeCommand === 'function') {
      try {
        const raw = bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.pick_folder',
          payload: { key, currentPath },
        }));
        const parsed = raw ? JSON.parse(raw) as { ok?: boolean; data?: { path?: string } } : {};
        if (parsed.ok && parsed.data?.path) {
          applyPicked(parsed.data.path);
        }
        return;
      } catch (err) {
        console.error('Folder picker bridge failed:', err);
      }
    }
    console.warn('Folder picker unavailable: bridge not found.');
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-[fadeIn_0.5s_ease-out] pb-32">
      <div className="bg-white dark:bg-surface-dark rounded-[3rem] shadow-xl p-10 border border-slate-200 dark:border-white/5 space-y-12 transition-colors duration-500 overflow-visible">
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
                  <p className="text-[9px] font-medium text-slate-500 mt-1">Reduce visual effects for smoother rendering{autoPerfDetected ? ' (auto enabled)' : ''}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isPerformanceMode: !settings.isPerformanceMode })}
                  className={`w-10 h-6 rounded-full p-1 transition-all ${settings.isPerformanceMode ? 'bg-primary' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${settings.isPerformanceMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Low RAM Mode</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">Compress background nodes.</p>
                </div>
                <button type="button" onClick={() => setSettings({...settings, lowRamMode: !settings.lowRamMode})} className={`w-10 h-6 rounded-full p-1 transition-all ${settings.lowRamMode ? 'bg-blue-500' : 'bg-slate-300'}`}>
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
                <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className={`w-10 h-6 rounded-full p-1 transition-all ${isDarkMode ? 'bg-primary' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-xs">Reduce Motion</p>
                  <p className="text-[9px] font-medium text-slate-500 mt-1">Disable all animations.</p>
                </div>
                <button type="button" onClick={() => setSettings({...settings, reduceMotion: !settings.reduceMotion})} className={`w-10 h-6 rounded-full p-1 transition-all ${settings.reduceMotion ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-all ${settings.reduceMotion ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-6 overflow-visible">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Downloader Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-visible">
            <div className="flex flex-col justify-between p-8 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5">
              <div>
                <p className="font-black dark:text-white uppercase tracking-widest text-sm mb-1">Extra Formats</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Enable AAC, FLAC, MKV, WAV</p>
              </div>
              <button type="button" onClick={() => setSettings({...settings, enableExtraFormats: !settings.enableExtraFormats})} className={`w-16 h-9 rounded-full relative transition-all duration-500 p-1 ${settings.enableExtraFormats ? 'bg-primary' : 'bg-slate-300'}`}>
                <div className={`w-7 h-7 bg-white rounded-full shadow-md transition-all duration-500 ${settings.enableExtraFormats ? 'translate-x-7' : 'translate-x-0'}`}></div>
              </button>
            </div>
              <div className="flex flex-col justify-between p-8 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5 overflow-visible">
              <div>
                <p className="font-black dark:text-white uppercase tracking-widest text-sm mb-1">Default MP4 Quality</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Set initial video resolution</p>
              </div>
              <CustomSelect
                value={settings.defaultVideoQuality}
                options={qualityOptions}
                onChange={(val) => setSettings({...settings, defaultVideoQuality: val as any})}
              />
              </div>
              <div className="flex flex-col justify-between p-8 bg-slate-50 dark:bg-white/[0.02] rounded-3xl border border-slate-100 dark:border-white/5">
                <div>
                  <p className="font-black dark:text-white uppercase tracking-widest text-sm mb-1">TikTok Watermark</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Enable watermark when available</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, tiktokWatermark: !settings.tiktokWatermark })}
                  className={`w-16 h-9 rounded-full relative transition-all duration-500 p-1 ${settings.tiktokWatermark ? 'bg-primary' : 'bg-slate-300'}`}
                >
                  <div className={`w-7 h-7 bg-white rounded-full shadow-md transition-all duration-500 ${settings.tiktokWatermark ? 'translate-x-7' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Free Plan Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 dark:border-white/5 dark:bg-white/[0.02]">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">YouTube</p>
              <p className="mt-3 text-xl font-black dark:text-white">{usageStats.youtubeRemaining} / {usageStats.youtubeDailyLimit}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">downloads remaining</p>
            </div>
            <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 dark:border-white/5 dark:bg-white/[0.02]">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">TikTok</p>
              <p className="mt-3 text-xl font-black dark:text-white">{usageStats.tiktokRemaining} / {usageStats.tiktokDailyLimit}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">downloads remaining</p>
            </div>
            <div className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 p-6 dark:border-amber-300/20">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500 dark:text-amber-300">Copyright</p>
              <p className="mt-3 text-xl font-black text-slate-900 dark:text-white">{usageStats.copyrightScanSongLimit}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">songs per free scan</p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Storage & Exports</h3>
          <div className="p-8 bg-slate-50 dark:bg-white/[0.02] rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-black dark:text-white uppercase tracking-widest text-xs">Output Directories</p>
              <span className="text-[8px] font-black text-primary uppercase tracking-widest">Qt Picker</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-20 shrink-0 uppercase">MP3</span>
              <input
                type="text"
                value={settings.mp3OutputPath}
                onChange={(e) => setSettings({ ...settings, mp3OutputPath: e.target.value })}
                placeholder="No folder selected"
                className="flex-1 min-w-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono dark:text-white placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => handlePickFolder('mp3')}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-[0.98]"
              >
                Browse
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-20 shrink-0 uppercase">MP4</span>
              <input
                type="text"
                value={settings.mp4OutputPath}
                onChange={(e) => setSettings({ ...settings, mp4OutputPath: e.target.value })}
                placeholder="No folder selected"
                className="flex-1 min-w-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono dark:text-white placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => handlePickFolder('mp4')}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-[0.98]"
              >
                Browse
              </button>
            </div>
            <p className="text-[9px] font-medium text-slate-500 ml-1">Click Browse to open the system folder picker.</p>
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Send Feedback</h3>
          <div className="rounded-[2.5rem] border border-slate-100 bg-slate-50 p-8 dark:border-white/5 dark:bg-white/[0.02] space-y-4">
            <p className="text-xs font-black uppercase tracking-widest dark:text-white">System Improvement Report</p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us what should feel better in this UI..."
              className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <button type="button" className="w-full rounded-2xl bg-primary py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:brightness-110 disabled:opacity-50" disabled={!feedback.trim()}>
              Send Feedback
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Maintenance</h3>
          <button type="button" className="w-full rounded-[2rem] border border-slate-200 bg-slate-50 px-6 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-all hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300">
            Purge Cache
          </button>
        </section>
      </div>
    </div>
  );
};

const MainContentComponent: React.FC<MainContentProps> = ({ activeTab, onTabChange, isLoading = false, onAddTask, onRunToolkit, isDarkMode, setIsDarkMode, settings, setSettings, autoPerfDetected, copyrightState, onScanCopyright, currentTask, jobs = [], usageStats = { plan: 'free', youtubeRemaining: 12, youtubeDailyLimit: 15, tiktokRemaining: 12, tiktokDailyLimit: 15, copyrightScanSongLimit: 100 }, onOpenJobFolder, previewJob = null, onPreviewHandled }) => {
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [isTiktokModalOpen, setIsTiktokModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [keyModalResult, setKeyModalResult] = useState<AnalysisResultData | null>(null);
  const [showMP4GeneratorModal, setShowMP4GeneratorModal] = useState(false);
  const [showMP4ConcatenatorModal, setShowMP4ConcatenatorModal] = useState(false);
  const [showStemSeparatorModal, setShowStemSeparatorModal] = useState(false);
  const [showVocalFixModal, setShowVocalFixModal] = useState(false);
  const [isConverterModalOpen, setIsConverterModalOpen] = useState(false);
  const [modalSourceTab, setModalSourceTab] = useState<NavItem | null>(null);
  const [mp4GeneratorFiles, setMp4GeneratorFiles] = useState<string[]>([]);
  const [uiNotice, setUiNotice] = useState('');
  const [uiNoticeLevel, setUiNoticeLevel] = useState<'error' | 'info'>('error');
  const noticeTimerRef = useRef<number | null>(null);
  const isBridgePickingFilesRef = useRef(false);
  const lastSuccessfulPickRef = useRef<{ mode: 'audio' | 'video' | ''; files: string[]; ts: number }>({
    mode: '',
    files: [],
    ts: 0,
  });

  const showUiNotice = useCallback((message: string, level: 'error' | 'info' = 'error') => {
    let msg = String(message || '').trim();
    if (!msg) return;
    let nextLevel: 'error' | 'info' = level;
    const selectedMatch = msg.match(/^Selected\s+(\d+)\s+file\(s\)\.?$/i);
    if (selectedMatch) {
      const n = selectedMatch[1];
      msg = `${n} file${n === '1' ? '' : 's'} selected.`;
      nextLevel = 'info';
    }
    setUiNotice(msg);
    setUiNoticeLevel(nextLevel);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setUiNotice('');
      noticeTimerRef.current = null;
    }, 8000);
  }, []);

  useEffect(() => {
    if (activeTab !== NavItem.Toolkit) return;
    const handleKeys = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); setIsYoutubeModalOpen(true); }
      if (e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); setIsTiktokModalOpen(true); }
      if (e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setKeyModalResult(null); setIsKeyModalOpen(true); }
      if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); setIsConverterModalOpen(true); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const handleDownload = useCallback((type: string, format: string, url: string, opts?: { cookiesPath?: string; selectedQuality?: string; isPlaylist?: boolean; playlistInfo?: PlaylistInfo }) => {
    try {
      let runtimeMp3Path = String(settings.mp3OutputPath || '').trim();
      let runtimeMp4Path = String(settings.mp4OutputPath || '').trim();
      let runtimeQuality = String(settings.defaultVideoQuality || '1080p').trim();
      let runtimeTikTokWatermark = !!settings.tiktokWatermark;

      const fmt = format.toLowerCase();
      const isAudio = fmt.includes('mp3') || fmt.includes('wav') || fmt.includes('flac') || fmt.includes('aac');
      const selectedQuality = String(opts?.selectedQuality || '').trim();
      if (selectedQuality) {
        runtimeQuality = selectedQuality;
      }
      const cookiesPath = (opts?.cookiesPath || '').trim();
      let option = '1';
      let task = 'Downloading YouTube Video';
      let payload: Record<string, unknown> = {
        urls: [url],
        quality: runtimeQuality,
        output_path: runtimeMp4Path,
      };
      if (cookiesPath) {
        payload.cookies = cookiesPath;
      }
      if (type === 'tiktok') {
        option = '4';
        task = 'Processing TikTok Job';
        payload = {
          mode: '1',
          urls: [url],
          quality: 'best',
          tiktok_watermark: runtimeTikTokWatermark,
          output_path: isAudio ? runtimeMp3Path : runtimeMp4Path,
        };
      } else if (isAudio) {
        option = '5';
        task = 'Converting YouTube to MP3';
        payload = {
          urls: [url],
          quality: runtimeQuality,
          output_path: runtimeMp3Path,
        };
        if (cookiesPath) {
          payload.cookies = cookiesPath;
        }
      } else if (cookiesPath) {
        option = '3';
        task = 'Downloading with Cookies';
      }
      if (type === 'youtube' && !isAudio && opts?.isPlaylist) {
        task = 'Preparing playlist...';
      }

      const selectedOutput = String(payload.output_path || '').trim();
      if (!selectedOutput) {
        showUiNotice('Select an output folder before starting download.');
        return;
      }

      let started = false;
      if (onRunToolkit) {
        started = onRunToolkit(option, payload, task);
      }
      if (started) {
        setIsYoutubeModalOpen(false);
        setIsTiktokModalOpen(false);
      }
    } catch (e) {
      console.error("Downloader Task Error:", e);
      // Fail silently to prevent main app crash, modal would ideally show this but modal closes on success
    }
  }, [onAddTask, onRunToolkit, settings.defaultVideoQuality, settings.mp3OutputPath, settings.mp4OutputPath, settings.tiktokWatermark, showUiNotice]);

  const handleConvert = useCallback((bitrate: string) => {
    if (onAddTask) onAddTask(`Converting: Local MP4 Asset to MP3 (${bitrate})`);
    setIsConverterModalOpen(false);
  }, [onAddTask]);

  const handleRunMP4Generator = useCallback((payload: { files: string[]; offset: string; outputPath: string }) => {
    if (!onRunToolkit) return false;
    return onRunToolkit('16', {
      files: Array.isArray(payload.files) ? payload.files : [],
      offset: String(payload.offset || '30s'),
      outputPath: String(payload.outputPath || settings.mp4OutputPath || '').trim(),
    }, 'Generating MP4 Batch');
  }, [onRunToolkit, settings.mp4OutputPath]);

  const handleRunMP4Concatenator = useCallback((payload: { files: string[]; segmentDuration: string }) => {
    if (!onRunToolkit) return false;
    return onRunToolkit('17', {
      files: Array.isArray(payload.files) ? payload.files : [],
      segmentDuration: String(payload.segmentDuration || '30s'),
    }, 'Concatenating MP4 Files');
  }, [onRunToolkit]);

  const handleRunKeyAnalysis = useCallback((files: string[]) => {
    if (!onRunToolkit) return false;
    return onRunToolkit('15', {
      files: Array.isArray(files) ? files : [],
    }, 'Analyzing BPM & Key');
  }, [onRunToolkit]);

  const handleRunStemSeparator = useCallback((files: string[]) => {
    if (!onRunToolkit) return false;
    return onRunToolkit('13', {
      files: Array.isArray(files) ? files : [],
    }, 'Separating Audio Stems');
  }, [onRunToolkit]);

  const handleRunVocalFix = useCallback((files: string[]) => {
    if (!onRunToolkit) return false;
    return onRunToolkit('18', {
      files: Array.isArray(files) ? files : [],
    }, 'Removing Vocals');
  }, [onRunToolkit]);

  const handleKeyFinished = useCallback((_data: {key: string, bpm: string}) => {
    // Result stays in the modal and the global job rail; avoid creating a fake follow-up task.
  }, []);

  const handlePreviewJob = useCallback((job: ActivityJob) => {
    if (job.type !== 'Analyzed' || job.status !== 'completed' || !job.analysisResult) return;
    setKeyModalResult(buildAnalysisResult(job.analysisResult));
    setIsKeyModalOpen(true);
  }, []);

  useEffect(() => {
    if (!previewJob) return;
    handlePreviewJob(previewJob);
    onPreviewHandled?.();
  }, [previewJob, handlePreviewJob, onPreviewHandled]);

    const handlePickFiles = useCallback(async (mode: 'audio' | 'video'): Promise<string[]> => {
    if (isBridgePickingFilesRef.current) return [];
    isBridgePickingFilesRef.current = true;

    const bridge = window.pyBridge;
    if (!bridge || typeof bridge.bridgeCommand !== 'function') {
      window.setTimeout(() => {
        isBridgePickingFilesRef.current = false;
      }, 600);
      showUiNotice('Bridge not ready. Try again in a second.');
      return [];
    }

    const normalizePaths = (input: unknown): string[] => {
      if (!input) return [];
      if (Array.isArray(input)) {
        return input.map((x) => String(x || '').trim()).filter(Boolean);
      }
      if (typeof input === 'string') {
        const t = input.trim();
        if (!t) return [];
        try {
          const parsed = JSON.parse(t);
          return normalizePaths(parsed);
        } catch {
          return [t];
        }
      }
      if (typeof input === 'object') {
        const obj = input as Record<string, unknown>;
        return [
          ...normalizePaths(obj.files),
          ...normalizePaths(obj.paths),
          ...normalizePaths(obj.selected),
          ...normalizePaths(obj.items),
          ...normalizePaths(obj.data),
        ].filter(Boolean);
      }
      return [];
    };

    const dedupe = (arr: string[]) => arr
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    const callBridge = async (command: string, payload: Record<string, unknown>) => {
      try {
        const rawResolved = await Promise.resolve(bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command,
          payload,
        })) as unknown);
        const raw = typeof rawResolved === 'string' ? rawResolved : JSON.stringify(rawResolved ?? {});
        return raw ? JSON.parse(raw) as { ok?: boolean; data?: any; error?: { message?: string } } : {};
      } catch {
        return {} as { ok?: boolean; data?: any; error?: { message?: string } };
      }
    };

    try {
      const parsed = await callBridge('system.pick_files', { mode });
      const files = dedupe([
        ...normalizePaths(parsed?.data?.files),
        ...normalizePaths(parsed?.data?.data?.files),
        ...normalizePaths((parsed as any)?.files),
        ...normalizePaths((parsed as any)?.result?.files),
        ...normalizePaths((parsed as any)?.payload?.files),
        ...normalizePaths(parsed?.data),
      ]);

      if (files.length > 0) {
        lastSuccessfulPickRef.current = { mode, files, ts: Date.now() };
        return files;
      }

      const parsedLast = await callBridge('system.get_last_picked_files', { mode });
      const fallbackFiles = dedupe(normalizePaths(parsedLast?.data?.files));
      const ageMs = Number(parsedLast?.data?.age_ms ?? 999999);
      if (fallbackFiles.length > 0 && ageMs <= 20000) {
        lastSuccessfulPickRef.current = { mode, files: fallbackFiles, ts: Date.now() };
        return fallbackFiles;
      }

      if (parsed.error?.message) {
        showUiNotice(`Picker error: ${parsed.error.message}`);
        return [];
      }
    } catch (err) {
      console.error('File picker bridge failed:', err);
    } finally {
      window.setTimeout(() => {
        isBridgePickingFilesRef.current = false;
      }, 700);
    }

    showUiNotice('No files were selected.');
    return [];
  }, [showUiNotice]);

  const handlePickFolder = useCallback(async (key: 'mp3' | 'mp4', currentPath: string): Promise<string> => {
    const bridge = window.pyBridge;
    if (!bridge) return '';
    try {
      let picked = '';
      if (typeof bridge.bridgeCommand === 'function') {
        const raw = bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.pick_folder',
          payload: { key, currentPath },
        }));
        const parsed = raw ? JSON.parse(raw) as { ok?: boolean; data?: { path?: string; data?: { path?: string } } } : {};
        picked = String(parsed.data?.path || parsed.data?.data?.path || '').trim();
      }
      if (picked) {
        const nextSettings = key === 'mp4'
          ? { ...settings, mp4OutputPath: picked }
          : { ...settings, mp3OutputPath: picked };
        setSettings(nextSettings);
        // Persist immediately to avoid losing folder selection on app restart.
        try {
          if (typeof bridge.bridgeCommand === 'function') {
            bridge.bridgeCommand(JSON.stringify({
              version: '1.0',
              requestId: `${Date.now()}`,
              command: 'system.save_settings',
              payload: {
                mp3OutputPath: String(nextSettings.mp3OutputPath || ''),
                mp4OutputPath: String(nextSettings.mp4OutputPath || ''),
                defaultVideoQuality: String(nextSettings.defaultVideoQuality || '1080p'),
                tiktokWatermark: !!nextSettings.tiktokWatermark,
              },
            }));
          }
        } catch (err) {
          console.error('Immediate settings persist failed:', err);
        }
        return picked;
      }
    } catch (err) {
      console.error('Folder picker bridge failed:', err);
    }
    return '';
  }, [setSettings, settings]);

  const openMP4Generator = useCallback(() => {
    setModalSourceTab(activeTab);
    setShowMP4GeneratorModal(true);
  }, [activeTab]);

  const openMP4Concatenator = useCallback(() => {
    setModalSourceTab(activeTab);
    setShowMP4ConcatenatorModal(true);
  }, [activeTab]);

  const closeMP4Generator = useCallback(() => {
    setShowMP4GeneratorModal(false);
    setMp4GeneratorFiles([]);
    if (modalSourceTab && onTabChange && activeTab !== modalSourceTab) onTabChange(modalSourceTab);
  }, [activeTab, modalSourceTab, onTabChange]);

  const closeMP4Concatenator = useCallback(() => {
    setShowMP4ConcatenatorModal(false);
    if (modalSourceTab && onTabChange && activeTab !== modalSourceTab) onTabChange(modalSourceTab);
  }, [activeTab, modalSourceTab, onTabChange]);

  const modalLayer = (
    <>
      <VideoModal type="youtube" isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} onDownload={handleDownload} settings={settings} currentTask={currentTask} usageStats={usageStats} />
      <VideoModal type="tiktok" isOpen={isTiktokModalOpen} onClose={() => setIsTiktokModalOpen(false)} onDownload={handleDownload} settings={settings} currentTask={currentTask} usageStats={usageStats} />
      <KeyAnalysisModal isOpen={isKeyModalOpen} onClose={() => { setIsKeyModalOpen(false); setKeyModalResult(null); }} onFinished={handleKeyFinished} onPickFiles={() => handlePickFiles('audio')} onStart={handleRunKeyAnalysis} currentTask={currentTask} initialResult={keyModalResult} />
      <UpgradePlansModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} usageStats={usageStats} />
      <AudioTaskModal isOpen={showStemSeparatorModal} onClose={() => setShowStemSeparatorModal(false)} onStart={handleRunStemSeparator} onPickFiles={() => handlePickFiles('audio')} performanceMode={settings.isPerformanceMode} title="AI Stem Separator" subtitle="Deconstruct audio into clean stems" actionLabel="Generate Stems" emptyLabel="Select audio files for stem separation" />
      <AudioTaskModal isOpen={showVocalFixModal} onClose={() => setShowVocalFixModal(false)} onStart={handleRunVocalFix} onPickFiles={() => handlePickFiles('audio')} performanceMode={settings.isPerformanceMode} title="Vocal Fix" subtitle="Remove vocals and keep the instrumental" actionLabel="Remove Vocals" emptyLabel="Select audio files for vocal removal" />
      <MP4GeneratorModal isOpen={showMP4GeneratorModal} onClose={closeMP4Generator} onStart={handleRunMP4Generator} onPickFiles={() => handlePickFiles('audio')} files={mp4GeneratorFiles} setFiles={setMp4GeneratorFiles} onPickOutputFolder={(currentPath) => handlePickFolder('mp4', currentPath)} performanceMode={settings.isPerformanceMode} settings={settings} />
      <MP4ConcatenatorModal isOpen={showMP4ConcatenatorModal} onClose={closeMP4Concatenator} onStart={handleRunMP4Concatenator} onPickFiles={() => handlePickFiles('video')} performanceMode={settings.isPerformanceMode} settings={settings} />
      <ConverterModal isOpen={isConverterModalOpen} onClose={() => setIsConverterModalOpen(false)} onConvert={handleConvert} />
      {uiNotice && (
        <div className={`fixed right-6 bottom-6 z-[160] max-w-sm rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-md ${
          uiNoticeLevel === 'info'
            ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
            : 'border border-red-500/40 bg-red-500/15 text-red-200'
        }`}>
          <div className="text-[10px] font-black uppercase tracking-widest">{uiNoticeLevel === 'info' ? 'Ready' : 'Action Needed'}</div>
          <div className="mt-1 text-sm font-semibold leading-snug">{uiNotice}</div>
        </div>
      )}
    </>
  );

  if (activeTab === NavItem.Profile) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <ProfileView />}</>;
  if (activeTab === NavItem.Settings) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <SettingsView isDarkMode={!!isDarkMode} setIsDarkMode={setIsDarkMode || (() => {})} settings={settings} setSettings={setSettings} autoPerfDetected={autoPerfDetected} usageStats={usageStats} />}</>;
  if (activeTab === NavItem.Copyright) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <CopyrightView copyrightState={copyrightState || {
    scan: { running: false, progress: 0, label: '', hashing: '' },
    counts: {
      filesInToTest: 0,
      alreadyTested: 0,
      newFiles: 0,
      totalTracks: 0,
      totalTested: 0,
      cleared: 0,
      flagged: 0,
      complianceScore: 0,
    },
    rows: [],
  }} onScanCopyright={onScanCopyright} onOpenMP4Generator={openMP4Generator} onOpenMP4Concatenator={openMP4Concatenator} usageStats={usageStats} />}</>;
  if (activeTab === NavItem.Music) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <KeyDetectView performanceMode={settings.isPerformanceMode} onAddTask={onAddTask} />}</>;
  if (activeTab === NavItem.SpotifyArt) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <SpotifyArtView performanceMode={settings.isPerformanceMode} onAddTask={onAddTask} />}</>;
  if (activeTab === NavItem.History) return <>{modalLayer}{isLoading ? <div className="p-10"><div className="h-64 rounded-3xl bg-slate-200 dark:bg-white/10" /></div> : <HistoryView jobs={jobs} onOpenJobFolder={onOpenJobFolder} onPreviewJob={handlePreviewJob} />}</>;

  if (activeTab !== NavItem.Toolkit) {
    return (
      <>
      {modalLayer}
      <div className="p-12 flex items-center justify-center h-full text-slate-500">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-5xl text-slate-300">construction</span>
          </div>
          <h2 className="text-xl font-black tracking-tight dark:text-white uppercase tracking-[0.3em]">{activeTab} Zone</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Node under construction</p>
        </div>
      </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="p-10 max-w-6xl mx-auto space-y-8 pb-20">
        <div className="h-40 rounded-[3rem] bg-slate-200 dark:bg-white/10" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-60 rounded-[2.5rem] bg-slate-200 dark:bg-white/10" />
          <div className="h-60 rounded-[2.5rem] bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="h-48 rounded-[2.5rem] bg-slate-200 dark:bg-white/10" />
      </div>
    );
  }

  return (
    <div className={`p-10 max-w-6xl mx-auto space-y-16 overflow-visible pb-20 transition-all duration-300 ease-in-out ${settings.isPerformanceMode ? '' : 'animate-[fadeIn_0.5s_ease-out]'}`}>
      {modalLayer}

      {/* Neural Station */}
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
            type="button"
            onClick={() => setIsUpgradeModalOpen(true)}
            className="w-fit px-6 py-3 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
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

      <CloudAcquisitionSection
        onOpenYoutube={() => setIsYoutubeModalOpen(true)}
        onOpenTiktok={() => setIsTiktokModalOpen(true)}
      />

      <EngineeringLabSection
        onOpenKey={() => { setKeyModalResult(null); setIsKeyModalOpen(true); }}
        onOpenStem={() => setShowStemSeparatorModal(true)}
        onOpenVocalFix={() => setShowVocalFixModal(true)}
      />

      <CopyrightEngineeringSection
        onOpenMP4Generator={openMP4Generator}
        onOpenMP4Concatenator={openMP4Concatenator}
      />

      {/* System Utilities */}
      <section className="space-y-8">
        <div className="flex items-center gap-4 px-2">
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">System Utilities</h3>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <button
            type="button"
            onClick={() => onAddTask?.('Checking license status...')}
            className="group relative overflow-hidden p-8 bg-white dark:bg-surface-dark rounded-[2.5rem] border border-slate-200 dark:border-white/10 text-left shadow-xl dark:shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
          >
            <span className="material-symbols-outlined text-3xl text-slate-500 mb-5">verified</span>
            <p className="text-2xl font-black dark:text-white uppercase tracking-tight">License</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Copyright Engine Verification</p>
          </button>
        </div>
      </section>

      <style>{`
        @keyframes modalScaleUp {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modalBackdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

const MainContent = React.memo(MainContentComponent);
MainContent.displayName = 'MainContent';

export default MainContent;

