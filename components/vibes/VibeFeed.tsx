import React, { useState, useEffect, useRef } from 'react';
import { db, collection, query, orderBy, limit, doc, updateDoc, arrayUnion, arrayRemove, getDoc, onSnapshot, addDoc, serverTimestamp } from '../../firebase';
import { auth } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import { GoogleGenAI } from "@google/genai";
import { VerifiedBadge } from '../profile/UserProfile';

type VibeType = {
    id: string;
    userId: string;
    videoUrl: string;
    mediaType?: 'image' | 'video';
    caption: string;
    likes: string[];
    commentsCount: number;
    createdAt: any;
    user?: {
        username: string;
        avatar: string;
        isVerified?: boolean;
    };
};

const VibeItem: React.FC<{ vibe: VibeType; isActive: boolean }> = ({ vibe, isActive }) => {
    const { isGlobalMuted, setGlobalMuted } = useCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [replyingTo, setReplyingTo] = useState<any | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const [isTranslated, setIsTranslated] = useState(false);
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [shouldShowTranslate, setShouldShowTranslate] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    const currentUser = auth.currentUser;
    const isLiked = vibe.likes.includes(currentUser?.uid || '');

    useEffect(() => {
        const detect = async () => {
            if (!vibe.caption || vibe.caption.length < 5 || !process.env.API_KEY) return;
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const textToAnalyze = String(vibe.caption || "");
                const res = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: `O texto "${textToAnalyze}" está em Português? Responda apenas SIM ou NAO`,
                });
                if (res.text?.includes("NAO")) setShouldShowTranslate(true);
            } catch (e) {}
        };
        if (isActive) detect();
    }, [isActive, vibe.caption]);

    const handleTranslate = async () => {
        if (isTranslated || translatedText) { setIsTranslated(!isTranslated); return; }
        setIsTranslating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const textToTranslate = String(vibe.caption || "");
            const res = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Traduza para PT-BR de forma natural: "${textToTranslate}"`,
            });
            setTranslatedText(res.text?.trim() || null);
            setIsTranslated(true);
        } catch (e) {} finally { setIsTranslating(false); }
    };

    useEffect(() => {
        if (isActive) {
            if (vibe.mediaType !== 'image' && videoRef.current) {
                videoRef.current.play().catch(() => {});
            }
        } else if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    }, [isActive, vibe.mediaType]);

    useEffect(() => {
        if (showComments) {
            const q = query(collection(db, 'vibes', vibe.id, 'comments'), orderBy('timestamp', 'desc'));
            return onSnapshot(q, (snap) => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        }
    }, [showComments, vibe.id]);

    const handleLike = async () => {
        if (!currentUser) return;
        const ref = doc(db, 'vibes', vibe.id);
        await updateDoc(ref, { likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) });
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser) return;

        if (replyingTo) {
            await addDoc(collection(db, 'vibes', vibe.id, 'comments', replyingTo.id, 'replies'), {
                userId: currentUser.uid,
                username: currentUser.displayName,
                avatar: currentUser.photoURL,
                text: newComment.trim(),
                timestamp: serverTimestamp()
            });
            setReplyingTo(null);
        } else {
            await addDoc(collection(db, 'vibes', vibe.id, 'comments'), {
                userId: currentUser.uid,
                username: currentUser.displayName,
                avatar: currentUser.photoURL,
                text: newComment.trim(),
                timestamp: serverTimestamp()
            });
        }
        
        setNewComment('');
        await updateDoc(doc(db, 'vibes', vibe.id), { commentsCount: (vibe.commentsCount || 0) + 1 });
    };

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);

        try {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;

            const addWatermark = (context: CanvasRenderingContext2D, width: number, height: number) => {
                context.font = "bold 24px sans-serif";
                context.fillStyle = "rgba(255, 255, 255, 0.8)";
                context.shadowColor = "rgba(0, 0, 0, 0.5)";
                context.shadowBlur = 4;
                
                // Top Left
                context.fillText("Powered by Néos", 20, 40);
                
                // Bottom Right
                const text = "Powered by Néos";
                const metrics = context.measureText(text);
                context.fillText(text, width - metrics.width - 20, height - 20);
            };

            if (vibe.mediaType === 'image') {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = vibe.videoUrl;
                await new Promise((res) => (img.onload = res));
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                addWatermark(ctx, canvas.width, canvas.height);
                
                const link = document.createElement('a');
                link.download = `neos-vibe-${Date.now()}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
            } else {
                // For videos, we download the raw source since client-side video watermarking 
                // requires complex libraries like ffmpeg.js which are too heavy.
                // However, as a visual solution, we'll fetch and trigger download.
                const response = await fetch(vibe.videoUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `neos-vibe-${Date.now()}.mp4`;
                link.click();
            }
        } catch (e) {
            console.error("Download error", e);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="relative w-full h-full snap-start bg-black flex items-center justify-center overflow-hidden">
            {vibe.mediaType === 'image' ? (
                <img src={vibe.videoUrl} className="w-full h-full object-contain" alt="Vibe" onLoad={() => setIsLoaded(true)} />
            ) : (
                <video ref={videoRef} src={vibe.videoUrl} className="w-full h-full object-cover" loop playsInline muted={isGlobalMuted} onLoadedData={() => setIsLoaded(true)} />
            )}

            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute right-4 bottom-24 flex flex-col gap-6 items-center z-30">
                <img src={vibe.user?.avatar} className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-lg" alt="User" />
                
                <button onClick={handleLike} className="flex flex-col items-center">
                    <svg className={`w-9 h-9 drop-shadow-lg ${isLiked ? 'text-red-500 fill-current' : 'text-white'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                    <span className="text-white text-xs font-black drop-shadow-md">{vibe.likes.length}</span>
                </button>

                <button onClick={() => setShowComments(true)} className="flex flex-col items-center">
                    <svg className="w-9 h-9 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25z" /></svg>
                    <span className="text-white text-xs font-black drop-shadow-md">{vibe.commentsCount}</span>
                </button>

                <button onClick={handleDownload} disabled={isDownloading} className="flex flex-col items-center group transition-all active:scale-95 disabled:opacity-50">
                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white shadow-xl border border-white/20 group-hover:bg-white/20 transition-colors">
                        {isDownloading ? (
                             <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        )}
                    </div>
                    <span className="text-white text-[10px] font-black mt-2 uppercase tracking-widest drop-shadow-lg">Salvar</span>
                </button>

                <button onClick={() => setGlobalMuted(!isGlobalMuted)} className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white">
                    {isGlobalMuted ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg> : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                </button>
            </div>

            <div className="absolute left-4 bottom-8 z-30 text-white max-w-[80%]">
                <h3 className="font-black text-base flex items-center gap-2 mb-2">
                    @{vibe.user?.username} {vibe.user?.isVerified && <VerifiedBadge className="w-4 h-4" />}
                </h3>
                <div className="flex flex-col">
                    <p className="text-sm font-bold drop-shadow-md transition-all duration-300">
                        {isTranslated && translatedText ? translatedText : vibe.caption}
                    </p>
                    {shouldShowTranslate && (
                        <button 
                            onClick={handleTranslate} 
                            disabled={isTranslating}
                            className="mt-2 text-[10px] font-black text-sky-400 uppercase tracking-widest text-left"
                        >
                            {isTranslating ? "..." : (isTranslated ? "Ver original" : "Ver tradução")}
                        </button>
                    )}
                </div>
            </div>

            {showComments && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-end animate-fade-in" onClick={() => setShowComments(false)}>
                    <div className="bg-zinc-900 w-full rounded-t-[2.5rem] h-[75vh] flex flex-col p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6"></div>
                        <h4 className="text-white font-black text-center text-sm uppercase tracking-widest mb-4">Comentários</h4>
                        <div className="flex-grow overflow-y-auto no-scrollbar space-y-6">
                            {comments.map(c => (
                                <CommentItem key={c.id} comment={c} vibeId={vibe.id} onReply={() => setReplyingTo(c)} />
                            ))}
                        </div>
                        <form onSubmit={handleAddComment} className="mt-4 flex flex-col gap-2">
                            {replyingTo && (
                                <div className="flex items-center justify-between bg-zinc-800 px-4 py-2 rounded-xl">
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Respondendo @{replyingTo.username}</span>
                                    <button onClick={() => setReplyingTo(null)} className="text-zinc-500 font-bold text-xs">X</button>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={replyingTo ? "Sua resposta..." : "Comentar..."} className="flex-grow bg-zinc-800 rounded-2xl p-3 text-sm text-white outline-none" />
                                <button type="submit" className="text-sky-500 font-black text-xs uppercase">Enviar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const CommentItem: React.FC<{ comment: any, vibeId: string, onReply: () => void }> = ({ comment, vibeId, onReply }) => {
    const [replies, setReplies] = useState<any[]>([]);
    const [showReplies, setShowReplies] = useState(false);
    const [isTranslated, setIsTranslated] = useState(false);
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [shouldShowBtn, setShouldShowBtn] = useState(false);

    useEffect(() => {
        const detect = async () => {
            if (!comment.text || comment.text.length < 5 || !process.env.API_KEY) return;
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const textToAnalyze = String(comment.text || "");
                const res = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: `O texto "${textToAnalyze}" está em Português? SIM/NAO`,
                });
                if (res.text?.includes("NAO")) setShouldShowBtn(true);
            } catch (e) {}
        };
        detect();
    }, [comment.text]);

    useEffect(() => {
        const q = query(collection(db, 'vibes', vibeId, 'comments', comment.id, 'replies'), orderBy('timestamp', 'asc'));
        return onSnapshot(q, (snap) => setReplies(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [vibeId, comment.id]);

    const translate = async () => {
        if (isTranslated || translatedText) { setIsTranslated(!isTranslated); return; }
        setIsTranslating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const textToTranslate = String(comment.text || "");
            const res = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Traduza para PT-BR: "${textToTranslate}"`,
            });
            setTranslatedText(res.text?.trim() || null);
            setIsTranslated(true);
        } catch (e) {} finally { setIsTranslating(false); }
    };

    return (
        <div className="flex flex-col">
            <div className="flex gap-3">
                <img src={comment.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" />
                <div className="flex flex-col">
                    <p className="text-xs font-black text-white">@{comment.username}</p>
                    <p className="text-sm text-zinc-300">
                        {isTranslated ? translatedText : comment.text}
                    </p>
                    <div className="flex gap-4 mt-1">
                        {shouldShowBtn && (
                            <button onClick={translate} className="text-[10px] font-black text-zinc-500 uppercase">
                                {isTranslating ? "..." : (isTranslated ? "Ver original" : "Ver tradução")}
                            </button>
                        )}
                        <button onClick={onReply} className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Responder</button>
                    </div>
                </div>
            </div>

            {replies.length > 0 && (
                <div className="ml-11 mt-4">
                    {!showReplies ? (
                        <button onClick={() => setShowReplies(true)} className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <div className="w-8 h-px bg-zinc-700"></div>
                            Ver {replies.length} respostas
                        </button>
                    ) : (
                        <div className="space-y-4">
                            {replies.map(r => (
                                <div key={r.id} className="flex gap-3">
                                    <img src={r.avatar} className="w-6 h-6 rounded-full object-cover shrink-0" />
                                    <div className="flex flex-col">
                                        <p className="text-[10px] font-black text-white">@{r.username}</p>
                                        <p className="text-xs text-zinc-400">{r.text}</p>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setShowReplies(false)} className="text-[10px] font-black text-zinc-600 uppercase">Ocultar</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const VibeFeed: React.FC = () => {
    const [vibes, setVibes] = useState<VibeType[]>([]);
    const [activeIdx, setActiveIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const q = query(collection(db, 'vibes'), orderBy('createdAt', 'desc'), limit(20));
        return onSnapshot(q, async (snap) => {
            const items = await Promise.all(snap.docs.map(async d => {
                const data = d.data();
                const u = await getDoc(doc(db, 'users', data.userId));
                return { id: d.id, ...data, user: u.exists() ? u.data() : { username: 'vibe_user', avatar: '' } } as VibeType;
            }));
            setVibes(items);
            setLoading(false);
        });
    }, []);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const idx = Math.round(containerRef.current.scrollTop / containerRef.current.clientHeight);
        if (idx !== activeIdx) setActiveIdx(idx);
    };

    if (loading) return <div className="h-full bg-black flex items-center justify-center"><div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>;

    return (
        <div ref={containerRef} onScroll={handleScroll} className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-black">
            {vibes.map((v, i) => (
                <div key={v.id} className="h-full w-full snap-start">
                    <VibeItem vibe={v} isActive={i === activeIdx} />
                </div>
            ))}
        </div>
    );
};

export default VibeFeed;