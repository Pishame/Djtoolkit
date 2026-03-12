import React, { useMemo, useState } from 'react';
import { apiSpotifyLookup, apiSpotifySearch, ENABLE_SERVER_SPOTIFY } from '../lib/apiClient';

interface SpotifyArtViewProps {
  performanceMode?: boolean;
  onAddTask?: (name: string) => void;
}

interface TrackRow {
  id: string;
  fileName: string;
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error';
  artUrl?: string;
  artist?: string;
  album?: string;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitize = (name: string) => String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'artwork';

const spotifyAlbumRegex = /spotify\.com\/album\/([a-zA-Z0-9]+)/i;
const spotifyTrackRegex = /spotify\.com\/track\/([a-zA-Z0-9]+)/i;

const SpotifyArtView: React.FC<SpotifyArtViewProps> = ({ performanceMode, onAddTask }) => {
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [banner, setBanner] = useState('');

  const foundCount = useMemo(() => tracks.filter((t) => t.status === 'found' && t.artUrl).length, [tracks]);

  const updateTrack = (id: string, patch: Partial<TrackRow>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const resolveArt = async (value: string): Promise<{ artUrl?: string; album?: string; artist?: string }> => {
    const albumMatch = value.match(spotifyAlbumRegex);
    if (albumMatch) {
      const data = await apiSpotifyLookup(albumMatch[1], 'album');
      const images = (data as any)?.images as Array<{ url?: string }> | undefined;
      return {
        artUrl: images?.[0]?.url,
        album: String((data as any)?.name || 'Album Link'),
        artist: String((data as any)?.artists?.[0]?.name || ''),
      };
    }
    const trackMatch = value.match(spotifyTrackRegex);
    if (trackMatch) {
      const data = await apiSpotifyLookup(trackMatch[1], 'track');
      const images = (data as any)?.album?.images as Array<{ url?: string }> | undefined;
      return {
        artUrl: images?.[0]?.url,
        album: String((data as any)?.album?.name || 'Track Link'),
        artist: String((data as any)?.artists?.[0]?.name || ''),
      };
    }
    const data = await apiSpotifySearch(value, 'album');
    const first = (data as any)?.albums?.items?.[0];
    return {
      artUrl: first?.images?.[0]?.url,
      album: String(first?.name || value),
      artist: String(first?.artists?.[0]?.name || ''),
    };
  };

  const processRows = async (rows: TrackRow[]) => {
    if (!ENABLE_SERVER_SPOTIFY) {
      setBanner('Server Spotify mode is disabled. Enable VITE_ENABLE_SERVER_SPOTIFY=1.');
      return;
    }
    setBanner('');
    setIsProcessing(true);
    try {
      await Promise.all(
        rows.map(async (row) => {
          updateTrack(row.id, { status: 'searching' });
          try {
            const result = await resolveArt(row.fileName);
            updateTrack(row.id, {
              status: result.artUrl ? 'found' : 'not_found',
              artUrl: result.artUrl,
              album: result.album,
              artist: result.artist,
            });
          } catch {
            updateTrack(row.id, { status: 'error' });
          }
        })
      );
      onAddTask?.(`Spotify Art Fetch: ${rows.length} items`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSmartInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = String(inputValue || '').trim();
    if (!raw) return;
    const items = raw
      .split(/[\n,;]|\s{2,}/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const rows: TrackRow[] = items.map((item) => ({
      id: uid(),
      fileName: item,
      status: 'pending',
    }));
    setTracks((prev) => [...rows, ...prev]);
    setInputValue('');
    await processRows(rows);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const rows: TrackRow[] = files.map((f) => ({
      id: uid(),
      fileName: f.name.replace(/\.[^/.]+$/, ''),
      status: 'pending',
    }));
    setTracks((prev) => [...rows, ...prev]);
    await processRows(rows);
  };

  const downloadOne = async (url: string, name: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${sanitize(name)}_cover.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const downloadAll = async () => {
    const rows = tracks.filter((t) => t.status === 'found' && t.artUrl);
    if (!rows.length) return;
    setIsProcessing(true);
    try {
      for (const row of rows) {
        await downloadOne(String(row.artUrl), row.album || row.fileName);
      }
      onAddTask?.(`Spotify Art: Downloaded ${rows.length} covers`);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    setTracks([]);
    setBanner('');
    setIsProcessing(false);
  };

  return (
    <div className={`p-8 lg:p-12 max-w-[1400px] mx-auto space-y-10 pb-24 ${performanceMode ? '' : 'animate-[fadeIn_0.5s_ease-out]'}`}>
      <div className="flex items-center justify-between px-4">
        <div>
          <h1 className="text-4xl font-black dark:text-white uppercase tracking-tighter">Spotify Art Extractor</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Extract high-resolution album covers from files, search queries, or Spotify links.
          </p>
        </div>
        {tracks.length > 0 && (
          <div className="flex items-center gap-4">
            {foundCount > 0 && (
              <button
                onClick={downloadAll}
                disabled={isProcessing}
                className="px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-3 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">download_for_offline</span>
                Download All ({foundCount})
              </button>
            )}
            <button
              onClick={clearAll}
              className="px-8 py-4 bg-primary/10 text-primary border border-primary/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-3"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Clear All
            </button>
          </div>
        )}
      </div>

      {banner && (
        <div className="mx-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-red-400">
          {banner}
        </div>
      )}

      <div className="px-4">
        <form onSubmit={handleSmartInput} className="relative group">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search multiple albums, artists, or paste Spotify links (separated by commas or newlines)..."
            className="w-full bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 rounded-3xl px-8 py-6 text-lg font-bold dark:text-white placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all outline-none"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputValue.trim()}
            className="absolute right-4 top-1/2 -translate-y-1/2 px-8 py-3 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
          >
            {isProcessing ? 'Processing...' : 'Search / Fetch'}
          </button>
        </form>
      </div>

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] border-4 border-dashed border-slate-200 dark:border-white/10 rounded-[4rem] bg-white/5 group hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden">
          <input
            type="file"
            multiple
            accept="audio/*"
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
            onChange={handleFileSelect}
          />
          <div className="w-28 h-28 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
            <span className="material-symbols-outlined text-6xl">album</span>
          </div>
          <div className="text-center space-y-3 mt-8">
            <h2 className="text-3xl font-black uppercase tracking-tighter dark:text-white">Drop Audio Files</h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              We will use filename and query matching to fetch high-res Spotify artwork.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-xl group animate-[fadeIn_0.25s_ease-out]"
            >
              <div className="aspect-square bg-slate-100 dark:bg-white/5 relative overflow-hidden">
                {track.status === 'searching' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Searching Spotify...</span>
                  </div>
                )}
                {track.status === 'found' && track.artUrl && (
                  <>
                    <img
                      src={track.artUrl}
                      alt={track.album || track.fileName}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => void downloadOne(String(track.artUrl), track.album || track.fileName)}
                        className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-primary shadow-2xl hover:scale-110 active:scale-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-3xl">download</span>
                      </button>
                    </div>
                  </>
                )}
                {track.status === 'not_found' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                    <span className="material-symbols-outlined text-5xl">sentiment_dissatisfied</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">No Artwork Found</span>
                  </div>
                )}
                {track.status === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-red-500">
                    <span className="material-symbols-outlined text-5xl">error</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">Lookup Error</span>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-1">
                <h3 className="text-sm font-black dark:text-white uppercase tracking-tight truncate">{track.album || track.fileName}</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{track.artist || 'Unknown Artist'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpotifyArtView;
