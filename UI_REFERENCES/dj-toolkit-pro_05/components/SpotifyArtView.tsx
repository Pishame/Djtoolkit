
import React, { useState, useCallback } from 'react';
import * as mm from 'music-metadata-browser';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface SpotifyArtViewProps {
  performanceMode?: boolean;
  onAddTask?: (name: string) => void;
}

interface TrackMetadata {
  id: string;
  fileName: string;
  title?: string;
  artist?: string;
  album?: string;
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error';
  artUrl?: string;
}

const SpotifyArtView: React.FC<SpotifyArtViewProps> = ({ performanceMode, onAddTask }) => {
  const [tracks, setTracks] = useState<TrackMetadata[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const getSpotifyToken = async () => {
    const res = await fetch('/api/spotify/token');
    const data = await res.json();
    return data.access_token;
  };

  const searchSpotifyAlbum = async (query: string, token: string) => {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&type=album&token=${token}`);
    const data = await res.json();
    return data.albums?.items?.[0]?.images?.[0]?.url;
  };

  const lookupSpotifyId = async (id: string, type: 'album' | 'track', token: string) => {
    const res = await fetch(`/api/spotify/lookup?id=${id}&type=${type}&token=${token}`);
    const data = await res.json();
    if (type === 'album') {
      return data.images?.[0]?.url;
    } else {
      return data.album?.images?.[0]?.url;
    }
  };

  const handleSmartInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Split by newlines, commas, or multiple spaces
    const inputs = inputValue.split(/[\n,;]|\s{2,}/).map(i => i.trim()).filter(i => i);
    if (inputs.length === 0) return;

    setIsProcessing(true);
    try {
      const token = await getSpotifyToken();
      if (!token) throw new Error("Could not get Spotify token");

      const newTracks: TrackMetadata[] = inputs.map(input => ({
        id: Math.random().toString(36).substr(2, 9),
        fileName: input,
        status: 'searching'
      }));

      setTracks(prev => [...newTracks, ...prev]);
      setInputValue('');

      // Process in parallel
      await Promise.all(newTracks.map(async (track) => {
        try {
          const albumMatch = track.fileName.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
          const trackMatch = track.fileName.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);

          let artUrl: string | undefined;
          let label = track.fileName;

          if (albumMatch) {
            artUrl = await lookupSpotifyId(albumMatch[1], 'album', token);
            label = 'Album Link';
          } else if (trackMatch) {
            artUrl = await lookupSpotifyId(trackMatch[1], 'track', token);
            label = 'Track Link';
          } else {
            artUrl = await searchSpotifyAlbum(track.fileName, token);
          }

          setTracks(prev => prev.map(t => 
            t.id === track.id 
              ? { ...t, status: artUrl ? 'found' : 'not_found', artUrl, album: artUrl ? (albumMatch ? 'Album Link' : trackMatch ? 'Track Link' : track.fileName) : track.fileName } 
              : t
          ));
        } catch (err) {
          setTracks(prev => prev.map(t => t.id === track.id ? { ...t, status: 'error' } : t));
        }
      }));

      onAddTask?.(`Spotify Art Fetch: ${inputs.length} items`);
    } catch (err) {
      console.error("Smart input error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsProcessing(true);
    const newTracks: TrackMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const metadata = await mm.parseBlob(file);
        newTracks.push({
          id: Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          title: metadata.common.title,
          artist: metadata.common.artist,
          album: metadata.common.album,
          status: 'pending'
        });
      } catch (err) {
        console.error("Metadata extraction error:", err);
        newTracks.push({
          id: Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          status: 'error'
        });
      }
    }

    setTracks(newTracks);
    setIsProcessing(false);
    
    if (newTracks.length > 0) {
      processBatch(newTracks);
    }
  };

  const processBatch = async (batch: TrackMetadata[]) => {
    try {
      const token = await getSpotifyToken();
      if (!token) throw new Error("Could not get Spotify token");

      // Update all to searching status first
      setTracks(prev => prev.map(t => {
        const match = batch.find(b => b.id === t.id);
        return match && match.status !== 'error' ? { ...t, status: 'searching' } : t;
      }));

      // Process in parallel with a small concurrency limit if needed, but here we just go for it
      await Promise.all(batch.map(async (track) => {
        if (track.status === 'error') return;

        const query = track.album && track.artist ? `${track.album} ${track.artist}` : track.fileName.replace(/\.[^/.]+$/, "");
        const artUrl = await searchSpotifyAlbum(query, token);

        setTracks(prev => prev.map(t => 
          t.id === track.id 
            ? { ...t, status: artUrl ? 'found' : 'not_found', artUrl } 
            : t
        ));
      }));
      
      onAddTask?.(`Spotify Art Extraction: Batch Complete`);
    } catch (err) {
      console.error("Batch processing error:", err);
    }
  };

  const downloadArt = (url: string, name: string) => {
    saveAs(url, `${name.replace(/[/\\?%*:|"<>]/g, '-')}_cover.jpg`);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const foundTracks = tracks.filter(t => t.status === 'found' && t.artUrl);
    
    if (foundTracks.length === 0) return;

    setIsProcessing(true);
    try {
      const downloadPromises = foundTracks.map(async (track) => {
        try {
          const response = await fetch(track.artUrl!);
          const blob = await response.blob();
          const name = (track.album || track.fileName).replace(/[/\\?%*:|"<>]/g, '-');
          zip.file(`${name}.jpg`, blob);
        } catch (err) {
          console.error("Failed to add to zip:", err);
        }
      });

      await Promise.all(downloadPromises);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "spotify_artwork.zip");
      onAddTask?.(`Spotify Art: Downloaded ${foundTracks.length} covers`);
    } catch (err) {
      console.error("Download all error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setTracks([]);
    setIsProcessing(false);
  };

  return (
    <div className="p-8 lg:p-12 animate-[fadeIn_0.5s_ease-out] max-w-[1400px] mx-auto space-y-10 pb-24">
      <div className="flex items-center justify-between px-4">
        <div>
          <h1 className="text-4xl font-black dark:text-white uppercase tracking-tighter">Spotify Art Extractor</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Extract high-resolution album covers from files, search queries, or Spotify links.
          </p>
        </div>
        {tracks.length > 0 && (
          <div className="flex items-center gap-4">
            {tracks.some(t => t.status === 'found') && (
              <button 
                onClick={downloadAll}
                disabled={isProcessing}
                className="px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-3 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">download_for_offline</span>
                Download All ({tracks.filter(t => t.status === 'found').length})
              </button>
            )}
            <button 
              onClick={reset}
              className="px-8 py-4 bg-primary/10 text-primary border border-primary/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-3"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Clear All
            </button>
          </div>
        )}
      </div>

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
              We'll analyze your files and fetch the original high-res artwork from Spotify.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <AnimatePresence>
            {tracks.map((track, i) => (
              <motion.div 
                key={track.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-xl group"
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
                        alt={track.album} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => downloadArt(track.artUrl!, track.album || track.fileName)}
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
                      <span className="text-[10px] font-black uppercase tracking-widest">Metadata Error</span>
                    </div>
                  )}
                </div>
                <div className="p-6 space-y-1">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight truncate">{track.album || track.fileName}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{track.artist || 'Unknown Artist'}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default SpotifyArtView;
