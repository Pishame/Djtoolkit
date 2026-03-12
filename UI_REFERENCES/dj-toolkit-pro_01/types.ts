
export enum NavItem {
  Toolkit = 'Toolkit',
  Copyright = 'Copyright',
  Music = 'Music',
  History = 'History',
  Settings = 'Settings',
  Profile = 'Profile'
}

export interface ActivityJob {
  id: string;
  name: string;
  type: 'Converted' | 'Downloaded' | 'Separated' | 'Analyzed';
  timestamp: string;
  status: 'completed' | 'failed';
}

export interface CurrentTask {
  name: string;
  progress: number;
  timeRemaining: string;
}

export interface AppSettings {
  enableExtraFormats: boolean;
  defaultVideoQuality: '720p' | '1080p' | '4K';
  mp3OutputPath: string;
  mp4OutputPath: string;
  isPerformanceMode: boolean;
  reduceMotion: boolean;
  lowRamMode: boolean;
  autoPurgeCache: boolean;
}
