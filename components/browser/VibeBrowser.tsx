
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../../context/LanguageContext';
import { db, collection, query, limit, getDocs, where, auth, getDoc, doc, updateDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface VibeBrowserProps {
    onClose: () => void;
}

const VibeBrowser: React.FC<VibeBrowserProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultText, setResultText] = useState('');
    const [sources, setSources] = useState<any[]>([]);
    const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
    const [isSearchingNearby, setIsSearchingNearby] = useState(false);
    const [hasInitiatedRadar, setHasInitiatedRadar] = useState(false);

    const startRadar = async () => {
        setHasInitiatedRadar(true);
        setIsSearchingNearby(true);
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        try {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const myLat = pos.coords.latitude;
                const myLng = pos.coords.longitude;

                // 1. Atualiza minha própria localização para outros me verem
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    location: { lat: myLat, lng: myLng },
                    lastSeen: serverTimestamp()
                });

                // 2. Busca usuários recentemente ativos (limite de 50 para performance)
                const q = query(collection(db, 'users'), limit(50));
                const snap = await getDocs(q);
                const nowInSecs = Date.now() / 1000;
                
                const found = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as any))
                    .filter(u => {
                        // Filtros de visibilidade
                        if (u.id === currentUser.uid || !u.location || !u.lastSeen) return false;
                        if (u.appearOnRadar === false) return false;
                        
                        // Somente ativos nos últimos 60 minutos
                        const isActive = (nowInSecs - u.lastSeen.seconds) < 3600; 
                        if (!isActive) return false;

                        // Filtro de proximidade aproximado (~15km)
                        const diffLat = Math.abs(u.location.lat - myLat);
                        const diffLng = Math.abs(u.location.lng - myLng);
                        return diffLat < 0.15 && diffLng < 0.15;
                    });
                    
                setNearbyUsers(found);
                setIsSearchingNearby(false);
            }, (err) => {
                console.error("GPS Error:", err);
                alert("Ative o GPS para localizar sinais ao seu redor.");
                setIsSearchingNearby(false);
            }, { enableHighAccuracy: true, timeout: 10000 });
        } catch (e) {
            console.error("Radar Crash:", e);
            setIsSearchingNearby(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const queryText = String(searchQuery).trim();
        if (!queryText) return;

        setLoading(true);
        setResultText('');
        setSources([]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: queryText,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });

            setResultText(response.text || "Nenhuma informação relevante encontrada.");
            
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks) {
                const urls = groundingChunks
                    .filter((chunk: any) => chunk.web)
                    .map((chunk: any) => ({
                        uri: chunk.web.uri,
                        title: chunk.web.title || chunk.web.uri
                    }));
                setSources(urls);
            }
        } catch (err) {
            console.error(err);
            setResultText("Erro ao consultar a rede Néos.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-white dark:bg-black z-[100] flex flex-col animate-fade-in overflow-hidden font-sans">
            <header className="flex items-center gap-4 p-4 border-b dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <button 
                    onClick={onClose}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-all active:scale-90"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                
                <form onSubmit={handleSearch} className="flex-grow flex items-center bg-white dark:bg-zinc-900 rounded-2xl px-4 py-2.5 border dark:border-zinc-700 shadow-inner group focus-within:ring-2 ring-indigo-500/20">
                    <svg className="w-4 h-4 text-zinc-400 mr-3 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input 
                        autoFocus
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Pesquisar no Néos Explorer..."
                        className="w-full bg-transparent outline-none text-sm font-bold placeholder:text-zinc-500"
                    />
                </form>
            </header>

            <main className="flex-grow overflow-y-auto no-scrollbar bg-white dark:bg-black p-6">
                <div className="max-w-4xl mx-auto">
                    {!resultText && !loading && (
                        <div className="space-y-12 animate-fade-in">
                            <section className="bg-zinc-50 dark:bg-zinc-900/40 p-8 rounded-[3rem] border dark:border-zinc-800 text-center shadow-xl">
                                {!hasInitiatedRadar ? (
                                    <div className="py-10 space-y-6">
                                        <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-500">
                                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10 10 0 0114.142 0M2.828 9.172a15 15 0 0121.214 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </div>
                                        <h3 className="text-xl font-black tracking-tight dark:text-white uppercase">Radar de Pessoas</h3>
                                        <p className="text-zinc-500 text-sm font-medium px-4">Localize sinais de usuários ativos ao seu redor agora.</p>
                                        <button 
                                            onClick={startRadar}
                                            className="px-10 py-4 bg-indigo-600 text-white rounded-full font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all"
                                        >
                                            Ativar Radar Próximo
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 flex items-center gap-3">
                                                <div className={`w-2 h-2 bg-indigo-500 rounded-full ${isSearchingNearby ? 'animate-ping' : ''}`}></div>
                                                Sinais Próximos
                                            </h3>
                                            <button onClick={startRadar} className="text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:text-indigo-500 transition-colors">Atualizar</button>
                                        </div>
                                        
                                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                                            {isSearchingNearby ? (
                                                <div className="w-full py-10 flex flex-col items-center gap-3">
                                                    <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Escaneando frequências...</p>
                                                </div>
                                            ) : nearbyUsers.length > 0 ? nearbyUsers.map((u) => (
                                                <div key={u.id} className="flex-shrink-0 w-28 flex flex-col items-center gap-2 group animate-slide-up">
                                                    <div className="relative p-1 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 group-hover:scale-105 transition-transform cursor-pointer">
                                                        <div className="bg-white dark:bg-black p-0.5 rounded-full">
                                                            <img src={u.avatar} className="w-20 h-20 rounded-full object-cover" />
                                                        </div>
                                                        <div className="absolute bottom-0 right-0 bg-green-500 w-4 h-4 rounded-full border-2 border-white dark:border-black"></div>
                                                    </div>
                                                    <p className="text-[10px] font-black truncate w-full text-center tracking-tighter">@{u.username}</p>
                                                </div>
                                            )) : (
                                                <p className="w-full py-10 text-xs font-black uppercase text-zinc-400 tracking-widest opacity-50">Nenhum sinal detectado agora</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            <div className="py-20 text-center flex flex-col items-center opacity-30 select-none">
                                <div className="w-24 h-24 mb-6 rounded-[3rem] bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center shadow-inner">
                                    <svg className="w-12 h-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                                </div>
                                <h3 className="text-2xl font-black tracking-tight uppercase tracking-[0.2em]">Sinta a Rede</h3>
                                <p className="text-xs font-bold text-zinc-500 uppercase mt-2 italic">Descubra o que está acontecendo através do Néos Explorer</p>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="space-y-6 animate-pulse">
                            <div className="h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full w-3/4" />
                            <div className="space-y-3">
                                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full w-full" />
                                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full w-full" />
                            </div>
                        </div>
                    )}

                    {resultText && (
                        <div className="animate-fade-in pb-10">
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-10 rounded-[3rem] border border-zinc-100 dark:border-zinc-800 shadow-sm mb-10">
                                <div className="prose prose-zinc dark:prose-invert max-w-none text-base md:text-lg leading-relaxed font-medium whitespace-pre-wrap">
                                    {resultText}
                                </div>
                            </div>
                            {sources.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">Fontes:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {sources.map((s, i) => (
                                            <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="bg-zinc-100 dark:bg-zinc-900 px-5 py-3 rounded-2xl text-xs font-bold hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all border dark:border-zinc-800 hover:scale-105 active:scale-95">
                                                {s.title.length > 40 ? s.title.substring(0, 40) + '...' : s.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default VibeBrowser;
