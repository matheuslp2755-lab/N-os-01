import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 'ultra_analog' | 'cinematic_pro' | 'soft_pastel' | 'vhs_lofi';
type LensMM = 24 | 35 | 50 | 85 | 101;

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
    splitToneShadows?: { hue: number; sat: number };
    splitToneHighlights?: { hue: number; sat: number };
}

const CAMERA_ENGINE_PACKS: Record<VibeEffect, EffectConfig> = {
    ultra_analog: { 
        id: 'ultra_analog', name: 'Ultra Analógico', label: '🎞️', 
        exposure: 1.05, contrast: 1.25, highlights: -0.10, shadows: 0.05, 
        sharpness: 45, grain: 8, saturation: 1.10, temp: 5, vignette: 0.02
    },
    cinematic_pro: { 
        id: 'cinematic_pro', name: 'Cinema Realista', label: '🎬', 
        exposure: 1.00, contrast: 1.30, highlights: -0.15, shadows: 0.20, 
        sharpness: 35, grain: 12, saturation: 1.15, temp: -5, vignette: 0.08,
        splitToneHighlights: { hue: 45, sat: 0.15 }, splitToneShadows: { hue: 210, sat: 0.10 } 
    },
    soft_pastel: { 
        id: 'soft_pastel', name: 'Pastel Suave', label: '📷', 
        exposure: 1.20, contrast: 0.95, highlights: -0.05, shadows: 0.15, 
        sharpness: 20, grain: 15, saturation: 1.05, temp: 10, vignette: 0.01
    },
    vhs_lofi: { 
        id: 'vhs_lofi', name: 'VHS Nostalgia', label: '📼', 
        exposure: 1.10, contrast: 0.90, highlights: -0.20, shadows: 0.25, 
        sharpness: 10, grain: 40, saturation: 0.85, temp: -10, vignette: 0.15
    }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('ultra_analog');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => {
        switch(mm) {
            case 24: return 1.0;
            case 35: return 1.4;
            case 50: return 2.0;
            case 85: return 3.2;
            case 101: return 4.5;
            default: return 1.0;
        }
    };

    const applyAIPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        
        if (isFinal && config.sharpness > 0) {
            const mix = config.sharpness / 100;
            ctx.globalAlpha = mix;
            ctx.drawImage(ctx.canvas, -1, -1, w, h);
            ctx.drawImage(ctx.canvas, 1, 1, w, h);
            ctx.globalAlpha = 1.0;
        }

        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${config.temp}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        if (config.splitToneHighlights) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = config.splitToneHighlights.sat;
            ctx.fillStyle = `hsl(${config.splitToneHighlights.hue}, 100%, 50%)`;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        if (config.grain > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = config.grain / 255;
            for(let i=0; i < (isFinal ? 8000 : 800); i++){
                ctx.fillRect(Math.random()*w, Math.random()*h, 1.2, 1.2);
            }
            ctx.globalAlpha = 1.0;
        }

        if (config.vignette > 0) {
            ctx.filter = 'none';
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.85);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette + 0.2})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        if (isFinal) {
            ctx.filter = 'none';
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            ctx.font = `bold ${Math.round(h * 0.035)}px "Courier New", monospace`;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 10;
            ctx.fillText(dateStr, w * 0.08, h * 0.93);

            ctx.font = `900 ${Math.round(h * 0.015)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'right';
            ctx.letterSpacing = "6px";
            ctx.fillText("NÉOS PARADISE PRO", w * 0.92, h * 0.93);
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
            const vw = canvas.width;
            const vh = canvas.height;

            ctx.save();
            if (facingMode === 'user') { ctx.translate(vw, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();

            applyAIPipeline(ctx, vw, vh, CAMERA_ENGINE_PACKS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
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
        };
    }, [isOpen, startCamera]);

    const executeCapture = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 100);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        
        // CÁLCULO DO RECORTE PRECISO (Área dentro do quadrado)
        const targetW = vw / zoom;
        const targetH = targetW * (4/3); // Proporção fixa do quadrado de visão
        const sx = (vw - targetW) / 2;
        const sy = (vh - targetH) / 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1200; 
        outCanvas.height = 1600;
        const oCtx = outCanvas.getContext('2d');
        
        if(oCtx) {
            oCtx.drawImage(canvas, sx, sy, targetW, targetH, 0, 0, outCanvas.width, outCanvas.height);
            applyAIPipeline(oCtx, outCanvas.width, outCanvas.height, CAMERA_ENGINE_PACKS[activeVibe], true);
        }

        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 1.0), ...prev]);
    };

    const saveToDevice = (dataUrl: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Neos_Paradise_${Date.now()}.jpg`;
        link.click();
    };

    const discardImage = (dataUrl: string) => {
        if (window.confirm("Deseja descartar esta foto permanentemente?")) {
            setCapturedImages(prev => prev.filter(img => img !== dataUrl));
            setSelectedImage(null);
        }
    };

    if (!isOpen) return null;

    const zoom = getZoomFactor(lensMM);

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white font-sans z-[600]">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl shadow-2xl active:scale-90">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-5 py-2 rounded-full border border-white/10 shadow-2xl">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[11px] font-black transition-all shrink-0 ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/40'}`}>{mm}mm</button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 shadow-2xl">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                
                <div className="w-full h-full flex items-center justify-center transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1)" style={{ transform: `scale(${zoom})` }}>
                    <canvas ref={canvasRef} className="w-full h-full object-cover" />
                </div>

                {/* GUIA DE RECORTE: O que estiver dentro desta moldura é o que será salvo */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border-2 border-white/40 rounded-[3rem] shadow-[0_0_0_2000px_rgba(0,0,0,0.7)] transition-all duration-700 ease-out"
                        style={{ width: `${100/zoom}%`, aspectRatio: '3/4' }}
                    >
                         <div className="absolute bottom-6 left-6 opacity-60 flex flex-col gap-0.5 drop-shadow-lg">
                            <span className="text-[10px] font-black tracking-[0.3em]">{lensMM}MM OPTICS</span>
                            <span className="text-[8px] font-bold uppercase tracking-widest">Recorte Ativo</span>
                         </div>
                    </div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-8">
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2 items-center justify-center">
                        {Object.values(CAMERA_ENGINE_PACKS).map(eff => (
                            <button key={eff.id} onClick={() => setActiveVibe(eff.id)} className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl border ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-[0_0_25px_rgba(255,255,255,0.3)]' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-center whitespace-nowrap">{eff.name.split(' ')[0]}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-10">
                        <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-lg active:scale-95 transition-all">
                            {capturedImages.length > 0 && <img src={capturedImages[0]} className="w-full h-full object-cover" alt="prev" />}
                        </button>
                        <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.15)]">
                            <div className="w-full h-full rounded-full bg-white shadow-inner"></div>
                        </button>
                        <div className="w-14"></div>
                    </div>
                </div>
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/90 backdrop-blur-md">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Fechar Galeria</button>
                        <h3 className="font-black uppercase tracking-[0.3em] text-xs">Capturas Recentes</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                        {capturedImages.map((img, i) => (
                            <div key={i} className="aspect-[3/4] relative cursor-pointer" onClick={() => setSelectedImage(img)}>
                                <img src={img} className="w-full h-full object-cover" alt={`img-${i}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedImage && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col items-center justify-center animate-fade-in p-6">
                    <button onClick={() => setSelectedImage(null)} className="absolute top-10 left-10 text-white/50 hover:text-white text-xl z-50 bg-black/20 p-2 rounded-full backdrop-blur-md">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2.5} /></svg>
                    </button>
                    
                    <div className="w-full max-w-lg aspect-[3/4] relative rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
                        <img src={selectedImage} className="w-full h-full object-contain" alt="Fullscreen View" />
                    </div>

                    <div className="flex gap-4 mt-12 w-full max-w-xs">
                        <button 
                            onClick={() => discardImage(selectedImage)} 
                            className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
                        >
                            Descartar
                        </button>
                        <button 
                            onClick={() => saveToDevice(selectedImage)} 
                            className="flex-1 py-4 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all"
                        >
                            Salvar Foto
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scale-up { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-scale-up { animation: scale-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;