
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import { auth, db, collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from '../../firebase';
import Button from '../common/Button';

const LiveViewerModal: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
    const { t } = useLanguage();
    const { activeLive, leaveLive, endLive, localStream } = useCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [showConfirmEnd, setShowConfirmEnd] = useState(false);

    useEffect(() => {
        if (!isOpen || !activeLive?.liveId) return;
        
        if (activeLive.isHost && localStream && videoRef.current) {
            videoRef.current.srcObject = localStream;
        }

        const q = query(
            collection(db, 'lives', activeLive.liveId, 'comments'),
            orderBy('timestamp', 'asc'),
            limit(50)
        );

        return onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
    }, [isOpen, activeLive, localStream]);

    const handleSendComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!comment.trim() || !activeLive?.liveId) return;
        const text = comment;
        setComment('');
        await addDoc(collection(db, 'lives', activeLive.liveId, 'comments'), {
            userId: auth.currentUser?.uid,
            username: auth.currentUser?.displayName,
            avatar: auth.currentUser?.photoURL,
            text,
            timestamp: serverTimestamp()
        });
    };

    if (!isOpen || !activeLive) return null;

    return (
        <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden animate-fade-in">
            <div className="relative flex-grow bg-zinc-900">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    muted={activeLive.isHost} 
                    playsInline 
                    className={`w-full h-full object-cover ${activeLive.isHost ? 'mirrored' : ''}`}
                    style={activeLive.isHost ? { transform: 'scaleX(-1)' } : {}}
                />

                {/* Overlays */}
                <div className="absolute top-6 left-6 flex items-center gap-3 z-30">
                    <div className="bg-red-600 px-3 py-1 rounded-md text-white text-[10px] font-black uppercase animate-pulse shadow-lg tracking-widest">
                        AO VIVO
                    </div>
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-md text-white text-[10px] font-black flex items-center gap-2">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        {Math.floor(Math.random() * 10) + 1}
                    </div>
                </div>

                <button onClick={() => activeLive.isHost ? setShowConfirmEnd(true) : leaveLive()} className="absolute top-6 right-6 z-30 text-white/60 hover:text-white text-3xl font-light">&times;</button>

                {/* Chat Display */}
                <div className="absolute bottom-24 left-4 right-4 z-20 max-h-[40%] overflow-y-auto no-scrollbar pointer-events-none">
                    <div className="flex flex-col gap-2">
                        {comments.map(c => (
                            <div key={c.id} className="flex items-start gap-2 animate-slide-up">
                                <img src={c.avatar} className="w-7 h-7 rounded-full object-cover border border-white/20" />
                                <div className="bg-black/30 backdrop-blur-sm p-2 rounded-xl">
                                    <p className="text-[10px] font-black text-white/70">@{c.username}</p>
                                    <p className="text-sm text-white font-medium leading-tight">{c.text}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={scrollRef} />
                    </div>
                </div>

                {/* Footer Input */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-30">
                    <form onSubmit={handleSendComment} className="flex items-center gap-3">
                        <input 
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Comentar ao vivo..."
                            className="flex-grow bg-white/10 backdrop-blur-xl border border-white/20 rounded-full py-3 px-6 text-white text-sm outline-none placeholder:text-white/40"
                        />
                        <button type="submit" className="p-3 bg-white rounded-full text-black shadow-xl active:scale-90 transition-all">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                        </button>
                    </form>
                </div>
            </div>

            {showConfirmEnd && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[210] p-6">
                    <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] w-full max-w-sm text-center">
                        <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">Encerrar Live?</h3>
                        <p className="text-zinc-500 text-sm mb-8">Esta transmissão e todos os comentários serão deletados permanentemente.</p>
                        <div className="flex flex-col gap-3">
                            <Button onClick={endLive} className="!bg-red-600 !py-4 !rounded-2xl !font-black !uppercase !tracking-widest">Encerrar Agora</Button>
                            <button onClick={() => setShowConfirmEnd(false)} className="py-2 text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Continuar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveViewerModal;
