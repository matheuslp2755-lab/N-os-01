import React, { useState, useRef, useEffect } from 'react';
import { auth, db, storage, addDoc, collection, serverTimestamp, storageRef, getDownloadURL, uploadBytes } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import TextAreaInput from '../common/TextAreaInput';
import TextInput from '../common/TextInput';
import AddMusicModal from './AddMusicModal';

interface GalleryImage {
    file: File | Blob;
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
    
    // ESTADO LOCAL QUE CONSOME AS IMAGENS CONVERTIDAS
    const [mediaList, setMediaList] = useState<GalleryImage[]>([]);
    const [caption, setCaption] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isFriendsOnly, setIsFriendsOnly] = useState(false);
    const [weatherData, setWeatherData] = useState<{ temp: number; code: number } | null>(null);
    const [selectedMusic, setSelectedMusic] = useState<MusicInfo | null>(null);
    const [viewLimit, setViewLimit] = useState('');
    const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
    
    // SINCRONIZAÇÃO INSTANTÂNEA AO ABRIR
    useEffect(() => {
        if (isOpen) {
            if (initialImages && initialImages.length > 0) {
                // Sincroniza imediatamente o preview local com o Blob URL universal
                setMediaList([...initialImages]);
            }
            fetchWeather();
        } else { 
            setCaption(''); 
            setMediaList([]);
            setIsFriendsOnly(false); 
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
                } catch (e) { console.error("Erro clima", e); }
            });
        }
    };

    const handleSubmit = async () => {
        if (mediaList.length === 0 || submitting) return;
        setSubmitting(true);
        try {
            const urls = await Promise.all(mediaList.map(async (item, idx) => {
                const fileName = item.file instanceof File ? item.file.name : `neos-img-${idx}-${Date.now()}.jpg`;
                const path = `posts/${auth.currentUser?.uid}/${Date.now()}-${fileName}`;
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
                weather: weatherData,
                musicInfo: selectedMusic,
                viewLimit: finalViewLimit,
                viewerCounts: {}
            });

            onPostCreated();
        } catch (e) { 
            console.error(e); 
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col md:p-10 overflow-hidden animate-fade-in">
            <div className="w-full h-full max-w-5xl mx-auto bg-white dark:bg-zinc-950 md:rounded-[3rem] flex flex-col md:flex-row overflow-hidden shadow-2xl">
                
                {/* ÁREA DE PREVIEW: USA A URL CONVERTIDA NO PIPELINE */}
                <div className="relative w-full md:w-[60%] aspect-square md:aspect-auto bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border-r dark:border-zinc-800 overflow-hidden">
                    {mediaList.length > 0 ? (
                        <img 
                            src={mediaList[0].preview} 
                            className="w-full h-full object-contain animate-fade-in" 
                            alt="Preview" 
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Normalizando imagem...</span>
                        </div>
                    )}
                    
                    {weatherData && (
                        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 pointer-events-none">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">
                                {weatherData.code <= 3 ? '☀️ Sol' : '🌧️ Chuva'} • {weatherData.temp}°C
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex-grow flex flex-col p-6 overflow-y-auto bg-white dark:bg-zinc-950">
                    <header className="flex justify-between items-center mb-8">
                        <button onClick={onClose} className="text-2xl hover:scale-110 active:scale-90 transition-transform">&times;</button>
                        <Button onClick={handleSubmit} disabled={submitting || mediaList.length === 0} className="!w-auto !py-2 !px-6 !rounded-full !font-black !uppercase !tracking-widest">
                            {submitting ? '...' : 'Postar'}
                        </Button>
                    </header>
                    
                    <TextAreaInput id="cap" label="Legenda" value={caption} onChange={e => setCaption(e.target.value)} />
                    
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Limite de Visualizações</label>
                            <TextInput 
                                id="view-limit" 
                                type="number" 
                                placeholder="Ilimitado" 
                                value={viewLimit} 
                                onChange={e => setViewLimit(e.target.value)} 
                                label="Ex: 5"
                            />
                        </div>

                        <button 
                            onClick={() => setIsMusicModalOpen(true)}
                            className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl hover:bg-zinc-100 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-500 group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                                </div>
                                <span className="text-sm font-bold">{selectedMusic ? 'Trocar Trilha' : 'Adicionar Música'}</span>
                            </div>
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
                        </button>
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