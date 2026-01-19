import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, updateDoc, arrayUnion, arrayRemove, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import { VerifiedBadge } from '../profile/UserProfile';
import AddCaptionModal from '../post/AddCaptionModal';
import { GoogleGenAI } from "@google/genai";
import MusicPlayer from './MusicPlayer';

type PostType = {
    id: string;
    userId: string;
    username: string;
    userAvatar: string;
    imageUrl?: string; 
    media?: { url: string, type: 'image' | 'video' }[];
    caption?: string;
    likes: string[];
    timestamp: any;
    isAuthorVerified?: boolean;
    disableComments?: boolean;
    disableLikes?: boolean;
    isFriendOnly?: boolean;
    weather?: { temp: number; code: number };
    musicInfo?: {
        nome: string;
        artista: string;
        capa: string;
        preview: string;
        startTime?: number;
    };
};

interface PostProps {
    post: PostType;
    onPostDeleted: (id: string) => void;
    onForward?: (post: PostType) => void;
    onViewPulse?: (userId: string) => void;
}

const Post: React.FC<PostProps> = ({ post, onPostDeleted, onForward, onViewPulse }) => {
    const { t } = useLanguage();
    const { formatTimestamp } = useTimeAgo();
    
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isMuted, setIsMuted] = useState(true);
    const [isAutoPlaying, setIsAutoPlaying] = useState(false);

    const [isTranslated, setIsTranslated] = useState(false);
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [shouldShowTranslateButton, setShouldShowTranslateButton] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    const containerRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const currentUser = auth.currentUser;
    const isAuthor = currentUser?.uid === post.userId;
    const isLiked = post.likes.includes(currentUser?.uid || '');

    // Sistema de Autoplay via Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
                        setIsAutoPlaying(true);
                        if (videoRef.current) {
                            videoRef.current.play().catch(() => {});
                        }
                    } else {
                        setIsAutoPlaying(false);
                        if (videoRef.current) {
                            videoRef.current.pause();
                        }
                    }
                });
            },
            { threshold: [0.7] }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) observer.unobserve(containerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!post.caption || post.caption.length < 10 || !process.env.API_KEY) return;

        const timer = setTimeout(async () => {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const textToAnalyze = String(post.caption || "");
                
                const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview', 
                    contents: `Analise se o texto a seguir está em Português do Brasil. Responda apenas "SIM" ou "NAO". Texto: "${textToAnalyze}"`,
                });

                const result = response.text?.trim().toUpperCase();
                if (result && result.includes("NAO")) {
                    setShouldShowTranslateButton(true);
                }
            } catch (e: any) {
                if (e?.status !== 429 && e?.status !== 404) {
                    console.error("Language detection error:", e);
                }
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [post.caption]);

    const handleTranslate = async () => {
        if (isTranslated) { setIsTranslated(false); return; }
        if (translatedText) { setIsTranslated(true); return; }

        setIsTranslating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Traduza fielmente para Português do Brasil: "${post.caption}"`,
                config: { systemInstruction: "Você é um tradutor expert de redes sociais." }
            });

            if (response.text) {
                setTranslatedText(response.text.trim());
                setIsTranslated(true);
            }
        } catch (e: any) {
            console.error("Translation error:", e);
        } finally {
            setIsTranslating(false);
        }
    };

    const handleLike = async () => {
        if (!currentUser || post.disableLikes) return;
        const ref = doc(db, 'posts', post.id);
        await updateDoc(ref, { likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) });
    };

    const handleReportPost = async () => {
        if (!currentUser) return;
        const reason = window.prompt("Por que você está denunciando esta publicação?");
        if (!reason) return;

        try {
            await addDoc(collection(db, 'reports'), {
                reporterId: currentUser.uid,
                reporterUsername: currentUser.displayName,
                targetPostId: post.id,
                targetUserId: post.userId,
                targetUsername: post.username,
                reason,
                type: 'post',
                timestamp: serverTimestamp(),
                status: 'pending'
            });
            alert("Denúncia enviada com sucesso.");
            setIsMenuOpen(false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser || post.disableComments) return;
        await addDoc(collection(db, 'posts', post.id, 'comments'), {
            userId: currentUser.uid,
            username: currentUser.displayName,
            avatar: currentUser.photoURL,
            text: newComment.trim(),
            timestamp: serverTimestamp()
        });
        setNewComment('');
    };

    const getWeatherInfo = () => {
        if (!post.weather) return null;
        const { code, temp } = post.weather;
        const isRain = code >= 51;
        const isClear = code <= 3;
        
        return {
            icon: isRain ? '🌧️' : isClear ? '☀️' : '☁️',
            label: isRain ? 'Chovendo' : isClear ? 'Ensolarado' : 'Nublado',
            temp: `${temp}°C`,
            style: isRain ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-500'
        };
    };

    const weather = getWeatherInfo();
    const isPostVideo = post.media?.[0]?.type === 'video' || (post.imageUrl && post.imageUrl.match(/\.(mp4|webm|mov)$/i));

    return (
        <article ref={containerRef} className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden mb-6 shadow-sm max-w-xl mx-auto group/post">
            <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                    <div className="cursor-pointer active:scale-95 transition-transform" onClick={() => onViewPulse?.(post.userId)}>
                        <img src={post.userAvatar} className="w-10 h-10 rounded-full object-cover border-2 border-sky-500 p-0.5" alt="Avatar" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-sm flex items-center">{post.username} {post.isAuthorVerified && <VerifiedBadge className="w-3.5 h-3.5" />}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase">{formatTimestamp(post.timestamp)}</span>
                            {weather && (
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${weather.style}`}>
                                    {weather.icon} {weather.label} {weather.temp}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="relative">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-zinc-400 hover:text-black dark:hover:text-white">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                    </button>

                    {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2 animate-slide-up">
                            {isAuthor ? (
                                <>
                                    <button onClick={() => { setIsEditModalOpen(true); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold">Editar legenda</button>
                                    <button onClick={() => { onPostDeleted(post.id); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-red-500 font-black border-t dark:border-zinc-800 mt-1">Excluir</button>
                                </>
                            ) : (
                                <button onClick={handleReportPost} className="w-full text-left px-4 py-3 text-sm text-red-500 font-bold">Denunciar</button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="aspect-square bg-zinc-100 dark:bg-zinc-950 relative overflow-hidden">
                {isPostVideo ? (
                    <video 
                        ref={videoRef}
                        src={post.media?.[0]?.url || post.imageUrl}
                        className="w-full h-full object-cover"
                        loop
                        playsInline
                        muted={isMuted}
                    />
                ) : (
                    <img src={post.imageUrl || post.media?.[0].url} className="w-full h-full object-cover transition-transform duration-700 group-hover/post:scale-105" alt="Content" />
                )}
                
                {/* Overlay de Áudio / Mudo */}
                {(post.musicInfo || isPostVideo) && (
                    <div className="absolute bottom-4 right-4 z-10 animate-fade-in">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                            className="bg-black/20 backdrop-blur-xl border border-white/20 p-2.5 rounded-full text-white shadow-2xl active:scale-90 transition-all"
                        >
                            {isMuted ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Barra de Trilha Sonora com Autoplay Controlado */}
            {post.musicInfo && (
                <div className="border-b dark:border-zinc-800">
                    <MusicPlayer 
                        musicInfo={post.musicInfo} 
                        isPlaying={isAutoPlaying && !isMuted} 
                        isMuted={isMuted} 
                        setIsMuted={setIsMuted} 
                    />
                </div>
            )}

            <div className="p-5">
                <div className="flex gap-5 mb-4">
                    {!post.disableLikes && (
                        <button onClick={handleLike} className="active:scale-125 transition-transform">
                            <svg className={`w-8 h-8 ${isLiked ? 'text-red-500 fill-current' : 'text-zinc-800 dark:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                        </button>
                    )}
                    {!post.disableComments && (
                        <button onClick={() => setShowComments(!showComments)}>
                            <svg className="w-8 h-8 text-zinc-800 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </button>
                    )}
                    <button onClick={() => onForward?.(post)}>
                        <svg className="w-8 h-8 text-zinc-800 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>

                <div className="text-sm">
                    {!post.disableLikes && <p className="font-black mb-1">{post.likes.length} {t('post.likes')}</p>}
                    
                    <div className="mt-2">
                        <span className="font-black mr-2">{post.username}</span>
                        <span className="transition-all duration-300">
                            {isTranslated && translatedText ? translatedText : post.caption}
                        </span>
                    </div>

                    {shouldShowTranslateButton && (
                        <button 
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className="mt-2 text-[11px] font-black text-zinc-500 hover:text-sky-500 uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            {isTranslating ? (
                                <div className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                isTranslated ? "Ver original" : "Ver tradução"
                            )}
                        </button>
                    )}
                </div>
            </div>

            {showComments && !post.disableComments && (
                <div className="fixed inset-0 z-[150] bg-black/40 flex items-end justify-center" onClick={() => setShowComments(false)}>
                    <div className="bg-white dark:bg-zinc-950 w-full max-w-lg rounded-t-[2.5rem] h-[70vh] flex flex-col p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <h2 className="text-center font-black text-sm uppercase mb-4">Comentários</h2>
                        <div className="flex-grow overflow-y-auto space-y-4 no-scrollbar">
                            {/* Renderize os comentários aqui */}
                        </div>
                        <form onSubmit={handleAddComment} className="mt-4 flex gap-2">
                            <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Comentar..." className="flex-grow bg-zinc-100 dark:bg-zinc-900 p-3 rounded-2xl text-sm" />
                            <button type="submit" className="text-sky-500 font-bold px-4">Enviar</button>
                        </form>
                    </div>
                </div>
            )}

            <AddCaptionModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                postId={post.id} 
                onCaptionSaved={() => setIsEditModalOpen(false)} 
            />
        </article>
    );
};

export default Post;