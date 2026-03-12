export enum NavItem {
  Toolkit = 'Toolkit',
  Copyright = 'Copyright',
  Music = 'Music',
  SpotifyArt = 'Spotify Art',
  History = 'History',
  Settings = 'Settings',
  Profile = 'Profile'
}

export type UserPlan = 'free' | 'premium';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

export interface AnalysisResultData {
  filename: string;
  musicalKey: string;
  camelotKey: string;
  bpm: string;
}

export interface ActivityJob {
  id: string;
  name: string;
  type: 'Converted' | 'Downloaded' | 'Separated' | 'Analyzed';
  timestamp: string;
  status: 'completed' | 'failed';
  outputPath?: string;
  outputFileName?: string;
  optionId?: string;
  analysisResult?: AnalysisResultData;
}

export interface CurrentTask {
  name: string;
  progress: number;
  timeRemaining: string;
  status?: 'running' | 'completed' | 'failed';
  itemIndex?: number;
  itemTotal?: number;
}

export interface AppSettings {
  enableExtraFormats: boolean;
  defaultVideoQuality: '720p' | '1080p' | '1440p' | '4K';
  tiktokWatermark: boolean;
  mp3OutputPath: string;
  mp4OutputPath: string;
  isPerformanceMode: boolean;
  reduceMotion: boolean;
  lowRamMode: boolean;
  autoPurgeCache: boolean;
}

export interface UsageStats {
  plan: UserPlan;
  youtubeRemaining: number;
  youtubeDailyLimit: number;
  tiktokRemaining: number;
  tiktokDailyLimit: number;
  copyrightScanSongLimit: number;
}

