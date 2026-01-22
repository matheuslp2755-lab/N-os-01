
import React, { useState, useEffect, useRef } from 'react';
import { 
    auth, db, doc, collection, query, orderBy, onSnapshot, serverTimestamp, 
    updateDoc, addDoc, storage, storageRef, uploadBytes, getDownloadURL, deleteDoc, increment
} from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import { VerifiedBadge } from '../profile/UserProfile';

const ChatWindow: React.FC<{ conversationId: string | null; onBack: () => void; isCurrentUserAnonymous?: boolean }> = ({ conversationId, onBack, isCurrentUserAnonymous }) => {
    const { t } = useLanguage();
    const { startCall } = useCall();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [convData, setConvData] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showAttachments, setShowAttachments] = useState(false);
    const [viewLimit, setViewLimit] = useState<number | null>(null);
    const [selectedEfimeralMedia, setSelectedEfimeralMedia] = useState<any | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!conversationId) return;
        const unsubConv = onSnapshot(doc(db, 'conversations', conversationId), (snap) => setConvData(snap.data()));
        const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubMsgs = onSnapshot(q, (snap) => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubConv(); unsubMsgs(); };
    }, [conversationId]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = async (data: { text?: string, mediaUrl?: string, mediaType?: string, location?: any, viewLimit?: number | null }) => {
        if (!conversationId || !currentUser || !convData) return;

        const msgPayload = {
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            viewersCount: {},
            ...data
        };

        await addDoc(collection(db, 'conversations', conversationId, 'messages'), msgPayload);
        
        await updateDoc(doc(db, 'conversations', conversationId), {
            lastMessage: { 
                text: data.text || `Enviou um(a) ${data.viewLimit ? 'mídia efêmera' : (data.mediaType === 'image' ? 'foto' : 'vídeo')}`, 
                senderId: currentUser.uid, 
                timestamp: serverTimestamp() 
            },
            timestamp: serverTimestamp()
        });
        
        setViewLimit(null);
    };

    const handleSendText = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        await sendMessage({ text: newMessage.trim() });
        setNewMessage('');
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !conversationId) return;

        setIsUploading(true);
        setShowAttachments(false);
        try {
            const path = `chats/${conversationId}/${Date.now()}_${file.name}`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, file);
            const url = await getDownloadURL(ref);
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            
            await sendMessage({ mediaUrl: url, mediaType: type, viewLimit: viewLimit });
        } catch (err) {
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const sendLocation = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(async (pos) => {
            await sendMessage({
                location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                text: "📍 Localização enviada"
            });
            setShowAttachments(false);
        });
    };

    const registerView = async (msgId: string) => {
        if (!currentUser || !conversationId) return;
        const msgRef = doc(db, 'conversations', conversationId, 'messages', msgId);
        await updateDoc(msgRef, {
            [`viewersCount.${currentUser.uid}`]: increment(1)
        });
    };

    const handleOpenEfimeral = (msg: any) => {
        const count = msg.viewersCount?.[currentUser?.uid || ''] || 0;
        if (count >= msg.viewLimit) return;
        setSelectedEfimeralMedia(msg);
    };

    const closeEfimeral = () => {
        if (selectedEfimeralMedia) {
            registerView(selectedEfimeralMedia.id);
            setSelectedEfimeralMedia(null);
        }
    };

    if (!conversationId || !convData) return null;
    const otherUserId = convData.participants.find((p: string) => p !== currentUser?.uid);
    const otherUser = convData.participantInfo[otherUserId || ''];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-black relative">
            <header className="flex items-center justify-between p-4 border-b dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <div className="relative">
                        <img src={otherUser?.avatar} className="w-10 h-10 rounded-full object-cover border dark:border-zinc-800" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-sm flex items-center gap-1">
                            {otherUser?.username}
                            {otherUser?.isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Ativo agora</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => startCall({ id: otherUserId, ...otherUser }, false)} className="p-2.5 text-zinc-600 dark:text-zinc-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/20 rounded-xl transition-all" title="Voz">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </button>
                    <button onClick={() => startCall({ id: otherUserId, ...otherUser }, true)} className="p-2.5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl transition-all" title="Vídeo">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar bg-zinc-50 dark:bg-zinc-950/30">
                {messages.map(msg => {
                    const isMine = msg.senderId === currentUser?.uid;
                    const count = msg.viewersCount?.[currentUser?.uid || ''] || 0;
                    const isEfimeral = msg.viewLimit > 0;
                    const isExpired = isEfimeral && count >= msg.viewLimit;

                    return (
                        <div key={msg.id} className={`flex group/msg ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in relative`}>
                            <div className={`max-w-[80%] rounded-[1.5rem] shadow-sm overflow-hidden relative ${
                                isMine 
                                    ? 'bg-sky-500 text-white rounded-tr-sm' 
                                    : 'bg-white dark:bg-zinc-900 text-black dark:text-white border dark:border-zinc-800 rounded-tl-sm'
                            }`}>
                                {isEfimeral ? (
                                    <div 
                                        onClick={() => !isExpired && handleOpenEfimeral(msg)}
                                        className={`p-4 flex flex-col items-center justify-center gap-3 cursor-pointer min-w-[240px] transition-all ${isExpired ? 'opacity-40 grayscale' : 'hover:bg-black/5'}`}
                                    >
                                        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isExpired ? 'bg-zinc-200 dark:bg-zinc-800' : 'bg-sky-100 dark:bg-sky-950 text-sky-500 animate-pulse'}`}>
                                            {isExpired ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth={2}/></svg> : <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeWidth={2}/></svg>}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-black uppercase tracking-widest">{isExpired ? 'Mídia Expirada' : `Você só pode abrir ${msg.viewLimit} vezes`}</p>
                                            {!isExpired && <p className="text-[10px] opacity-60 font-bold">Toque para visualizar ({count}/{msg.viewLimit})</p>}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {msg.mediaType === 'image' && <img src={msg.mediaUrl} className="w-full max-h-80 object-cover cursor-pointer" onClick={() => window.open(msg.mediaUrl)} />}
                                        {msg.mediaType === 'video' && <video src={msg.mediaUrl} controls className="w-full max-h-80 object-cover" />}
                                        {msg.mediaType === 'audio' && <div className="p-3"><audio src={msg.mediaUrl} controls className="h-8 w-full accent-white" /></div>}
                                        {msg.location && (
                                            <a href={`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`} target="_blank" className="block relative aspect-video w-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <svg className="w-10 h-10 text-red-500 animate-bounce" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                                                </div>
                                                <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-zinc-950/90 px-2 py-1 rounded text-[10px] font-black uppercase">Ver no Maps</div>
                                            </a>
                                        )}
                                        {msg.text && <div className="p-3.5 text-sm font-medium leading-relaxed">{msg.text}</div>}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            <div className="p-4 border-t dark:border-zinc-800 bg-white dark:bg-black relative">
                {showAttachments && (
                    <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-[2.5rem] shadow-2xl p-4 flex flex-col gap-4 animate-slide-up z-20 w-64">
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 px-2">Limite de Abertura</p>
                            <div className="grid grid-cols-4 gap-2 px-2">
                                {[null, 1, 2, 3].map(v => (
                                    <button 
                                        key={v || 'inf'} 
                                        onClick={() => setViewLimit(v)}
                                        className={`py-2 rounded-xl text-[10px] font-black border transition-all ${viewLimit === v ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-transparent text-zinc-400 border-zinc-200 dark:border-zinc-800'}`}
                                    >
                                        {v || '∞'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <button onClick={() => mediaInputRef.current?.click()} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl transition-colors hover:scale-[1.02]">
                                <div className="w-10 h-10 bg-sky-500/10 text-sky-500 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                <span className="text-xs font-black uppercase tracking-tighter">Escolher Mídia</span>
                            </button>
                            <button onClick={sendLocation} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl transition-colors hover:scale-[1.02]">
                                <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                                <span className="text-xs font-black uppercase tracking-tighter">Localização</span>
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAttachments(!showAttachments)} className={`p-2.5 rounded-full transition-all ${showAttachments ? 'bg-indigo-500 text-white rotate-45 shadow-lg' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <form onSubmit={handleSendText} className="flex-grow flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-full py-1.5 px-2">
                        <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Escreva algo..." className="flex-grow bg-transparent py-1.5 px-4 text-sm outline-none font-medium" />
                        <button type="submit" className="p-2 bg-sky-500 text-white rounded-full disabled:opacity-50 active:scale-90 transition-transform"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg></button>
                    </form>
                </div>
            </div>
            
            <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} className="hidden" accept="image/*,video/*" />

            {/* Modal de Mídia Efêmera / Modo Seguro */}
            {selectedEfimeralMedia && (
                <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-0 select-none animate-fade-in" onContextMenu={e => e.preventDefault()}>
                    <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></div>
                            <span className="text-white text-[10px] font-black uppercase tracking-[0.2em]">Visualização Limitada</span>
                        </div>
                        <button onClick={closeEfimeral} className="text-white/40 text-4xl font-thin hover:text-white transition-colors">&times;</button>
                    </header>
                    
                    <div className="w-full h-full flex items-center justify-center">
                        {selectedEfimeralMedia.mediaType === 'video' ? (
                            <video src={selectedEfimeralMedia.mediaUrl} autoPlay className="max-w-full max-h-full" />
                        ) : (
                            <img src={selectedEfimeralMedia.mediaUrl} className="max-w-full max-h-full object-contain pointer-events-none" />
                        )}
                    </div>

                    <footer className="absolute bottom-0 left-0 right-0 p-10 text-center bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.4em]">Proteção de Privacidade Néos Ativa</p>
                    </footer>
                    
                    <style>{`
                        body { overflow: hidden !important; }
                        * { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
                        .no-screenshot { filter: blur(20px); pointer-events: none; }
                    `}</style>
                </div>
            )}
        </div>
    );
};

export default ChatWindow;
