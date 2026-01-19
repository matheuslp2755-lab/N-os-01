import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../../context/CallContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '../../firebase';
import Button from '../common/Button';

const CallTimer: React.FC = () => {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, []);
    const formatTime = (ts: number) => {
        const m = Math.floor(ts / 60).toString().padStart(2, '0');
        const s = (ts % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    return <p className="text-sm font-mono text-white/70">{formatTime(seconds)}</p>;
};

const CallUI: React.FC = () => {
    const { 
        activeCall, localStream, remoteStream, hangUp, answerCall, declineCall, 
        switchCamera, isVideoEnabled, toggleVideo, isAudioEnabled, toggleAudio,
        callTimeoutReached, startCall, resetCallState
    } = useCall();
    const { t } = useLanguage();
    
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const ringtoneRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (activeCall?.status === 'ringing-incoming') {
            ringtoneRef.current?.play().catch(() => {});
        } else {
            ringtoneRef.current?.pause();
            if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
        }
    }, [activeCall?.status]);

    useEffect(() => {
        if ((activeCall?.status === 'connected' || activeCall?.status === 'ringing-outgoing') && !callTimeoutReached) {
            if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
            if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [localStream, remoteStream, activeCall?.status, callTimeoutReached]);

    if (!activeCall) return null;

    const otherUser = activeCall.receiver.id === auth.currentUser?.uid ? activeCall.caller : activeCall.receiver;
    const isVideo = activeCall.isVideo;

    // Vista de chamada não aceita (Timeout)
    if (callTimeoutReached) {
        return (
            <div className="fixed inset-0 bg-zinc-950/98 backdrop-blur-3xl z-[500] flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="relative mb-10">
                    <img src={otherUser.avatar || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="w-32 h-32 rounded-full border-4 border-zinc-800 object-cover grayscale opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-12 h-12 text-red-500/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18.364 5.636L5.636 18.364M5.636 5.636l12.728 12.728" /></svg>
                    </div>
                </div>
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">A chamada não foi aceita</h2>
                <p className="text-zinc-500 text-sm mb-12 font-medium">Tente ligar novamente em alguns instantes.</p>

                <div className="flex flex-col gap-4 w-full max-w-xs">
                    <Button 
                        onClick={() => startCall(otherUser, isVideo)} 
                        className="!py-5 !rounded-2xl !bg-sky-500 !text-white !font-black !uppercase !tracking-widest shadow-xl shadow-sky-500/10 active:scale-95 transition-all"
                    >
                        Ligar Novamente
                    </Button>
                    <button 
                        onClick={resetCallState} 
                        className="py-4 text-zinc-400 font-bold uppercase text-xs tracking-[0.2em] hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    // Vista de chamada entrando
    if (activeCall.status === 'ringing-incoming') {
        return (
            <div className="fixed inset-0 bg-zinc-950/95 backdrop-blur-2xl z-[500] flex flex-col items-center justify-center p-8 animate-fade-in">
                <audio ref={ringtoneRef} src="https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3" loop />
                <div className="relative mb-12">
                    <div className="absolute inset-0 bg-sky-500/20 rounded-full animate-ping"></div>
                    <img src={otherUser.avatar || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="relative w-40 h-40 rounded-full border-4 border-white/10 object-cover shadow-2xl z-10" />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2 italic">{otherUser.username}</h2>
                <p className="text-sky-400 font-bold uppercase tracking-[0.3em] text-xs mb-20">Chamada de {isVideo ? 'Vídeo' : 'Voz'}</p>

                <div className="flex gap-12">
                    <button onClick={declineCall} className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all border-4 border-white/20">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <button onClick={answerCall} className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all animate-bounce border-4 border-white/20">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                    </button>
                </div>
            </div>
        );
    }

    // Vista de chamada ativa ou chamando
    return (
        <div className="fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden animate-fade-in">
            {isVideo ? (
                <>
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute top-6 right-6 w-32 h-48 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900 z-30 group">
                        <video ref={localVideoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`} style={{ transform: 'scaleX(-1)' }} />
                        {!isVideoEnabled && (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </div>
                        )}
                        <button onClick={switchCamera} className="absolute bottom-2 right-2 p-2 bg-black/40 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    </div>
                </>
            ) : (
                <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center">
                    <img src={otherUser.avatar || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="w-48 h-48 rounded-full border-8 border-white/5 object-cover mb-8" />
                    <div className="bg-sky-500/10 px-6 py-2 rounded-full border border-sky-500/20">
                        <div className="flex gap-1">
                            {[1,2,3,4].map(i => <div key={i} className="w-1 bg-sky-500 rounded-full animate-wave" style={{ animationDelay: `${i*0.1}s`, height: '12px' }}></div>)}
                        </div>
                    </div>
                </div>
            )}

            <div className="absolute top-8 left-8 z-20 flex flex-col gap-1">
                <p className="text-white font-black text-2xl tracking-tighter drop-shadow-xl">
                    {otherUser.username}
                    {activeCall.status === 'ringing-outgoing' && <span className="ml-2 text-xs text-sky-400 animate-pulse tracking-widest uppercase">(Chamando...)</span>}
                </p>
                {activeCall.status === 'connected' && <CallTimer />}
            </div>

            <div className="absolute bottom-12 left-0 right-0 z-40 flex items-center justify-center px-6">
                <div className="bg-white/10 backdrop-blur-3xl p-4 rounded-[4rem] border border-white/10 flex items-center gap-6 shadow-2xl">
                    <button onClick={toggleAudio} className={`p-5 rounded-full transition-all ${isAudioEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'}`}>
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                    
                    {isVideo && (
                        <button onClick={toggleVideo} className={`p-5 rounded-full transition-all ${isVideoEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'}`}>
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                    )}

                    <button onClick={hangUp} className="p-6 bg-red-500 rounded-full text-white shadow-2xl border-4 border-white/20 hover:bg-red-600 active:scale-90 transition-all">
                        <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes wave { 0%, 100% { height: 8px; } 50% { height: 24px; } }
                .animate-wave { animation: wave 1s ease-in-out infinite; }
            `}</style>
        </div>
    );
};

export default CallUI;