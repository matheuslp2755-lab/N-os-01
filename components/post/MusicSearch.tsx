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
        <div className="relative w-12 h-12">
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
  const [error, setError] = useState('');
  const [trimmingTrack, setTrimmingTrack] = useState<any | null>(null);
  const [userVibe, setUserVibe] = useState<string | null>(null);

  const fetchFromDeezer = async (url: string) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("O servidor de música não respondeu.");
    return await res.json();
  };

  // Algoritmo VibeMatch: Define o termo de busca "invisível" para as sugestões
  const getSearchQueryByVibe = (vibe: string | null) => {
      switch(vibe) {
          case 'joy': return 'pop hits dance';
          case 'anger': return 'rock heavy phonk';
          case 'sloth': return 'lofi chill jazz acoustic';
          default: return 'trending 2024';
      }
  };

  useEffect(() => {
    const initVibeAlgorithm = async () => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userSnap.exists()) {
                setUserVibe(userSnap.data().currentVibe || null);
            }
        }

        try {
            const query = getSearchQueryByVibe(userVibe);
            const data = await fetchFromDeezer(`https://api.deezer.com/search?q=${query}&order=RANKING&limit=20`);
            setSuggestions(data.data || []);
        } catch (e) {
            // Fallback para chart global se o algoritmo falhar
            const data = await fetchFromDeezer('https://api.deezer.com/chart/0/tracks');
            setSuggestions(data.data || []);
        }
    };
    initVibeAlgorithm();
  }, [userVibe]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTerm.trim() === '') return;

    setLoading(true);
    setError('');
    setResults([]);
    try {
      const data = await fetchFromDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}`);
      setResults(data.data || []);
      if (!data.data || data.data.length === 0) setError("Nenhuma música encontrada.");
    } catch (err: any) {
      setError("Erro ao conectar com o Deezer.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleConfirmTrim = (musicInfo: MusicInfo) => {
    onSelectMusic(musicInfo);
    setTrimmingTrack(null);
  };

  if (trimmingTrack) {
      return (
          <div className="h-full bg-white dark:bg-black overflow-hidden">
              <MusicTrimmer
                  track={{
                      trackId: trimmingTrack.id,
                      trackName: trimmingTrack.title,
                      artistName: trimmingTrack.artist.name,
                      artworkUrl100: trimmingTrack.album.cover_medium,
                      previewUrl: trimmingTrack.preview
                  } as any}
                  onConfirm={handleConfirmTrim}
                  onBack={() => setTrimmingTrack(null)}
              />
          </div>
      );
  }

  return (
    <div className="p-4 flex flex-col h-[75vh] md:h-full bg-white dark:bg-black relative">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={onBack} className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:scale-110 active:scale-95 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth={2}/></svg>
            </button>
            <form onSubmit={handleSearch} className="flex-grow relative group">
                <div className="relative flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-3.5 border border-transparent focus-within:border-sky-500/50 transition-all">
                    <svg className="w-5 h-5 text-zinc-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Pesquisar no Néos Music..."
                        className="w-full bg-transparent text-sm outline-none font-bold placeholder:text-zinc-500"
                        autoFocus
                    />
                </div>
            </form>
        </div>

        <div className="flex-grow overflow-y-auto no-scrollbar pb-20">
            {loading && <Spinner />}
            
            {!searchTerm && suggestions.length > 0 && !loading && (
                <div className="animate-fade-in">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <div className="flex flex-col">
                            <h3 className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em]">VibeMatch Alogorithm</h3>
                            <p className="text-[14px] font-black text-zinc-900 dark:text-white uppercase tracking-tighter">Sugestões baseadas na sua Vibe</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {suggestions.map((track, i) => (
                            <button 
                                key={track.id} 
                                onClick={() => setTrimmingTrack(track)} 
                                className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all text-left group active:scale-95 animate-slide-up"
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                <img src={track.album.cover_medium} className="w-14 h-14 rounded-xl object-cover shadow-lg group-hover:rotate-3 transition-transform" />
                                <div className="flex-grow overflow-hidden">
                                    <p className="font-black text-sm truncate tracking-tight">{track.title}</p>
                                    <p className="text-xs text-zinc-500 truncate font-bold uppercase tracking-wider mt-0.5 opacity-60">{track.artist.name}</p>
                                </div>
                                {i < 3 && <div className="text-sky-500 font-black text-[10px]">MATCH</div>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {results.map((track, i) => (
                    <button 
                        key={track.id} 
                        onClick={() => setTrimmingTrack(track)} 
                        className="flex items-center gap-4 p-4 rounded-3xl hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-all text-left group active:scale-95 animate-slide-up"
                    >
                        <img src={track.album.cover_medium} alt={track.title} className="w-16 h-16 rounded-2xl object-cover shadow-xl" />
                        <div className="flex-grow overflow-hidden">
                            <p className="font-black text-base truncate tracking-tighter">{track.title}</p>
                            <p className="text-xs text-zinc-500 font-black uppercase tracking-widest mt-1 opacity-50">{track.artist.name}</p>
                        </div>
                    </button>
                ))}
            </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t dark:border-zinc-800 text-center">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Powered by <span className="text-sky-500">NÉOS MUSIC ALGORITHM</span>
          </p>
      </div>
    </div>
  );
};

export default MusicSearch;