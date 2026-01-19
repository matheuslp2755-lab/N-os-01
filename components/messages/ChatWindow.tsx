import React, { useState, useEffect, useRef } from 'react';
import { 
    auth, db, doc, collection, query, orderBy, onSnapshot, serverTimestamp, 
    updateDoc, addDoc, storage, storageRef, uploadBytes, getDownloadURL, deleteDoc 
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
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [showAttachments, setShowAttachments] = useState(false);
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!conversationId) return;
        const unsubConv = onSnapshot(doc(db, 'conversations', conversationId), (snap) => setConvData(snap.data()));
        const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubMsgs = onSnapshot(q, (snap) => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubConv(); unsubMsgs(); };
    }, [conversationId]);

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = async (data: { text?: string, mediaUrl?: string, mediaType?: string, location?: any }) => {
        if (!conversationId || !currentUser || !convData) return;

        const msgPayload = {
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            ...data
        };

        await addDoc(collection(db, 'conversations', conversationId, 'messages'), msgPayload);
        
        await updateDoc(doc(db, 'conversations', conversationId), {
            lastMessage: { 
                text: data.text || `Enviou um(a) ${data.mediaType || 'mídia'}`, 
                senderId: currentUser.uid, 
                timestamp: serverTimestamp() 
            },
            timestamp: serverTimestamp()
        });
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!conversationId || !window.confirm("Deseja apagar esta mensagem para todos?")) return;
        try {
            await deleteDoc(doc(db, 'conversations', conversationId, 'messages', messageId));
        } catch (err) {
            console.error("Erro ao apagar mensagem:", err);
        }
    };

    const handleSendText = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newMessage.trim()) return;
        const text = newMessage.trim();
        setNewMessage('');
        await sendMessage({ text, mediaType: 'text' });
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
            await sendMessage({ mediaUrl: url, mediaType: type });
        } catch (err) {
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            recorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                setIsUploading(true);
                const path = `chats/${conversationId}/audio_${Date.now()}.webm`;
                const ref = storageRef(storage, path);
                await uploadBytes(ref, audioBlob);
                const url = await getDownloadURL(ref);
                await sendMessage({ mediaUrl: url, mediaType: 'audio' });
                setIsUploading(false);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = window.setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            alert("Erro ao acessar microfone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const sendLocation = () => {
        setShowAttachments(false);
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            await sendMessage({ 
                location: { lat: latitude, lng: longitude },
                mediaType: 'location',
                text: "📍 Localização enviada"
            });
        }, () => alert("Erro ao obter localização."));
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
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
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
                    <button onClick={() => startCall({ id: otherUserId, ...otherUser }, false)} className="p-2.5 text-zinc-600 dark:text-zinc-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/20 rounded-xl transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </button>
                    <button onClick={() => startCall({ id: otherUserId, ...otherUser }, true)} className="p-2.5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar bg-zinc-50 dark:bg-zinc-950/30">
                {messages.map(msg => {
                    const isSystem = msg.senderId === 'system_call_log';
                    const isMine = msg.senderId === currentUser?.uid;
                    
                    if (isSystem) {
                        return (
                            <div key={msg.id} className="flex justify-center my-4 animate-fade-in">
                                <div className="bg-zinc-100 dark:bg-zinc-900/50 px-4 py-2 rounded-2xl border dark:border-zinc-800 flex items-center gap-3">
                                    <div className={`p-1.5 rounded-full ${msg.isVideo ? 'bg-indigo-500/10 text-indigo-500' : 'bg-sky-500/10 text-sky-500'}`}>
                                        {msg.isVideo ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                                    </div>
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{msg.text}</span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className={`flex group/msg ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in relative`}>
                            {isMine && (
                                <button 
                                    onClick={() => handleDeleteMessage(msg.id)} 
                                    className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-2 text-zinc-400 hover:text-red-500 mr-2 self-center"
                                    title="Apagar mensagem"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                            )}
                            <div className={`max-w-[80%] rounded-[1.5rem] shadow-sm overflow-hidden relative ${
                                isMine 
                                    ? 'bg-sky-500 text-white rounded-tr-sm' 
                                    : 'bg-white dark:bg-zinc-900 text-black dark:text-white border dark:border-zinc-800 rounded-tl-sm'
                            }`}>
                                {msg.mediaType === 'image' && <img src={msg.mediaUrl} className="w-full max-h-80 object-cover cursor-pointer" onClick={() => window.open(msg.mediaUrl)} />}
                                {msg.mediaType === 'video' && <video src={msg.mediaUrl} controls className="w-full max-h-80 object-cover" />}
                                {msg.mediaType === 'audio' && (
                                    <div className="p-3 flex items-center gap-3 min-w-[200px]">
                                        <audio src={msg.mediaUrl} controls className="h-8 w-full accent-white" />
                                    </div>
                                )}
                                {msg.mediaType === 'location' && (
                                    <a href={`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`} target="_blank" rel="noopener" className="p-4 flex flex-col gap-2 hover:bg-black/5 transition-colors">
                                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                                            Minha Localização
                                        </div>
                                        <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-[10px] uppercase font-black text-zinc-500">Ver no Mapa</div>
                                    </a>
                                )}
                                {msg.text && <div className="p-3.5 text-sm font-medium leading-relaxed">{msg.text}</div>}
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            <div className="p-4 border-t dark:border-zinc-800 bg-white dark:bg-black relative">
                {showAttachments && (
                    <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-3xl shadow-2xl p-2 flex flex-col gap-1 animate-slide-up z-20">
                        <button onClick={() => mediaInputRef.current?.click()} className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors">
                            <div className="w-10 h-10 bg-sky-500/10 text-sky-500 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                            <span className="text-xs font-bold uppercase tracking-widest pr-4">Fotos e Vídeos</span>
                        </button>
                        <button onClick={sendLocation} className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors">
                            <div className="w-10 h-10 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                            <span className="text-xs font-bold uppercase tracking-widest pr-4">Localização</span>
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <button onClick={() => setShowAttachments(!showAttachments)} className={`p-2.5 rounded-full transition-all ${showAttachments ? 'bg-sky-500 text-white rotate-45' : 'text-zinc-500'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>
                    </button>
                    
                    {isRecording ? (
                        <div className="flex-grow flex items-center gap-4 bg-red-500/10 rounded-full px-5 py-2 border border-red-500/20">
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-red-500 font-mono text-sm font-black">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                            <button onClick={stopRecording} className="bg-red-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-lg">Parar</button>
                        </div>
                    ) : (
                        <form onSubmit={handleSendText} className="flex-grow flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-full py-1.5 px-2">
                            <input 
                                type="text" 
                                value={newMessage} 
                                onChange={e => setNewMessage(e.target.value)} 
                                placeholder="Mensagem..." 
                                className="flex-grow bg-transparent py-1.5 px-4 text-sm outline-none font-medium" 
                            />
                            {newMessage.trim() ? (
                                <button type="submit" className="p-2 bg-sky-500 text-white rounded-full"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg></button>
                            ) : (
                                <button type="button" onClick={startRecording} className="p-2.5 text-zinc-500 hover:text-sky-500"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>
                            )}
                        </form>
                    )}
                </div>
            </div>
            
            <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} className="hidden" accept="image/*,video/*" />
        </div>
    );
};

export default ChatWindow;