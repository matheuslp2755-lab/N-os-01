import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 
    | 'vibes' 
    | 'aesthetic' 
    | 'anos2000' 
    | 'anos2016' 
    | 'ultra4k' 
    | 'girls';

type LensMM = 24 | 35 | 50 | 85 | 101;

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    saturation: number;
    temp: number;
    clarity: number;
    sharpness: number;
    grain: number;
    vignette: number;
    magenta?: number;
    glow?: number;
    skinSoft?: number;
    retroDate?: boolean;
}

const NEW_PRESETS: Record<VibeEffect, EffectConfig> = {
    vibes: { id: 'vibes', name: 'Vibes', label: '🌈', exposure: 1.1, contrast: 1.08, highlights: 0.9, shadows: 1.1, saturation: 1.06, temp: 2, clarity: 4, sharpness: 1.2, grain: 0, vignette: 0.1, skinSoft: 0.3 },
    aesthetic: { id: 'aesthetic', name: 'Aesthetic', label: '✨', exposure: 1.2, contrast: 0.94, highlights: 0.8, shadows: 1.3, saturation: 0.96, temp: 6, magenta: 2, clarity: -8, sharpness: 1.1, grain: 10, vignette: 0.2, skinSoft: 0.6, retroDate: true },
    anos2000: { id: 'anos2000', name: '2000s', label: '💿', exposure: 1.0, contrast: 1.14, highlights: 1.2, shadows: 0.9, saturation: 1.12, temp: -4, clarity: 12, sharpness: 1.6, grain: 22, vignette: 0.3, glow: 0.4, retroDate: true },
    anos2016: { id: 'anos2016', name: '2016', label: '📱', exposure: 1.05, contrast: 1.18, highlights: 0.9, shadows: 1.1, saturation: 1.14, temp: 4, clarity: 10, sharpness: 1.4, grain: 0, vignette: 0.15 },
    ultra4k: { id: 'ultra4k', name: '4K Ultra', label: '🎥', exposure: 1.0, contrast: 1.06, highlights: 0.92, shadows: 1.12, saturation: 1.04, temp: 0, clarity: 10, sharpness: 1.8, grain: 0, vignette: 0 },
    girls: { id: 'girls', name: 'Girls', label: '💕', exposure: 1.3, contrast: 0.92, highlights: 0.82, shadows: 1.35, saturation: 1.06, temp: 8, magenta: 4, clarity: -12, sharpness: 0.9, grain: 0, vignette: 0.1, skinSoft: 0.8, glow: 0.5 }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('vibes');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [flashOn, setFlashOn] = useState(false);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<number | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);
    const touchStartRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => ({ 24: 1.0, 35: 1.3, 50: 1.8, 85: 2.6, 101: 3.2 }[mm]);

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        // RESET FILTER TO APPLY NEW ONE
        ctx.filter = 'none';
        
        const hue = config.temp + (config.magenta || 0);
        
        // Build filter string
        const filterStr = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${hue}deg) blur(${config.skinSoft ? config.skinSoft * 0.5 : 0}px)`;
        
        // Temporary canvas to process the current frame with filters
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        if(tCtx) {
            tCtx.filter = filterStr;
            tCtx.drawImage(ctx.canvas, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(tempCanvas, 0, 0);
        }

        // Bloom/Glow effect
        if (config.glow && config.glow > 0) {
            ctx.save();
            ctx.globalAlpha = config.glow * 0.3;
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = `blur(${Math.round(w * 0.04)}px) brightness(1.2)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // Grain simulation
        if (config.grain > 0) {
            ctx.save();
            ctx.globalAlpha = config.grain / 100;
            ctx.globalCompositeOperation = 'overlay';
            for (let i = 0; i < 50; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
                ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            }
            ctx.restore();
        }

        if (isFinal) {
            ctx.save();
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            
            ctx.font = `bold ${Math.round(h * 0.035)}px monospace`;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6;
            ctx.fillText(dateStr, w * 0.08, h * 0.92);
            
            ctx.font = `900 ${Math.round(h * 0.02)}px sans-serif`;
            ctx.fillText("NÉOS PARADISE PRO", w * 0.08, h * 0.88);
            ctx.restore();
        }

        // Vignette
        if (config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
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
            
            const vw = canvas.width;
            const vh = canvas.height;

            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(vw, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();

            applyQualityPipeline(ctx, vw, vh, NEW_PRESETS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                requestRef.current = requestAnimationFrame(renderLoop);
            }
        } catch (err) {
            console.error("Camera error", err);
        }
    }, [facingMode, renderLoop]);

    useEffect(() => {
        if (isOpen) startCamera();
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isOpen, startCamera]);

    const executeCapture = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), flashOn ? 150 : 50);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        const outW = vw / zoom;
        const outH = vh / zoom;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = outW; outCanvas.height = outH;
        const oCtx = outCanvas.getContext('2d');
        if(oCtx) {
            oCtx.drawImage(canvas, (vw-outW)/2, (vh-outH)/2, outW, outH, 0, 0, outW, outH);
            applyQualityPipeline(oCtx, outW, outH, NEW_PRESETS[activeVibe], true);
        }

        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 0.95), ...prev]);
    };

    const handleDelete = (index: number) => {
        if (window.confirm("Deseja excluir esta foto?")) {
            setCapturedImages(prev => prev.filter((_, i) => i !== index));
            setFullscreenImage(null);
        }
    };

    const handleSaveLocal = async (dataUrl: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Néos_Paradise_${Date.now()}.jpg`;
        link.click();
    };

    const handleSaveToPost = async (dataUrl: string) => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const fileRef = storageRef(storage, `paradise/${auth.currentUser?.uid}/${Date.now()}.jpg`);
            await uploadBytes(fileRef, blob);
            const url = await getDownloadURL(fileRef);

            await addDoc(collection(db, 'posts'), {
                userId: auth.currentUser?.uid,
                username: auth.currentUser?.displayName,
                userAvatar: auth.currentUser?.photoURL,
                imageUrl: url,
                media: [{ url, type: 'image' }],
                caption: `📸 Paradise Pro | ${NEW_PRESETS[activeVibe].name} (${lensMM}mm)`,
                likes: [],
                timestamp: serverTimestamp()
            });
            alert("Sua obra foi postada no Néos!");
            setFullscreenImage(null);
            setViewingGallery(false);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartRef.current === null || fullscreenImage === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStartRef.current - touchEnd;

        if (Math.abs(diff) > 50) {
            if (diff > 0 && fullscreenImage < capturedImages.length - 1) {
                setFullscreenImage(fullscreenImage + 1);
            } else if (diff < 0 && fullscreenImage > 0) {
                setFullscreenImage(fullscreenImage - 1);
            }
        }
        touchStartRef.current = null;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white font-sans">
            {showFlashAnim && <div className={`fixed inset-0 z-[1000] ${flashOn ? 'bg-white opacity-100' : 'bg-white/30'} animate-pulse`}></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl">&times;</button>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setFlashOn(!flashOn)} 
                        className={`w-10 h-10 backdrop-blur-xl rounded-full flex items-center justify-center border transition-all ${flashOn ? 'bg-yellow-400 border-yellow-300 text-black shadow-[0_0_15px_#facc15]' : 'bg-black/40 border-white/10 text-white'}`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                    <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                        {([24, 35, 50, 85] as LensMM[]).map(mm => (
                            <button key={mm} onClick={() => setLensMM(mm)} className={`text-[10px] font-black transition-colors ${lensMM === mm ? 'text-sky-400' : 'text-white/40'}`}>{mm}mm</button>
                        ))}
                    </div>
                </div>

                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                <canvas ref={canvasRef} className="w-full h-full object-cover" />
                
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border border-white/20 rounded-3xl shadow-[0_0_0_1000px_rgba(0,0,0,0.5)] transition-all duration-300"
                        style={{ width: `${100/getZoomFactor(lensMM)}%`, aspectRatio: '3/4' }}
                    ></div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-6">
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2">
                        {Object.values(NEW_PRESETS).map(eff => (
                            <button 
                                key={eff.id} 
                                onClick={() => setActiveVibe(eff.id)}
                                className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl border transition-all ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest">{eff.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between px-8">
                        <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-xl bg-zinc-900 border-2 border-white/20 overflow-hidden active:scale-95 transition-all shadow-lg">
                            {capturedImages.length > 0 ? <img src={capturedImages[0]} className="w-full h-full object-cover" alt="Galeria" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500 font-black">0</div>}
                        </button>

                        <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                            <div className="w-full h-full rounded-full bg-white"></div>
                        </button>

                        <div className="w-14"></div>
                    </div>
                </div>
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/90 backdrop-blur-md">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Voltar</button>
                        <h3 className="font-black uppercase tracking-[0.2em] text-xs">Galeria Paradise</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                        {capturedImages.map((img, i) => (
                            <div key={i} onClick={() => setFullscreenImage(i)} className="aspect-[3/4] relative cursor-pointer group animate-fade-in">
                                <img src={img} className="w-full h-full object-cover" alt="Captured" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {fullscreenImage !== null && (
                <div 
                    className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in touch-pan-x"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[810] bg-gradient-to-b from-black/80 to-transparent">
                        <button onClick={() => setFullscreenImage(null)} className="p-3 bg-black/40 backdrop-blur-md rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg></button>
                        <div className="flex gap-4">
                            <button onClick={() => handleDelete(fullscreenImage!)} className="p-3 bg-black/40 border border-white/10 rounded-xl text-red-400 backdrop-blur-md active:scale-90 transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    </header>

                    <div className="flex-grow flex items-center justify-center relative bg-black">
                        <img src={capturedImages[fullscreenImage]} className="max-h-full max-w-full object-contain animate-fade-in" key={fullscreenImage} alt="Full" />
                        
                        <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-1.5 opacity-40">
                             {capturedImages.map((_, i) => (
                                 <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === fullscreenImage ? 'w-6 bg-white' : 'w-1 bg-white/40'}`} />
                             ))}
                        </div>
                    </div>

                    <footer className="absolute bottom-0 left-0 right-0 p-8 flex gap-4 bg-gradient-to-t from-black/80 to-transparent z-[810]">
                        <button onClick={() => handleSaveLocal(capturedImages[fullscreenImage!])} className="flex-1 py-4 bg-zinc-800/80 backdrop-blur-md rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all">Download</button>
                        <button 
                            onClick={() => handleSaveToPost(capturedImages[fullscreenImage!])}
                            disabled={isSaving}
                            className="flex-1 py-4 bg-white text-black rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isSaving ? "Postando..." : "Postar no Néos"}
                        </button>
                    </footer>
                </div>
            )}
        </div>
    );
};

export default ParadiseCameraModal;