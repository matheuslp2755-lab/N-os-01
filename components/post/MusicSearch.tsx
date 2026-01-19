import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import MusicTrimmer from './MusicTrimmer';

type DeezerTrack = {
  id: number;
  title: string;
  artist: { name: string };
  album: { cover_medium: string };
  preview: string;
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

const BackArrowIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"></path></svg>
);

const MusicSearch: React.FC<MusicSearchProps> = ({ onSelectMusic, onBack }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<DeezerTrack[]>([]);
  const [suggestions, setSuggestions] = useState<DeezerTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trimmingTrack, setTrimmingTrack] = useState<any | null>(null);

  // Helper para buscar na API via proxy
  const fetchFromDeezer = async (url: string) => {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error("O servidor de música não respondeu adequadamente.");
    
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error("Formato de resposta inválido. Tente novamente em alguns instantes.");
    }
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
        try {
            const data = await fetchFromDeezer('https://api.deezer.com/chart/0/tracks');
            setSuggestions(data.data || []);
        } catch (e: any) { 
            console.error("Suggestions Error:", e.message || String(e)); 
        }
    };
    fetchSuggestions();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTerm.trim() === '') return;

    setLoading(true);
    setError('');
    setResults([]);
    try {
      const data = await fetchFromDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(searchTerm)}`);
      setResults(data.data || []);
      if (!data.data || data.data.length === 0) {
          setError("Nenhuma música encontrada.");
      }
    } catch (err: any) {
      console.error("Search API Error:", err.message || String(err));
      setError(err.message || "Erro ao conectar com o Deezer.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleConfirmTrim = (musicInfo: MusicInfo) => {
    onSelectMusic(musicInfo);
    setTrimmingTrack(null);
  };

  if (trimmingTrack) {
      const mappedTrack = {
          trackId: trimmingTrack.id,
          trackName: trimmingTrack.title,
          artistName: trimmingTrack.artist.name,
          artworkUrl100: trimmingTrack.album.cover_medium,
          previewUrl: trimmingTrack.preview
      };

      return (
          <div className="h-full bg-white dark:bg-black overflow-hidden">
              <MusicTrimmer
                  track={mappedTrack as any}
                  onConfirm={handleConfirmTrim}
                  onBack={() => setTrimmingTrack(null)}
              />
          </div>
      );
  }

  return (
    <div className="p-4 flex flex-col h-[75vh] md:h-full bg-white dark:bg-black relative">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={onBack} className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 hover:scale-110 active:scale-95 transition-all" aria-label="Voltar">
                <BackArrowIcon className="w-5 h-5"/>
            </button>
            <form onSubmit={handleSearch} className="flex-grow relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-purple-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
                <div className="relative flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-3.5 border border-transparent focus-within:border-sky-500/50 transition-all">
                    <svg className="w-5 h-5 text-zinc-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        type="text"
                        value={searchTerm}
                        /* Fixed: Changed setSearchQuery to setSearchTerm */
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Pesquisar música ou artista..."
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
                        <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Bombando no Deezer</h3>
                        <div className="h-px flex-grow bg-zinc-100 dark:bg-zinc-800 ml-4" />
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {suggestions.map((track, i) => (
                            <button 
                                key={track.id} 
                                onClick={() => setTrimmingTrack(track)} 
                                className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all text-left group active:scale-95 animate-slide-up"
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                <div className="relative shrink-0">
                                    <img src={track.album.cover_medium} className="w-14 h-14 rounded-xl object-cover shadow-lg" />
                                    <div className="absolute inset-0 bg-black/20 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8.002v3.996a1 1 0 001.555.832l3.197-1.998a1 1 0 000-1.664l-3.197-1.998z" /></svg>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-hidden">
                                    <p className="font-black text-sm truncate tracking-tight">{track.title}</p>
                                    <p className="text-xs text-zinc-500 truncate font-bold uppercase tracking-wider mt-0.5 opacity-60">{track.artist.name}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {error && <div className="p-10 text-center animate-bounce"><p className="text-zinc-500 font-bold text-sm">{error}</p></div>}
            
            <div className="flex flex-col gap-2">
                {results.map((track, i) => (
                    <button 
                        key={track.id} 
                        onClick={() => setTrimmingTrack(track)} 
                        className="flex items-center gap-4 p-4 rounded-3xl hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-all text-left group active:scale-95 animate-slide-up border border-transparent hover:border-sky-500/20"
                        style={{ animationDelay: `${i * 30}ms` }}
                    >
                        <img src={track.album.cover_medium} alt={track.title} className="w-16 h-16 rounded-2xl object-cover shadow-xl group-hover:rotate-3 transition-transform" />
                        <div className="flex-grow overflow-hidden">
                            <p className="font-black text-base truncate tracking-tighter">{track.title}</p>
                            <p className="text-xs text-zinc-500 font-black uppercase tracking-widest mt-1 opacity-50">{track.artist.name}</p>
                        </div>
                        <svg className="w-5 h-5 text-sky-500 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 5l7 7-7 7" /></svg>
                    </button>
                ))}
            </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t dark:border-zinc-800 text-center">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Músicas fornecidas por <span className="text-sky-500">Deezer</span>
          </p>
      </div>
    </div>
  );
};

export default MusicSearch;