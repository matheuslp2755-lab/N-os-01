import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { auth, db, doc, getDoc } from '../../firebase';
import MusicTrimmer from './MusicTrimmer';

type DeezerTrack = {
  id: number;
  title: string;
  artist: { name: string };
  album: { cover_medium: string };
  preview: string;
  rank?: number;
};

type MusicInfo = {
  nome: string;
  artista: string;
  capa: string;
  preview: string;
  startTime?: number;
};

interface MusicSearchProps {
  onSelectMusic: (track: MusicInfo) => void;
  onBack: () => void;
}

const Spinner: React.FC = () => (
    <div className="flex justify-center items-center p-10">
        <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-4 border-sky-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    </div>
);

const MusicSearch: React.FC<MusicSearchProps> = ({ onSelectMusic, onBack }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<DeezerTrack[]>([]);
  const [suggestions, setSuggestions] = useState<DeezerTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [userVibe, setUserVibe] = useState<string | null>(null);

  const fetchFromDeezer = async (url: string) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("Deezer Unreachable");
    return await res.json();
  };

  const getVibeMatchQuery = (vibe: string | null) => {
      switch(vibe) {
          case 'joy': return 'happy pop dance summer hits';
          case 'anger': return 'phonk workout metal aggressive trap';
          case 'sloth': return 'lofi chill jazz rain sleep acoustic';
          default: return 'trending global hits 2024';
      }
  };

  useEffect(() => {
    const initVibeAlgorithm = async () => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userSnap.exists()) {
                const vibe = userSnap.data().currentVibe || null;
                setUserVibe(vibe);
                const query = getVibeMatchQuery(vibe);
                try {
                    const data = await fetchFromDeezer(`https://api.deezer.com/search?q=${query}&order=RANKING&limit=15`);
                    setSuggestions(data.data || []);
                } catch (e) {
                    const data = await fetchFromDeezer('https://api.deezer.com/chart/0/tracks');
                    setSuggestions(data.data || []);
                }
            }
        }
    };
    initVibeAlgorithm();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const data = await fetchFromDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}`);
      setResults(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [trimmingTrack, setTrimmingTrack] = useState<any | null>(null);

  if (trimmingTrack) {
      return (
          <MusicTrimmer
              track={{
                  trackId: trimmingTrack.id,
                  trackName: trimmingTrack.title,
                  artistName: trimmingTrack.artist.name,
                  artworkUrl100: trimmingTrack.album.cover_medium,
                  previewUrl: trimmingTrack.preview
              } as any}
              onConfirm={(info) => { onSelectMusic(info); setTrimmingTrack(null); }}
              onBack={() => setTrimmingTrack(null)}
          />
      );
  }

  return (
    <div className="p-4 flex flex-col h-full bg-white dark:bg-black">
        <div className="flex items-center gap-4 mb-6">
            <button onClick={onBack} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth={2.5}/></svg>
            </button>
            <form onSubmit={handleSearch} className="flex-grow">
                <div className="relative flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-3 border border-transparent focus-within:border-sky-500/50 transition-all">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Músicas, Artistas, Álbuns..."
                        className="w-full bg-transparent text-sm outline-none font-bold placeholder:text-zinc-500"
                        autoFocus
                    />
                </div>
            </form>
        </div>

        <div className="flex-grow overflow-y-auto no-scrollbar pb-10">
            {loading && <Spinner />}
            
            {!searchTerm && suggestions.length > 0 && !loading && (
                <div className="animate-fade-in">
                    <div className="px-2 mb-6">
                        <h3 className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mb-1">Algoritmo VibeMatch</h3>
                        <p className="text-xl font-black tracking-tighter">Sua Trilha Sonora Agora</p>
                    </div>
                    <div className="space-y-2">
                        {suggestions.map((track, i) => (
                            <button 
                                key={track.id} 
                                onClick={() => setTrimmingTrack(track)} 
                                className="flex items-center gap-4 p-3 rounded-[1.5rem] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all text-left w-full group active:scale-95"
                                style={{ animationDelay: `${i * 40}ms` }}
                            >
                                <img src={track.album.cover_medium} className="w-14 h-14 rounded-xl object-cover shadow-lg group-hover:rotate-2 transition-transform" />
                                <div className="flex-grow overflow-hidden">
                                    <p className="font-black text-sm truncate tracking-tight">{track.title}</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-0.5 opacity-60">{track.artist.name}</p>
                                </div>
                                {i < 3 && <div className="text-sky-500 font-black text-[10px] tracking-widest italic shrink-0">VIBE MATCH</div>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {results.map((track) => (
                    <button 
                        key={track.id} 
                        onClick={() => setTrimmingTrack(track)} 
                        className="flex items-center gap-4 p-4 rounded-[2rem] hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-all text-left w-full active:scale-95"
                    >
                        <img src={track.album.cover_medium} alt={track.title} className="w-16 h-16 rounded-2xl object-cover shadow-md" />
                        <div className="flex-grow overflow-hidden">
                            <p className="font-black text-base truncate tracking-tighter">{track.title}</p>
                            <p className="text-xs text-zinc-500 font-black uppercase tracking-widest mt-1 opacity-50">{track.artist.name}</p>
                        </div>
                    </button>
                ))}
            </div>
      </div>

      <div className="p-4 border-t dark:border-zinc-800 text-center bg-white/80 dark:bg-black/80 backdrop-blur-md">
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.4em]">
              Powered by <span className="text-sky-500">NÉOS MUSIC PRO</span>
          </p>
      </div>
    </div>
  );
};

export default MusicSearch;