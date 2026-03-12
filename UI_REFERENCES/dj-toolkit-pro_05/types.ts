
export enum NavItem {
  Toolkit = 'Toolkit',
  Copyright = 'Copyright',
  Music = 'Music',
  SpotifyArt = 'SpotifyArt',
  History = 'History',
  Settings = 'Settings',
  Profile = 'Profile'
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'success' | 'info' | 'error';
}

export interface ActivityJob {
  id: string;
  name: string;
  type: 'Converted' | 'Downloaded' | 'Separated' | 'Analyzed';
  timestamp: string;
  status: 'completed' | 'failed';
  processingTime?: string;
  inputPath?: string;
  outputPath?: string;
  parameters?: string[];
}

export interface CurrentTask {
  name: string;
  progress: number;
  timeRemaining: string;
  isPlaylist?: boolean;
  stems?: string[];
}

export interface AppSettings {
  enableExtraFormats: boolean;
  defaultVideoQuality: '720p' | '1080p' | '4K';
  mp3OutputPath: string;
  mp4OutputPath: string;
  globalOutputPath: string;
  isPerformanceMode: boolean;
  reduceMotion: boolean;
  lowRamMode: boolean;
  autoPurgeCache: boolean;
  enableCookieSupport: boolean;
  enableNotifications: boolean;
}

export interface UsageStats {
  youtubeDownloads: number;
  tiktokDownloads: number;
  copyrightScans: number;
  isPremium: boolean;
}
