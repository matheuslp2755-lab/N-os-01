import React, { useState, useRef, useEffect } from 'react';
import { auth, db, storage, addDoc, collection, serverTimestamp, storageRef, getDownloadURL, uploadBytes } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import TextAreaInput from '../common/TextAreaInput';
import TextInput from '../common/TextInput';
import AddMusicModal from './AddMusicModal';

interface GalleryImage {
    file: File;
    preview: string;
}

type MusicInfo = {
  nome: string;
  artista: string;
  capa: string;
  preview: string;
  startTime?: number;
};

interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPostCreated: () => void;
    initialImages: GalleryImage[];
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ isOpen, onClose, onPostCreated, initialImages }) => {
    const { t } = useLanguage();
    const [mediaList, setMediaList] = useState<GalleryImage[]>([]);
    const [caption, setCaption] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isFriendsOnly, setIsFriendsOnly] = useState(false);
    const [closeFriendsIds, setCloseFriendsIds] = useState<string[]>([]);
    const [weatherData, setWeatherData] = useState<{ temp: number; code: number } | null>(null);
    const [selectedMusic, setSelectedMusic] = useState<MusicInfo | null>(null);
    const [viewLimit, setViewLimit] = useState('');
    const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
    
    useEffect(() => {
        if (isOpen && initialImages) setMediaList(initialImages);
        if (isOpen) fetchWeather();
        if (!isOpen) { 
            setCaption(''); 
            setMediaList([]); 
            setIsFriendsOnly(false); 
            setCloseFriendsIds([]); 
            setWeatherData(null);
            setSelectedMusic(null);
            setViewLimit('');
        }
    }, [isOpen, initialImages]);

    const fetchWeather = async () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords;
                    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
                    const data = await response.json();
                    if (data.current_weather) {
                        setWeatherData({
                            temp: Math.round(data.current_weather.temperature),
                            code: data.current_weather.weathercode
                        });
                    }
                } catch (e) {
                    console.error("Weather fetch error", e);
                }
            });
        }
    };

    const handleSubmit = async () => {
        if (mediaList.length === 0 || submitting) return;
        setSubmitting(true);
        try {
            const urls = await Promise.all(mediaList.map(async (item) => {
                const path = `posts/${auth.currentUser?.uid}/${Date.now()}-${item.file.name}`;
                const ref = storageRef(storage, path);
                await uploadBytes(ref, item.file);
                return await getDownloadURL(ref);
            }));

            const finalViewLimit = viewLimit.trim() ? parseInt(viewLimit) : null;

            await addDoc(collection(db, 'posts'), {
                userId: auth.currentUser?.uid,
                username: auth.currentUser?.displayName,
                userAvatar: auth.currentUser?.photoURL,
                imageUrl: urls[0],
                media: urls.map(url => ({ url, type: 'image' })),
                caption,
                likes: [],
                timestamp: serverTimestamp(),
                isFriendOnly: isFriendsOnly,
                closeFriendsIds: isFriendsOnly ? closeFriendsIds : [],
                weather: weatherData,
                musicInfo: selectedMusic,
                viewLimit: finalViewLimit,
                viewerCounts: {}
            });

            onPostCreated();
            onClose();
        } catch (e) { console.error(e); } finally { setSubmitting(false); }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col md:p-10 overflow-hidden animate-fade-in">
            <div className="w-full h-full max-w-5xl mx-auto bg-white dark:bg-zinc-950 md:rounded-[3rem] flex flex-col md:flex-row overflow-hidden shadow-2xl">
                <div className="relative w-full md:w-[60%] aspect-square md:aspect-auto bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border-r dark:border-zinc-800">
                    {mediaList.length > 0 && <img src={mediaList[0].preview} className="w-full h-full object-contain" />}
                    
                    {weatherData && (
                        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 pointer-events-none">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">
                                {weatherData.code <= 3 ? '☀️ Sol' : '🌧️ Chuva'} • {weatherData.temp}°C
                            </span>
                        </div>
                    )}

                    {selectedMusic && (
                        <div className="absolute bottom-4 left-4 right-4 bg-white/10 backdrop-blur-xl border border-white/20 p-3 rounded-2xl flex items-center gap-3 animate-slide-up">
                            <img src={selectedMusic.capa} className="w-10 h-10 rounded-lg object-cover shadow-lg" alt="Cover" />
                            <div className="flex-grow overflow-hidden">
                                <p className="text-white text-[10px] font-black uppercase truncate">{selectedMusic.nome}</p>
                                <p className="text-white/60 text-[8px] font-bold uppercase truncate">{selectedMusic.artista}</p>
                            </div>
                            <button onClick={() => setSelectedMusic(null)} className="text-white/40 hover:text-white p-1">&times;</button>
                        </div>
                    )}
                </div>

                <div className="flex-grow flex flex-col p-6 overflow-y-auto bg-white dark:bg-zinc-950">
                    <header className="flex justify-between items-center mb-8">
                        <button onClick={onClose} className="text-2xl">&times;</button>
                        <Button onClick={handleSubmit} disabled={submitting || mediaList.length === 0} className="!w-auto !py-2 !px-6 !rounded-full">
                            {submitting ? '...' : 'Postar'}
                        </Button>
                    </header>
                    <TextAreaInput id="cap" label="Legenda" value={caption} onChange={e => setCaption(e.target.value)} />
                    
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Limite de Visualizações (por pessoa)</label>
                            <TextInput 
                                id="view-limit" 
                                type="number" 
                                placeholder="Deixe vazio para ilimitado" 
                                value={viewLimit} 
                                onChange={e => setViewLimit(e.target.value)} 
                                label="Ex: 5"
                                className="!bg-white dark:!bg-zinc-800"
                            />
                            <p className="text-[8px] text-zinc-400 mt-2 uppercase font-bold">Cada pessoa só poderá ver o post este número de vezes no feed.</p>
                        </div>

                        <button 
                            onClick={() => setIsMusicModalOpen(true)}
                            className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-500 group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                                </div>
                                <div className="text-left">
                                    <span className="text-sm font-bold block">{selectedMusic ? 'Trocar Trilha Sonora' : 'Adicionar Música'}</span>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Escolha a vibe da sua foto</p>
                                </div>
                            </div>
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
                        </button>

                        <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold">Amigos Próximos ⭐</span>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Somente quem você escolher verá</p>
                            </div>
                            <input type="checkbox" checked={isFriendsOnly} onChange={e => setIsFriendsOnly(e.target.checked)} className="w-6 h-6 accent-green-500 cursor-pointer" />
                        </div>
                    </div>
                </div>
            </div>
            
            <AddMusicModal 
                isOpen={isMusicModalOpen} 
                onClose={() => setIsMusicModalOpen(false)} 
                postId="" 
                onMusicAdded={(music) => { setSelectedMusic(music); setIsMusicModalOpen(false); }}
                isProfileModal={true}
            />
        </div>
    );
};

export default CreatePostModal;