import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, doc, updateDoc, serverTimestamp } from '../../firebase';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 
    | 'raw' | 'y2kflash' | 'indie2016' | 'ultra4k' 
    | 'noitgray' | 'flareflex' | 'analoggold' | 'cyberpunk';

type LensMM = 24 | 35 | 50 | 85 | 101;

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    grain: number;
    blur: number;
    temp: number;
    glow: number;
    saturation: number;
    contrast: number;
    exposure: number;
    sharpness: number;
    vignette: number;
    fade: number;
    flare?: boolean;
}

const PRESETS: Record<VibeEffect, EffectConfig> = {
    raw: { id: 'raw', name: 'Neos RAW', label: 'RAW', grain: 0, blur: 0, temp: 0, glow: 0.1, saturation: 1.0, contrast: 1.0, exposure: 1.0, sharpness: 1.2, vignette: 0.1, fade: 0 },
    y2kflash: { id: 'y2kflash', name: 'Y2K Flash', label: '2000', grain: 0.4, blur: 0.1, temp: 15, glow: 0.6, saturation: 1.3, contrast: 1.5, exposure: 1.4, sharpness: 0.8, vignette: 0.4, fade: 0 },
    indie2016: { id: 'indie2016', name: 'Indie 2016', label: '2016', grain: 0.2, blur: 0.6, temp: -5, glow: 0.2, saturation: 0.7, contrast: 0.8, exposure: 1.1, sharpness: 0.6, vignette: 0.2, fade: 25 },
    ultra4k: { id: 'ultra4k', name: 'Hyper 4K', label: '4K', grain: 0, blur: 0, temp: 0, glow: 0, saturation: 1.05, contrast: 1.1, exposure: 1.05, sharpness: 2.2, vignette: 0.1, fade: 0 },
    noitgray: { id: 'noitgray', name: 'Noir Gray', label: 'B&W', grain: 0.5, blur: 0.2, temp: 0, glow: 0.3, saturation: 0, contrast: 1.4, exposure: 1.0, sharpness: 1.2, vignette: 0.7, fade: 5 },
    flareflex: { id: 'flareflex', name: 'Flare Reflex', label: 'LENS', grain: 0.1, blur: 0.2, temp: 10, glow: 0.8, saturation: 1.1, contrast: 1.0, exposure: 1.1, sharpness: 1.0, vignette: 0.3, fade: 0, flare: true },
    analoggold: { id: 'analoggold', name: 'Analog Gold', label: 'GOLD', grain: 0.7, blur: 0.4, temp: 25, glow: 0.4, saturation: 1.2, contrast: 1.1, exposure: 1.0, sharpness: 0.9, vignette: 0.5, fade: 10 },
    cyberpunk: { id: 'cyberpunk', name: 'Cyber Neon', label: 'NEON', grain: 0.3, blur: 0, temp: -30, glow: 0.9, saturation: 1.8, contrast: 1.3, exposure: 1.2, sharpness: 1.4, vignette: 0.5, fade: 0 }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('raw');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => {
        const factors = { 24: 1.0, 35: 1.3, 50: 1.8, 85: 2.6, 101: 3.2 };
        return factors[mm];
    };

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        // 1. SHARPNESS & BASE HDR
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.15;
        ctx.drawImage(ctx.canvas, 0, 0);
        
        ctx.globalCompositeOperation = 'hard-light';
        ctx.globalAlpha = (config.sharpness * 0.1);
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // 2. FILTERS (TEMP, SAT, CONTRAST)
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${config.temp}deg) blur(${config.blur}px)`;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
            tCtx.drawImage(ctx.canvas, 0, 0);
            ctx.filter = 'none';
            ctx.drawImage(tempCanvas, 0, 0);
        }

        // 3. GLOW / BLOOM
        if (config.glow > 0) {
            ctx.save();
            ctx.globalAlpha = config.glow * 0.4;
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = `blur(${Math.round(w * 0.02)}px) brightness(1.4)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 4. LENS FLARE (Reflexo)
        if (config.flare) {
            ctx.save();
            const flareGrad = ctx.createRadialGradient(w * 0.2, h * 0.2, 0, w * 0.2, h * 0.2, w * 0.4);
            flareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            flareGrad.addColorStop(0.2, 'rgba(0, 200, 255, 0.1)');
            flareGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = flareGrad;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillRect(0, 0, w, h);
            
            // Pequenos círculos de reflexo
            ctx.beginPath();
            ctx.arc(w * 0.5, h * 0.5, w * 0.05, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 100, 100, 0.1)';
            ctx.fill();
            ctx.restore();
        }

        // 5. VINTAGE ELEMENTS (GRAIN & FADE)
        if (config.fade > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighten';
            ctx.fillStyle = `rgba(180, 190, 220, ${config.fade / 255})`;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        if (config.grain > 0) {
            ctx.save();
            ctx.globalAlpha = config.grain * 0.25;
            ctx.globalCompositeOperation = 'overlay';
            for (let i = 0; i < 400; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
                ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
            }
            ctx.restore();
        }

        // 6. WATERMARK (Only Final)
        if (isFinal) {
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;
            const fSize = Math.round(h * 0.035);
            ctx.save();
            ctx.font = `bold ${fSize}px "Courier New", monospace`;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = fSize * 0.2;
            ctx.fillText(dateStr, w * 0.06, h - (h * 0.07));
            ctx.font = `italic ${fSize * 0.8}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.textAlign = 'right';
            ctx.fillText('Néos Pro', w - (w * 0.06), h - (h * 0.07));
            ctx.restore();
        }

        // 7. VIGNETTE
        if (config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w*0.9);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette * 0.7})`);
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
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            const vw = canvas.width;
            const vh = canvas.height;

            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(vw, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();

            applyQualityPipeline(ctx, vw, vh, PRESETS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        setCameraError(null);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (requestRef.current) cancelAnimationFrame(requestRef.current);

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
        } catch (err: any) {
            setCameraError("Acesso à câmera negado.");
        }
    }, [facingMode, renderLoop]);

    useEffect(() => {
        if (isOpen && !viewingGallery) startCamera();
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isOpen, viewingGallery, startCamera]);

    const executeCapture = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 100);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        const cropW = vw / zoom;
        const cropH = (vw * (4/3)) / zoom;
        const cx = (vw - cropW) / 2;
        const cy = (vh - cropH) / 2;

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = cropW;
        outputCanvas.height = cropH;
        const outCtx = outputCanvas.getContext('2d');
        
        if (outCtx) {
            outCtx.drawImage(canvas, cx, cy, cropW, cropH, 0, 0, cropW, cropH);
            applyQualityPipeline(outCtx, cropW, cropH, PRESETS[activeVibe], true);
        }

        const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.98);
        setCapturedImages(prev => [dataUrl, ...prev]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-black flex flex-col overflow-hidden touch-none h-[100dvh] font-sans text-white">
            {showFlashAnim && <div className="fixed inset-0 bg-white z-[1000] animate-flash-out"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onClose} className="w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-xl rounded-full border border-white/10 active:scale-90 transition-all text-2xl font-thin">&times;</button>
                
                <div className="flex items-center gap-5 bg-white/10 backdrop-blur-2xl px-6 py-2.5 rounded-full border border-white/10 shadow-xl">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button 
                            key={mm}
                            onClick={() => setLensMM(mm)}
                            className={`text-[11px] font-black tracking-tighter transition-all ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/30'}`}
                        >
                            {mm}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                    className="w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-xl rounded-full border border-white/10 active:scale-90 transition-all"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                {viewingGallery ? (
                    <div className="absolute inset-0 z-[200] bg-black flex flex-col animate-fade-in">
                        <header className="p-6 flex justify-between items-center bg-zinc-900/80 backdrop-blur-2xl border-b border-white/5">
                            <button onClick={() => setViewingGallery(false)} className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">Voltar</button>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em]">{capturedImages.length} Recs</h3>
                            <button onClick={() => setCapturedImages([])} className="text-red-500 text-[11px] font-black uppercase">Limpar</button>
                        </header>
                        <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                            {capturedImages.map((img, i) => (
                                <div key={i} onClick={() => setFullScreenImage(img)} className="aspect-[3/4] relative bg-zinc-900 overflow-hidden cursor-pointer active:scale-95 transition-transform">
                                    <img src={img} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <video ref={videoRef} className="hidden" playsInline muted />
                        {cameraError ? (
                            <div className="p-10 text-center space-y-6">
                                <p className="text-white/50 font-black text-xs uppercase tracking-widest leading-relaxed">{cameraError}</p>
                                <button onClick={() => startCamera()} className="bg-sky-500 text-white px-10 py-4 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl">Tentar Novamente</button>
                            </div>
                        ) : (
                            <canvas ref={canvasRef} className="w-full h-full object-cover" />
                        )}
                        
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div 
                                className="border-[0.5px] border-white/20 transition-all duration-700 ease-out relative rounded-[2.5rem]"
                                style={{ 
                                    width: `${100 / getZoomFactor(lensMM)}%`,
                                    aspectRatio: '3/4',
                                    boxShadow: '0 0 0 4000px rgba(0,0,0,0.5)'
                                }}
                            >
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.4em] text-white/40">{lensMM}mm PRO</div>
                                <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-white/60"></div>
                                <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/60"></div>
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-white/60"></div>
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-white/60"></div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {fullScreenImage && (
                <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col animate-fade-in" onClick={() => setFullScreenImage(null)}>
                    <header className="p-6 flex justify-between items-center z-10" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setFullScreenImage(null)} className="p-4 bg-black/50 backdrop-blur-xl rounded-full text-white text-2xl font-thin">&times;</button>
                        <button 
                            onClick={() => {
                                const a = document.createElement('a');
                                a.href = fullScreenImage;
                                a.download = `neos-rec-${Date.now()}.jpg`;
                                a.click();
                            }}
                            className="bg-white text-black px-10 py-4 rounded-full font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 transition-all"
                        >
                            Salvar Rec
                        </button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={fullScreenImage} className="max-w-full max-h-full rounded-[3.5rem] shadow-2xl object-contain border border-white/5" />
                    </div>
                </div>
            )}

            <footer className="bg-black/90 backdrop-blur-3xl px-4 pb-14 pt-8 border-t border-white/5 z-50">
                {!viewingGallery ? (
                    <div className="flex flex-col gap-10">
                        <div className="flex gap-5 overflow-x-auto no-scrollbar py-2 snap-x snap-mandatory px-6">
                            {(Object.values(PRESETS)).map((eff) => (
                                <button
                                    key={eff.id}
                                    onClick={() => setActiveVibe(eff.id)}
                                    className={`flex flex-col items-center shrink-0 snap-center transition-all duration-500 ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'scale-90 opacity-20'}`}
                                >
                                    <div className={`w-16 h-16 rounded-3xl flex flex-col items-center justify-center border-2 transition-all ${activeVibe === eff.id ? 'bg-zinc-900 border-sky-400 shadow-[0_0_40px_rgba(14,165,233,0.3)]' : 'bg-zinc-900/50 border-white/10'}`}>
                                        <span className="text-[7px] font-black uppercase text-white/40 tracking-tighter">{eff.label}</span>
                                        <span className={`text-[10px] font-black uppercase mt-1 tracking-widest ${activeVibe === eff.id ? 'text-white' : 'text-zinc-600'}`}>0{(Object.values(PRESETS)).indexOf(eff)+1}</span>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase mt-3 tracking-[0.2em] ${activeVibe === eff.id ? 'text-sky-400' : 'text-zinc-500'}`}>{eff.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between px-12">
                            <button 
                                onClick={() => setViewingGallery(true)}
                                className="w-14 h-14 rounded-[1.5rem] bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center active:scale-90 transition-all shadow-inner group"
                            >
                                {capturedImages.length > 0 ? (
                                    <img src={capturedImages[0]} className="w-full h-full object-cover opacity-60" />
                                ) : (
                                    <div className="w-7 h-7 border-2 border-white/10 rounded-xl group-hover:border-sky-500/40 transition-colors"></div>
                                )}
                            </button>

                            <button 
                                onClick={executeCapture} 
                                className="w-24 h-24 rounded-full border-4 border-white/15 flex items-center justify-center p-1.5 active:scale-95 transition-all shadow-[0_0_60px_rgba(255,255,255,0.05)]"
                            >
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center relative overflow-hidden">
                                    <div className="w-full h-full rounded-full bg-gradient-to-tr from-zinc-200 via-white to-zinc-100 shadow-inner"></div>
                                </div>
                            </button>

                            <div className="w-14 h-14 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-4 animate-slide-up">
                        <button 
                            onClick={() => { setCapturedImages([]); setViewingGallery(false); }}
                            className="flex-1 py-5 bg-zinc-900 text-zinc-500 text-[11px] font-black uppercase tracking-[0.3em] rounded-[2.5rem] border border-white/5 active:scale-95"
                        >
                            Resetar
                        </button>
                        <button 
                            onClick={() => {
                                capturedImages.forEach((img, i) => {
                                    const a = document.createElement('a');
                                    a.href = img;
                                    a.download = `neos-rec-${i}.jpg`;
                                    a.click();
                                });
                                onClose();
                            }}
                            className="flex-1 py-5 bg-white text-black text-[11px] font-black uppercase tracking-[0.3em] rounded-[2.5rem] shadow-2xl active:scale-95 transition-all"
                        >
                            Salvar {capturedImages.length} Recs
                        </button>
                    </div>
                )}
            </footer>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes flash-out { 0% { opacity: 1; } 100% { opacity: 0; } }
                .animate-flash-out { animation: flash-out 0.6s ease-out forwards; }
                @keyframes slide-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
                .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;