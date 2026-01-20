import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 'ultra_analog' | 'cinematic_pro' | 'soft_pastel' | 'vhs_lofi';
type LensMM = 24 | 35 | 50 | 85 | 101;
type CamMode = 'photo' | 'video';

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    sharpness: number;
    grain: number;
    saturation: number;
    temp: number;
    vignette: number;
}

const CAMERA_ENGINE_PACKS: Record<VibeEffect, EffectConfig> = {
    ultra_analog: { 
        id: 'ultra_analog', name: 'Kodak 400', label: '🎞️', 
        exposure: 1.05, contrast: 1.2, highlights: -0.1, shadows: 0.1, 
        sharpness: 30, grain: 12, saturation: 1.1, temp: 5, vignette: 0.1
    },
    cinematic_pro: { 
        id: 'cinematic_pro', name: 'Arri Raw', label: '🎬', 
        exposure: 1.0, contrast: 1.3, highlights: -0.2, shadows: 0.2, 
        sharpness: 50, grain: 5, saturation: 1.2, temp: -5, vignette: 0.2
    },
    soft_pastel: { 
        id: 'soft_pastel', name: 'Fuji Astia', label: '🌸', 
        exposure: 1.15, contrast: 0.9, highlights: 0.1, shadows: 0.2, 
        sharpness: 10, grain: 8, saturation: 0.95, temp: 10, vignette: 0.05
    },
    vhs_lofi: { 
        id: 'vhs_lofi', name: 'VHS-C', label: '📼', 
        exposure: 1.1, contrast: 0.8, highlights: -0.1, shadows: 0.3, 
        sharpness: 0, grain: 40, saturation: 0.8, temp: -10, vignette: 0.3
    }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('ultra_analog');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [camMode, setCamMode] = useState<CamMode>('photo');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [capturedMedia, setCapturedMedia] = useState<{url: string, type: CamMode}[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [selectedItem, setSelectedItem] = useState<{url: string, type: CamMode} | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [focusPos, setFocusPos] = useState({ x: 50, y: 50, active: false });

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);

    const getLensZoom = (mm: LensMM) => {
        switch(mm) {
            case 24: return 1.0;
            case 35: return 1.4;
            case 50: return 2.0;
            case 85: return 3.2;
            case 101: return 4.5;
            default: return 1.0;
        }
    };

    const handleFocus = (e: React.MouseEvent | React.TouchEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;
        setFocusPos({ x, y, active: true });
        
        if (streamRef.current) {
            const track = streamRef.current.getVideoTracks()[0];
            const caps = track.getCapabilities() as any;
            if (caps.focusMode) {
                track.applyConstraints({
                    advanced: [{ focusMode: 'manual', pointsOfInterest: [{x: clientX, y: clientY}] }] as any
                }).catch(() => {});
            }
        }
        setTimeout(() => setFocusPos(prev => ({ ...prev, active: false })), 1200);
    };

    const applyAIPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${config.temp}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        if (config.grain > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = 'white';
            ctx.globalAlpha = config.grain / 255;
            for(let i=0; i < (isFinal ? 15000 : 1500); i++) {
                ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
            }
            ctx.globalAlpha = 1.0;
        }

        if (config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.9);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette + 0.4})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        if (isFinal) {
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            ctx.font = `bold ${Math.round(h * 0.03)}px Courier, monospace`;
            ctx.fillStyle = '#fbbf24';
            ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
            ctx.fillText(dateStr, w * 0.08, h * 0.94);
            ctx.font = `900 ${Math.round(h * 0.015)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'right';
            ctx.fillText("PARADISE OPTICS", w * 0.92, h * 0.94);
        }
        ctx.restore();
    };

    const renderLoop = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
            requestRef.current = requestAnimationFrame(renderLoop);
            return;
        }

        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
            if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
            
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            applyAIPipeline(ctx, canvas.width, canvas.height, CAMERA_ENGINE_PACKS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                requestRef.current = requestAnimationFrame(renderLoop);
            }
        } catch (err) { console.error(err); }
    }, [facingMode, renderLoop]);

    useEffect(() => {
        if (isOpen) startCamera();
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen, startCamera]);

    const handleCapture = () => {
        if (camMode === 'video') {
            if (isRecording) stopRecording(); else startRecording();
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 100);

        // O SEGREDO DO RECORTE:
        const zoom = getLensZoom(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        
        // Calculamos a largura que o usuário "vê" dentro da moldura arredondada
        // A moldura ocupa 85% da largura da tela, mas aqui usamos a escala inversa do zoom
        const sourceWidth = vw / zoom;
        const sourceHeight = sourceWidth * (4/3); // Proporção fixa 3:4 da moldura

        const sx = (vw - sourceWidth) / 2;
        const sy = (vh - sourceHeight) / 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1080; 
        outCanvas.height = 1440;
        const oCtx = outCanvas.getContext('2d');
        
        if (oCtx) {
            // Desenhamos APENAS a região central (janela de zoom) no canvas final
            oCtx.drawImage(canvas, sx, sy, sourceWidth, sourceHeight, 0, 0, 1080, 1440);
            applyAIPipeline(oCtx, 1080, 1440, CAMERA_ENGINE_PACKS[activeVibe], true);
            setCapturedMedia(prev => [{url: outCanvas.toDataURL('image/jpeg', 0.9), type: 'photo'}, ...prev]);
        }
    };

    const startRecording = () => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9' });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
            setCapturedMedia(prev => [{url: URL.createObjectURL(blob), type: 'video'}, ...prev]);
        };
        recorder.start();
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = window.setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    if (!isOpen) return null;

    const currentZoom = getLensZoom(lensMM);

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none select-none">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl shadow-2xl active:scale-90">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-5 py-2 rounded-full border border-white/10 shadow-2xl">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[11px] font-black transition-all ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/40'}`}>{mm}mm</button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden" onMouseDown={handleFocus} onTouchStart={handleFocus}>
                <video ref={videoRef} className="hidden" playsInline muted />
                
                {/* Visualização centralizada com o zoom da lente */}
                <div className="w-full h-full flex items-center justify-center transition-transform duration-700 ease-in-out" style={{ transform: `scale(${currentZoom})` }}>
                    <canvas ref={canvasRef} className="w-full h-full object-cover" />
                </div>

                {/* Retícula de Foco */}
                {focusPos.active && (
                    <div 
                        className="absolute w-16 h-16 border-2 border-sky-400 rounded-lg animate-focus-pulse pointer-events-none z-40"
                        style={{ left: `${focusPos.x}%`, top: `${focusPos.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                        <div className="absolute inset-0 border border-sky-400/20 scale-150 rounded-lg"></div>
                    </div>
                )}

                {/* MOLDURA DE RECORTE REAL */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <div 
                        className="border-4 border-white/40 rounded-[3rem] shadow-[0_0_0_4000px_rgba(0,0,0,0.85)] transition-all duration-700"
                        style={{ width: `${85 / currentZoom}%`, aspectRatio: '3/4' }}
                    >
                         {isRecording && (
                            <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full shadow-lg">
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest">{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
                            </div>
                         )}
                         <div className="absolute bottom-6 left-6 opacity-40 flex flex-col gap-0.5">
                            <span className="text-[10px] font-black tracking-widest">{lensMM}MM AF ACTIVE</span>
                            <span className="text-[8px] font-bold uppercase">RECORTE AUTOMÁTICO</span>
                         </div>
                    </div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-6">
                    {/* Seletor de Modo */}
                    <div className="flex justify-center gap-10 mb-2">
                        <button onClick={() => setCamMode('photo')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${camMode === 'photo' ? 'text-white' : 'text-zinc-600'}`}>Foto</button>
                        <button onClick={() => setCamMode('video')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${camMode === 'video' ? 'text-red-500' : 'text-zinc-600'}`}>Vídeo</button>
                    </div>

                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2 items-center justify-center">
                        {Object.values(CAMERA_ENGINE_PACKS).map(eff => (
                            <button key={eff.id} onClick={() => setActiveVibe(eff.id)} className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl border ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest">{eff.name.split(' ')[0]}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between px-10">
                        <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-lg active:scale-95 transition-all">
                            {capturedMedia.length > 0 && (
                                capturedMedia[0].type === 'video' 
                                ? <video src={capturedMedia[0].url} className="w-full h-full object-cover" /> 
                                : <img src={capturedMedia[0].url} className="w-full h-full object-cover" />
                            )}
                        </button>
                        <button 
                            onClick={handleCapture} 
                            className={`w-20 h-20 rounded-full border-4 p-1 active:scale-90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] ${isRecording ? 'border-red-500' : 'border-white/30'}`}
                        >
                            <div className={`w-full h-full rounded-full transition-all duration-300 ${isRecording ? 'bg-red-500 scale-75 rounded-lg' : 'bg-white'}`}></div>
                        </button>
                        <div className="w-14"></div>
                    </div>
                </div>
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/95">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Sair</button>
                        <h3 className="font-black uppercase tracking-[0.3em] text-xs">Galeria do Paraíso</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5">
                        {capturedMedia.map((item, i) => (
                            <div key={i} className="aspect-[3/4] cursor-pointer active:opacity-70 relative" onClick={() => setSelectedItem(item)}>
                                {item.type === 'video' 
                                ? <video src={item.url} className="w-full h-full object-cover" /> 
                                : <img src={item.url} className="w-full h-full object-cover" />}
                                {item.type === 'video' && <div className="absolute top-2 right-2"><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /><path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg></div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedItem && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in p-6 items-center justify-center">
                    <div className="absolute top-10 left-10 z-10">
                        <button onClick={() => setSelectedItem(null)} className="p-3 bg-white/10 backdrop-blur-xl rounded-full border border-white/10">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    </div>
                    <div className="w-full max-w-sm aspect-[3/4] rounded-[2.5rem] overflow-hidden shadow-2xl bg-zinc-900 border border-white/10">
                        {selectedItem.type === 'video' 
                        ? <video src={selectedItem.url} className="w-full h-full object-cover" controls autoPlay loop /> 
                        : <img src={selectedItem.url} className="w-full h-full object-cover" />}
                    </div>
                    <div className="mt-12 flex gap-4 w-full max-w-sm">
                        <button onClick={() => { setCapturedMedia(prev => prev.filter(i => i.url !== selectedItem.url)); setSelectedItem(null); }} className="flex-1 py-4 rounded-2xl bg-zinc-900 text-red-500 font-black uppercase text-[10px] tracking-widest border border-red-500/20 active:scale-95 transition-all">Apagar</button>
                        <button onClick={() => { const a = document.createElement('a'); a.href = selectedItem.url; a.download = `Paradise_${Date.now()}`; a.click(); }} className="flex-1 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all">Salvar</button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes focus-pulse { 0% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-focus-pulse { animation: focus-pulse 0.4s ease-out forwards; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;