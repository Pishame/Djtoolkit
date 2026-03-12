
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavItem, ActivityJob, CurrentTask, AppSettings, Notification, UsageStats, AnalysisResultData } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import ActivitySidebar from './components/ActivitySidebar';
import LoginView from './components/LoginView';
import ToastNotification from './components/ToastNotification';

type PyBridge = {
  bridgeCommand?: (commandJson: string) => string;
  pickFolder?: (key: string, currentPath: string, cb?: (result: string) => void) => string | void;
  runToolkitOption?: (option: string, payloadJson: string) => void;
  stopToolkit?: () => void;
  scanCopyright?: () => void;
};

type ToolkitStatus = {
  data?: {
    job?: {
      running?: boolean;
      state?: string;
      progress?: number;
      name?: string;
      currentIndex?: number;
      totalItems?: number;
      isPlaylist?: boolean;
    };
    metrics?: { etaText?: string };
    output?: { fileName?: string; sourceUrl?: string; sourceTitle?: string };
    settings?: { mp3OutputPath?: string; mp4OutputPath?: string; defaultVideoQuality?: string; tiktokWatermark?: boolean; loginEmail?: string };
    copyright?: {
      scan?: { running?: boolean; progress?: number; label?: string; hashing?: string };
      counts?: {
        filesInToTest?: number;
        alreadyTested?: number;
        newFiles?: number;
        totalTracks?: number;
        totalTested?: number;
        cleared?: number;
        flagged?: number;
        complianceScore?: number;
      };
      rows?: Array<{ name?: string; status?: string; action?: string }>;
    };
    message?: string;
  };
};

type CopyrightRow = { name: string; status: string; action: string };
type CopyrightState = {
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
  rows: CopyrightRow[];
};

const EMPTY_COPYRIGHT_STATE: CopyrightState = {
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
};

type BridgeResponse = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

declare global {
  interface Window {
    pyBridge?: PyBridge;
  }
}

const App: React.FC = () => {
  const initialLoginEmail = (() => {
    try {
      return String(window.localStorage.getItem('dj_login_email') || '').trim().toLowerCase();
    } catch {
      return '';
    }
  })();
  const initialSessionActive = (() => {
    try {
      return String(window.localStorage.getItem('dj_login_active') || '').trim() === '1';
    } catch {
      return false;
    }
  })();
  const [isBooting, setIsBooting] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [bridgeReadyTick, setBridgeReadyTick] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(initialSessionActive && !!initialLoginEmail);
  const [loginEmail, setLoginEmail] = useState(initialLoginEmail);
  const [activeTab, setActiveTab] = useState<NavItem>(NavItem.Toolkit);
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [activeToast, setActiveToast] = useState<Notification | null>(null);
  const [previewJob, setPreviewJob] = useState<ActivityJob | null>(null);
  const [usageStats] = useState<UsageStats>({
    plan: 'free',
    youtubeRemaining: 12,
    youtubeDailyLimit: 15,
    tiktokRemaining: 12,
    tiktokDailyLimit: 15,
    copyrightScanSongLimit: 100,
  });
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({
    enableExtraFormats: false,
    defaultVideoQuality: '1080p',
    tiktokWatermark: false,
    mp3OutputPath: '',
    mp4OutputPath: '',
    isPerformanceMode: true,
    reduceMotion: true,
    lowRamMode: false,
    autoPurgeCache: true,
  });

  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null);
  const [copyrightState, setCopyrightState] = useState<CopyrightState>(EMPTY_COPYRIGHT_STATE);
  const saveSettingsTimer = useRef<number | null>(null);
  const didInitialHydrate = useRef(false);
  const authHydratedFromBackend = useRef(false);
  const settingsHydratedFromBackend = useRef(false);
  const backendHydratedLoginRef = useRef<string | null>(null);
  const authStartupSaveUnlockedRef = useRef(false);
  const awaitingRunStartRef = useRef(false);
  const lastStatusRef = useRef<ToolkitStatus | null>(null);
  const cancelRequestedRef = useRef(false);
  const cancelFallbackTimerRef = useRef<number | null>(null);
  const startupStageTimerRef = useRef<number | null>(null);
  const startupStageIndexRef = useRef(0);
  const startupTaskNameRef = useRef('');

  const startupStages = [
    'Validating link...',
    'Fetching metadata...',
    'Selecting format...',
    'Starting download...',
  ];

  const stopStartupStageTicker = useCallback(() => {
    if (startupStageTimerRef.current) {
      window.clearInterval(startupStageTimerRef.current);
      startupStageTimerRef.current = null;
    }
    startupStageIndexRef.current = 0;
    startupTaskNameRef.current = '';
  }, []);

  const startStartupStageTicker = useCallback((taskName: string) => {
    stopStartupStageTicker();
    startupTaskNameRef.current = taskName;
    startupStageIndexRef.current = 0;
    setCurrentTask({
      name: taskName,
      progress: 2,
      timeRemaining: startupStages[0],
      status: 'running',
      itemIndex: 1,
      itemTotal: 1,
    });
    startupStageTimerRef.current = window.setInterval(() => {
      const next = Math.min(startupStageIndexRef.current + 1, startupStages.length - 1);
      startupStageIndexRef.current = next;
      const pct = Math.min(15, 2 + next * 4);
      setCurrentTask(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          name: startupTaskNameRef.current || prev.name,
          progress: Math.max(prev.progress ?? 0, pct),
          timeRemaining: startupStages[next],
          status: 'running',
          itemIndex: 1,
          itemTotal: 1,
        };
      });
    }, 650);
  }, [stopStartupStageTicker]);

  useEffect(() => {
    console.log('[auth] startup defaults:', {
      isLoggedIn,
      loginEmail,
      initialLoginEmail,
      initialSessionActive,
    });
    // Intentionally only once for lifecycle tracing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unwrapBridgeData = useCallback((parsed: BridgeResponse): Record<string, unknown> => {
    const raw = (parsed.data || {}) as Record<string, unknown>;
    const nested = raw.data;
    if (nested && typeof nested === 'object') {
      return nested as Record<string, unknown>;
    }
    return raw;
  }, []);

  const mergeCopyrightPayload = useCallback((payload?: ToolkitStatus['data']['copyright']) => {
    if (!payload) return;
    setCopyrightState(prev => ({
      scan: {
        running: Boolean(payload.scan?.running ?? prev.scan.running),
        progress: Math.max(0, Math.min(100, Number(payload.scan?.progress ?? prev.scan.progress))),
        label: String(payload.scan?.label ?? prev.scan.label ?? ''),
        hashing: String(payload.scan?.hashing ?? prev.scan.hashing ?? ''),
      },
      counts: {
        filesInToTest: Number(payload.counts?.filesInToTest ?? prev.counts.filesInToTest ?? 0),
        alreadyTested: Number(payload.counts?.alreadyTested ?? prev.counts.alreadyTested ?? 0),
        newFiles: Number(payload.counts?.newFiles ?? prev.counts.newFiles ?? 0),
        totalTracks: Number(payload.counts?.totalTracks ?? prev.counts.totalTracks ?? 0),
        totalTested: Number(payload.counts?.totalTested ?? prev.counts.totalTested ?? 0),
        cleared: Number(payload.counts?.cleared ?? prev.counts.cleared ?? 0),
        flagged: Number(payload.counts?.flagged ?? prev.counts.flagged ?? 0),
        complianceScore: Number(payload.counts?.complianceScore ?? prev.counts.complianceScore ?? 0),
      },
      rows: Array.isArray(payload.rows)
        ? payload.rows
            .map((r) => ({
              name: String(r?.name || '').trim(),
              status: String(r?.status || '').trim(),
              action: String(r?.action || '').trim(),
            }))
            .filter((r) => !!r.name)
        : prev.rows,
    }));
  }, []);

  const mapJobType = useCallback((name: string): ActivityJob['type'] => {
    const n = name.toLowerCase();
    if (n.includes('mp4') || n.includes('batch') || n.includes('generator') || n.includes('concat') || n.includes('convert') || n.includes('transcode')) return 'Converted';
    if (n.includes('stem') || n.includes('separate') || n.includes('vocal') || n.includes('instrumental')) return 'Separated';
    if (n.includes('bpm') || n.includes('key') || n.includes('analyz')) return 'Analyzed';
    return 'Downloaded';
  }, []);

  // Boot sequence: hide splash once app state is hydrated (no fixed long delay).
  useEffect(() => {
    if (!isHydrated) return;
    const raf = window.requestAnimationFrame(() => setIsBooting(false));
    return () => window.cancelAnimationFrame(raf);
  }, [isHydrated]);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Performance Mode effect
  useEffect(() => {
    const root = document.documentElement;
    if (settings.isPerformanceMode) root.classList.add('perf-mode');
    else root.classList.remove('perf-mode');
    
    if (settings.reduceMotion) root.classList.add('reduce-motion');
    else root.classList.remove('reduce-motion');

    if (settings.lowRamMode) root.classList.add('low-ram');
    else root.classList.remove('low-ram');
  }, [settings.isPerformanceMode, settings.reduceMotion, settings.lowRamMode]);

  // Keyboard Shortcuts (Global)
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDarkMode(prev => !prev);
      }
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, isPerformanceMode: !prev.isPerformanceMode }));
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  // Bridge readiness: Qt injects pyBridge asynchronously in WebEngine.
  // Trigger re-hydration and persistence when bridge becomes available.
  useEffect(() => {
    const onReady = () => setBridgeReadyTick((v) => v + 1);
    window.addEventListener('py-bridge-ready', onReady as EventListener);
    return () => window.removeEventListener('py-bridge-ready', onReady as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      if (cancelFallbackTimerRef.current) {
        window.clearTimeout(cancelFallbackTimerRef.current);
      }
      stopStartupStageTicker();
    };
  }, [stopStartupStageTicker]);

  // Fallback for missed bridge-ready event timing:
  // if Qt injects bridge before this listener is attached, poll briefly.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const maxTries = 30; // ~6s at 200ms
    const timer = window.setInterval(() => {
      if (cancelled) return;
      tries += 1;
      if (window.pyBridge?.bridgeCommand) {
        setBridgeReadyTick((v) => v + 1);
        window.clearInterval(timer);
        return;
      }
      if (tries >= maxTries) {
        window.clearInterval(timer);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleClearJobs = useCallback(() => setJobs([]), []);
  const handleLogout = useCallback(() => {
    console.log('[auth] setIsLoggedIn(false) reason=logout');
    setIsLoggedIn(false);
    setLoginEmail('');
    try {
      window.localStorage.removeItem('dj_login_email');
      window.localStorage.removeItem('dj_login_active');
    } catch {}
    const bridge = window.pyBridge;
    if (bridge?.bridgeCommand) {
      try {
        bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.save_settings',
          payload: {
            mp3OutputPath: settings.mp3OutputPath || '',
            mp4OutputPath: settings.mp4OutputPath || '',
            defaultVideoQuality: settings.defaultVideoQuality || '1080p',
            tiktokWatermark: settings.tiktokWatermark,
            loginEmail: '',
          },
        }));
      } catch (err) {
        console.error('Failed to persist logout state:', err);
      }
    }
  }, [settings.mp3OutputPath, settings.mp4OutputPath, settings.defaultVideoQuality, settings.tiktokWatermark]);

  const handleCancelTask = useCallback(() => {
    stopStartupStageTicker();
    awaitingRunStartRef.current = false;
    cancelRequestedRef.current = true;
    if (cancelFallbackTimerRef.current) {
      window.clearTimeout(cancelFallbackTimerRef.current);
    }
    cancelFallbackTimerRef.current = window.setTimeout(() => {
      setCurrentTask(null);
      cancelRequestedRef.current = false;
      cancelFallbackTimerRef.current = null;
    }, 3000);
    setCurrentTask({
      name: 'Canceling...',
      progress: currentTask?.progress ?? 0,
      timeRemaining: '--:--',
      status: 'running',
    });
    const bridge = window.pyBridge;
    if (bridge?.bridgeCommand) {
      try {
        bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'toolkit.stop',
          payload: {},
        }));
      } catch (err) {
        console.error('Failed to stop toolkit:', err);
        setCurrentTask(null);
      }
      return;
    }
    if (bridge?.stopToolkit) {
      try {
        bridge.stopToolkit();
      } catch (err) {
        console.error('Failed to stop toolkit:', err);
      }
    }
    if (cancelFallbackTimerRef.current) {
      window.clearTimeout(cancelFallbackTimerRef.current);
      cancelFallbackTimerRef.current = null;
    }
    setCurrentTask(null);
    cancelRequestedRef.current = false;
  }, [currentTask, stopStartupStageTicker]);

  const handleAddTask = useCallback((name: string) => {
    setCurrentTask({ name, progress: 0, timeRemaining: '--', status: 'running', itemIndex: 1, itemTotal: 1 });
  }, []);

  const handleToastClose = useCallback((id: string) => {
    setActiveToast((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleOpenJobFolder = useCallback((job: ActivityJob) => {
    const target = String(job.outputPath || '').trim();
    if (target) {
      try {
        const normalized = target.replace(/\\/g, '/');
        const opened = window.open(`file:///${normalized}`, '_blank', 'noopener,noreferrer');
        if (opened) return;
      } catch (err) {
        console.warn('Failed to open file location:', err);
      }
    }
    setActiveToast({
      id: `open-folder-${Date.now()}`,
      title: 'Folder Access Unavailable',
      message: 'This desktop build has no open-folder bridge command yet.',
      type: 'info',
    });
  }, []);

  const handleRunToolkit = useCallback((option: string, payload: Record<string, unknown>, taskName: string) => {
    const bridge = window.pyBridge;
    if (!bridge) {
      handleAddTask(taskName);
      return false;
    }
    try {
      if (typeof bridge.bridgeCommand === 'function') {
        const req = {
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'toolkit.run_option',
          payload: { option: String(option), payload: payload ?? {} },
        };
        // Fire-and-forget: some bridge builds return empty/non-JSON payloads
        // even when dispatch succeeds.
        bridge.bridgeCommand(JSON.stringify(req));
        lastStatusRef.current = null;
        awaitingRunStartRef.current = true;
        startStartupStageTicker(taskName);
        return true;
      }
      if (typeof bridge.runToolkitOption === 'function') {
        bridge.runToolkitOption(String(option), JSON.stringify(payload ?? {}));
        lastStatusRef.current = null;
        awaitingRunStartRef.current = true;
        startStartupStageTicker(taskName);
        return true;
      }
    } catch (err) {
      console.error('Bridge error:', err);
    }
    handleAddTask(taskName);
    return false;
  }, [handleAddTask, startStartupStageTicker]);

  useEffect(() => {
    if (!authHydratedFromBackend.current) return;
    const backendLogin = String(backendHydratedLoginRef.current || '').trim();
    if (!backendLogin) {
      authStartupSaveUnlockedRef.current = true;
      return;
    }
    if (String(loginEmail || '').trim().toLowerCase() === backendLogin.toLowerCase()) {
      authStartupSaveUnlockedRef.current = true;
    }
  }, [loginEmail]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!didInitialHydrate.current) return;
    if (!authHydratedFromBackend.current) return;
    if (!settingsHydratedFromBackend.current) return;
    if (!authStartupSaveUnlockedRef.current) return;
    const bridge = window.pyBridge;
    if (!bridge?.bridgeCommand) return;
    const backendLogin = String(backendHydratedLoginRef.current || '').trim();
    if (backendLogin && !String(loginEmail || '').trim()) {
      return;
    }
    if (saveSettingsTimer.current) {
      window.clearTimeout(saveSettingsTimer.current);
    }
    saveSettingsTimer.current = window.setTimeout(() => {
      try {
        bridge.bridgeCommand(JSON.stringify({
          version: '1.0',
          requestId: `${Date.now()}`,
          command: 'system.save_settings',
          payload: {
            mp3OutputPath: settings.mp3OutputPath || '',
            mp4OutputPath: settings.mp4OutputPath || '',
            defaultVideoQuality: settings.defaultVideoQuality || '1080p',
            tiktokWatermark: settings.tiktokWatermark,
            loginEmail: loginEmail || '',
          },
        }));
      } catch (err) {
        console.error('Failed to persist settings:', err);
      }
    }, 250);
    return () => {
      if (saveSettingsTimer.current) {
        window.clearTimeout(saveSettingsTimer.current);
      }
    };
  }, [settings.mp3OutputPath, settings.mp4OutputPath, settings.defaultVideoQuality, settings.tiktokWatermark, loginEmail, bridgeReadyTick, isHydrated]);

  useEffect(() => {
    const bridge = window.pyBridge;
    if (!bridge?.bridgeCommand) {
      console.log('[auth] bridge not ready yet; waiting for backend hydration', { bridgeReadyTick });
      return;
    }
    try {
      const raw = bridge.bridgeCommand(JSON.stringify({
        version: '1.0',
        requestId: `${Date.now()}`,
        command: 'system.get_state',
        payload: {},
      }));
      const parsed: BridgeResponse = raw ? JSON.parse(raw) : {};
      const data = unwrapBridgeData(parsed);
      const settingsPayload = (data.settings || {}) as Record<string, unknown>;
      console.log('[auth] system.get_state returned loginEmail:', String(settingsPayload.loginEmail ?? '').trim() || '(empty)');
      authHydratedFromBackend.current = true;
      authStartupSaveUnlockedRef.current = false;
      settingsHydratedFromBackend.current = false;
      setSettings(prev => ({
        ...prev,
        mp3OutputPath: String(settingsPayload.mp3OutputPath ?? prev.mp3OutputPath ?? ''),
        mp4OutputPath: String(settingsPayload.mp4OutputPath ?? prev.mp4OutputPath ?? ''),
        defaultVideoQuality: String(settingsPayload.defaultVideoQuality ?? prev.defaultVideoQuality ?? '1080p') as AppSettings['defaultVideoQuality'],
        tiktokWatermark: Boolean(settingsPayload.tiktokWatermark ?? prev.tiktokWatermark ?? false),
      }));
      window.setTimeout(() => {
        settingsHydratedFromBackend.current = true;
      }, 0);
      const storedLoginEmail = String(settingsPayload.loginEmail ?? '').trim();
      backendHydratedLoginRef.current = storedLoginEmail;
      if (storedLoginEmail) {
        console.log('[auth] setIsLoggedIn(true) reason=backend_hydration');
        setLoginEmail(storedLoginEmail);
        setIsLoggedIn(true);
        try {
          window.localStorage.setItem('dj_login_email', storedLoginEmail);
          window.localStorage.setItem('dj_login_active', '1');
        } catch {}
      } else {
        console.log('[auth] setIsLoggedIn(false) reason=backend_hydration_empty_login');
        setLoginEmail('');
        setIsLoggedIn(false);
      }
      console.log('[auth] hydration complete (backend), loginEmail:', storedLoginEmail || '(empty)');
      mergeCopyrightPayload((data as any).copyright);
    } catch (err) {
      console.error('Failed to hydrate state from bridge:', err);
      try {
        const localLogin = String(window.localStorage.getItem('dj_login_email') || '').trim();
        const localActive = String(window.localStorage.getItem('dj_login_active') || '').trim() === '1';
        if (localActive && localLogin) {
          console.log('[auth] setIsLoggedIn(true) reason=local_fallback_after_bridge_error');
          setLoginEmail(localLogin);
          setIsLoggedIn(true);
        } else {
          console.log('[auth] setIsLoggedIn(false) reason=local_fallback_after_bridge_error');
          setLoginEmail('');
          setIsLoggedIn(false);
        }
      } catch {}
    } finally {
      didInitialHydrate.current = true;
      setIsHydrated(true);
      console.log('[auth] hydration finalized');
    }
  }, [mergeCopyrightPayload, unwrapBridgeData, bridgeReadyTick]);

  useEffect(() => {
    if (isHydrated) return;
    const t = window.setTimeout(() => {
      if (!didInitialHydrate.current) {
        console.warn('[auth] hydration timeout fallback triggered; rendering app with current state.');
      }
      setIsHydrated(true);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [isHydrated]);

  useEffect(() => {
    const onStatus = (evt: Event) => {
      const detail = (evt as CustomEvent<ToolkitStatus>).detail || {};
      const data = detail.data || {};
      const job = data.job || {};
      const metrics = data.metrics || {};
      const output = data.output || {};
      const eventSettings = data.settings || {};
      const copyright = data.copyright || {};
      const running = !!job.running;
      const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
      const sourceTitle = String(output.sourceTitle || '').trim();
      const sourceFile = String(output.fileName || '').trim();
      const sourceUrl = String(output.sourceUrl || '').trim();
      const analysisResult = (output.analysisResult || {}) as Record<string, unknown>;
      const analysisSourceName = String(analysisResult.filename || '').trim();
      const jobName = String(job.name || '').trim();
      const optionId = String(job.option || '').trim();
      const taskName = (optionId === '15' ? (analysisSourceName || jobName || 'Track Analysis Suite') : (sourceFile || sourceTitle || jobName || (sourceUrl ? 'Fetching media info…' : 'Processing'))).trim();
      const stateText = String(job.state || '').toLowerCase();
      const itemIndexRaw = Number(job.currentIndex || 0);
      const itemTotalRaw = Number(job.totalItems || 0);
      const itemIndex = Number.isFinite(itemIndexRaw) && itemIndexRaw > 0 ? itemIndexRaw : 1;
      const itemTotal = Number.isFinite(itemTotalRaw) && itemTotalRaw > 0 ? itemTotalRaw : 1;

      const mp3FromEvent = String(eventSettings.mp3OutputPath || '').trim();
      const mp4FromEvent = String(eventSettings.mp4OutputPath || '').trim();
      const qualityFromEvent = String(eventSettings.defaultVideoQuality || '').trim();
      const tiktokWmFromEvent = eventSettings.tiktokWatermark;
      const loginEmailFromEvent = String(eventSettings.loginEmail || '').trim();
      if (mp3FromEvent || mp4FromEvent || qualityFromEvent || typeof tiktokWmFromEvent === 'boolean') {
        setSettings(prev => ({
          ...prev,
          mp3OutputPath: mp3FromEvent || prev.mp3OutputPath,
          mp4OutputPath: mp4FromEvent || prev.mp4OutputPath,
          defaultVideoQuality: (qualityFromEvent || prev.defaultVideoQuality) as AppSettings['defaultVideoQuality'],
          tiktokWatermark: typeof tiktokWmFromEvent === 'boolean' ? tiktokWmFromEvent : prev.tiktokWatermark,
        }));
      }
      if (loginEmailFromEvent) {
        console.log('[auth] setIsLoggedIn(true) reason=status_event_loginEmail');
        setLoginEmail(loginEmailFromEvent);
        setIsLoggedIn(true);
        try {
          window.localStorage.setItem('dj_login_email', loginEmailFromEvent);
          window.localStorage.setItem('dj_login_active', '1');
        } catch {}
      }
      mergeCopyrightPayload(copyright as ToolkitStatus['data']['copyright']);

      const etaRaw = String(metrics.etaText || '').trim();
      const etaForUi = /\d/.test(etaRaw) ? etaRaw : '--';
      if (running) {
        stopStartupStageTicker();
        awaitingRunStartRef.current = false;
        if (cancelRequestedRef.current) {
          if (cancelFallbackTimerRef.current) {
            window.clearTimeout(cancelFallbackTimerRef.current);
            cancelFallbackTimerRef.current = null;
          }
          cancelRequestedRef.current = false;
        }
        const st: 'running' | 'completed' | 'failed' = stateText.includes('error') ? 'failed' : (running ? 'running' : 'completed');
        setCurrentTask({
          name: taskName,
          progress,
          timeRemaining: etaForUi,
          status: st,
          itemIndex,
          itemTotal,
        });
      }

      if (awaitingRunStartRef.current && !running) {
        lastStatusRef.current = detail;
        return;
      }
      const prev = lastStatusRef.current;
      const wasRunning = !!prev?.data?.job?.running;
      const terminalByState = stateText.includes('completed') || stateText.includes('error') || stateText.includes('fail') || stateText.includes('cancel') || stateText.includes('stop');
      const terminalByOutput = !!String(output.filePath || output.folderPath || '').trim();
      const terminalByMessage = /finished|completed|done|success|failed|error|stopped|cancelled|canceled/i.test(String(data.message || ''));
      const justFinished = wasRunning && !running && (terminalByState || terminalByOutput || terminalByMessage || progress >= 100);
      if (cancelRequestedRef.current && !running) {
        if (cancelFallbackTimerRef.current) {
          window.clearTimeout(cancelFallbackTimerRef.current);
          cancelFallbackTimerRef.current = null;
        }
        setCurrentTask(null);
        cancelRequestedRef.current = false;
        lastStatusRef.current = detail;
        return;
      }
      if (justFinished) {
        stopStartupStageTicker();
        awaitingRunStartRef.current = false;
        const messageText = String(data.message || '').toLowerCase();
        const explicitOutputPath = String(output.filePath || output.folderPath || '').trim();
        const rawAnalysis = (output.analysisResult || {}) as Record<string, unknown>;
        const analysisResult: AnalysisResultData | undefined = rawAnalysis && Object.keys(rawAnalysis).length > 0 ? {
          filename: String(rawAnalysis.filename || taskName || sourceFile || '').trim(),
          musicalKey: String(rawAnalysis.musicalKey || '').trim(),
          camelotKey: String(rawAnalysis.key || rawAnalysis.camelotKey || '').trim(),
          bpm: String(rawAnalysis.bpm || '--').trim() || '--',
        } : undefined;
        const isErrorState = stateText.includes('error') || stateText.includes('fail');
        const isSuccessState = stateText.includes('completed') || progress >= 100;
        const isSkipSuccess = messageText.includes('already exists') || messageText.includes('already downloaded') || messageText.includes('skipped');
        const ok = !isErrorState && (isSuccessState || isSkipSuccess || !!explicitOutputPath);
        const sourceExt = String(sourceFile.split('.').pop() || '').trim().toLowerCase();
        const useAudioFolder = ['mp3', 'wav', 'flac', 'aac'].includes(sourceExt);
        const outputPath = explicitOutputPath || (useAudioFolder ? String(eventSettings.mp3OutputPath || '').trim() : String(eventSettings.mp4OutputPath || '').trim());
        const newJob: ActivityJob = {
          id: `${Date.now()}`,
          name: taskName || 'Toolkit job',
          type: mapJobType(taskName || 'Toolkit job'),
          timestamp: 'Just now',
          status: ok ? 'completed' : 'failed',
          outputPath,
          outputFileName: sourceFile || undefined,
          optionId,
          analysisResult,
        };
        setJobs(old => [newJob, ...old.slice(0, 29)]);
        setActiveToast({
          id: `toast-${Date.now()}`,
          title: ok ? 'Job Complete' : 'Job Failed',
          message: ok ? `${newJob.name} finished successfully.` : `${newJob.name} finished with an error.`,
          type: ok ? 'success' : 'error',
        });
        if (ok) {
          setCurrentTask({ name: taskName, progress: 100, timeRemaining: '00:00', status: 'completed' });
          window.setTimeout(() => setCurrentTask(null), 5000);
        } else {
          setCurrentTask({ name: String(data.message || 'Task failed'), progress: Math.max(1, progress), timeRemaining: '--:--', status: 'failed' });
        }
      }
      lastStatusRef.current = detail;
    };
    window.addEventListener('djtoolkit:v1:event', onStatus as EventListener);
    return () => window.removeEventListener('djtoolkit:v1:event', onStatus as EventListener);
  }, [mapJobType, mergeCopyrightPayload, stopStartupStageTicker]);

  const handleCopyrightScan = useCallback(() => {
    const bridge = window.pyBridge;
    try {
      if (bridge?.scanCopyright) {
        bridge.scanCopyright();
      }
    } catch (err) {
      console.error('Failed to trigger copyright scan:', err);
    }
  }, []);

  const handlePreviewJob = useCallback((job: ActivityJob) => {
    setPreviewJob(job);
  }, []);

  const showActivitySidebar = activeTab !== NavItem.Copyright && activeTab !== NavItem.Settings;

  if (isBooting) {
    return (
      <div className="h-screen w-screen bg-background-dark flex flex-col items-center justify-center gap-8">
        <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/40 splash-logo">
          <span className="material-symbols-outlined text-white text-5xl">graphic_eq</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-white font-black uppercase tracking-[0.5em] text-sm">DJ Toolkit Pro</h1>
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[loading_2.5s_ease-in-out_infinite]"></div>
          </div>
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-2">Initializing Neural Engine...</p>
        </div>
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  const hasPersistedLogin = String(loginEmail || '').trim().length > 0;
  if (!hasPersistedLogin && !isLoggedIn) {
    return (
      <LoginView
        onLogin={({ email }) => {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          console.log('[auth] setIsLoggedIn(true) reason=user_login_submit');
          setLoginEmail(normalizedEmail);
          setIsLoggedIn(true);
          try {
            window.localStorage.setItem('dj_login_email', normalizedEmail);
            window.localStorage.setItem('dj_login_active', '1');
          } catch {}
          const bridge = window.pyBridge;
          if (bridge?.bridgeCommand && normalizedEmail) {
            try {
              bridge.bridgeCommand(JSON.stringify({
                version: '1.0',
                requestId: `${Date.now()}`,
                command: 'system.save_settings',
                payload: {
                  mp3OutputPath: settings.mp3OutputPath || '',
                  mp4OutputPath: settings.mp4OutputPath || '',
                  defaultVideoQuality: settings.defaultVideoQuality || '1080p',
                  tiktokWatermark: settings.tiktokWatermark,
                  loginEmail: normalizedEmail,
                },
              }));
            } catch (err) {
              console.error('Failed to persist login state:', err);
            }
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark transition-colors duration-500 overflow-hidden font-display">
      <div className="flex flex-1 min-h-0 overflow-visible">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} plan={usageStats.plan} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <Header onSearch={() => {}} settings={settings} activeTab={activeTab} onTabChange={setActiveTab} jobs={jobs} onLogout={handleLogout} plan={usageStats.plan} />
          <main className="flex-1 overflow-y-auto custom-scrollbar relative">
            <MainContent 
              activeTab={activeTab} 
              onTabChange={setActiveTab}
              onAddTask={handleAddTask}
              onRunToolkit={handleRunToolkit}
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              settings={settings}
              setSettings={setSettings}
              copyrightState={copyrightState}
              onScanCopyright={handleCopyrightScan}
              currentTask={currentTask}
              jobs={jobs}
              usageStats={usageStats}
              onOpenJobFolder={handleOpenJobFolder}
              previewJob={previewJob}
              onPreviewHandled={() => setPreviewJob(null)}
            />
          </main>
        </div>

        {showActivitySidebar && (
          <ActivitySidebar 
            currentTask={currentTask}
            recentJobs={jobs}
            onClearJobs={handleClearJobs}
            onCancelTask={handleCancelTask}
            performanceMode={settings.isPerformanceMode}
            onPreviewJob={handlePreviewJob}
          />
        )}
              {activeToast && (
          <ToastNotification
            notification={activeToast}
            onClose={handleToastClose}
            onView={() => setActiveTab(NavItem.History)}
          />
        )}
      </div>

      <footer className="h-8 flex-shrink-0 bg-white dark:bg-rail-dark border-t border-slate-200 dark:border-white/5 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Engine Active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[10px] text-slate-500">database</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Database V3.0.1</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">CPU: 12%</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">RAM: 1.4GB</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Win11 Pro</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;





