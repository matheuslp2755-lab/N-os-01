import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, doc, updateDoc, serverTimestamp } from '../../firebase';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 
    | 'y2k2000s' | 'asterisk' | 'tumblrclassic' | 'tumblrdark' 
    | 'vibe' | 'cleanpro' | 'fixlowres' | 'flash2000' 
    | 'softbeauty' | 'analogfilm';

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
    skinSoft: number;
    tint: string;
    vignette: number;
}

const PRESETS: Record<VibeEffect, EffectConfig> = {
    y2k2000s: { id: 'y2k2000s', name: 'Y2K 2000s', label: 'SONY', grain: 0.4, blur: 0.5, temp: -5, glow: 0.5, saturation: 1.3, contrast: 1.2, exposure: 1.2, sharpness: 0.8, skinSoft: 0.3, tint: 'rgba(200,255,255,0.08)', vignette: 0.3 },
    asterisk: { id: 'asterisk', name: 'Asterisk', label: 'META', grain: 0.2, blur: 0, temp: -15, glow: 0.7, saturation: 0.8, contrast: 1.4, exposure: 1.1, sharpness: 1.1, skinSoft: 0, tint: 'rgba(100,50,255,0.1)', vignette: 0.5 },
    tumblrclassic: { id: 'tumblrclassic', name: 'Tumblr Classic', label: '90s', grain: 0.3, blur: 1.2, temp: 10, glow: 0.3, saturation: 0.7, contrast: 0.9, exposure: 1.1, sharpness: 0.6, skinSoft: 0.4, tint: 'rgba(255,200,150,0.15)', vignette: 0.2 },
    tumblrdark: { id: 'tumblrdark', name: 'Tumblr Dark', label: 'MOOD', grain: 0.5, blur: 0.8, temp: -10, glow: 0.2, saturation: 0.6, contrast: 1.3, exposure: 0.8, sharpness: 0.9, skinSoft: 0, tint: 'rgba(0,0,50,0.1)', vignette: 0.7 },
    vibe: { id: 'vibe', name: 'VIBE', label: 'LIVE', grain: 0.1, blur: 0, temp: 5, glow: 0.3, saturation: 1.2, contrast: 1.1, exposure: 1.05, sharpness: 1.2, skinSoft: 0.5, tint: 'rgba(255,255,255,0)', vignette: 0.3 },
    cleanpro: { id: 'cleanpro', name: 'Clean Pro', label: 'RAW', grain: 0, blur: 0, temp: 0, glow: 0, saturation: 1.05, contrast: 1.05, exposure: 1.0, sharpness: 1.4, skinSoft: 0, tint: 'rgba(255,255,255,0)', vignette: 0.1 },
    fixlowres: { id: 'fixlowres', name: 'Pro-Fix', label: 'HDR', grain: 0, blur: 0, temp: 0, glow: 0.1, saturation: 1.1, contrast: 1.2, exposure: 1.1, sharpness: 1.8, skinSoft: 0.2, tint: 'rgba(255,255,255,0.02)', vignette: 0.2 },
    flash2000: { id: 'flash2000', name: 'Flash 2000', label: 'PARTY', grain: 0.4, blur: 0.2, temp: 0, glow: 0.6, saturation: 1.4, contrast: 1.6, exposure: 1.4, sharpness: 1.3, skinSoft: 0, tint: 'rgba(255,255,255,0.1)', vignette: 0.6 },
    softbeauty: { id: 'softbeauty', name: 'Soft Beauty', label: 'GIRL', grain: 0.1, blur: 1.5, temp: 5, glow: 0.6, saturation: 1.1, contrast: 0.9, exposure: 1.15, sharpness: 0.7, skinSoft: 0.9, tint: 'rgba(255,180,200,0.1)', vignette: 0.1 },
    analogfilm: { id: 'analogfilm', name: 'Analog Film', label: 'KODAK', grain: 0.8, blur: 0.4, temp: 15, glow: 0.3, saturation: 0.9, contrast: 1.1, exposure: 1.0, sharpness: 0.9, skinSoft: 0.2, tint: 'rgba(255,150,0,0.08)', vignette: 0.4 }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('cleanpro');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => {
        const factors = { 24: 1.0, 35: 1.4, 50: 2.0, 85: 2.8, 101: 3.5 };
        return factors[mm];
    };

    const applyAestheticPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        // 1. Sharpening & Clarity (Base)
        if (config.sharpness > 1.0) {
            // Simulação de nitidez via overlay contrastado leve
            ctx.save();
            ctx.globalAlpha = (config.sharpness - 1.0) * 0.3;
            ctx.globalCompositeOperation = 'overlay';
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 2. Base Grading & Blur
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${config.temp}deg) blur(${config.blur}px)`;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(ctx.canvas, 0, 0);
            ctx.filter = 'none';
            ctx.drawImage(tempCanvas, 0, 0);
        }

        // 3. Skin Softening (Simulado via blur seletivo por opacidade)
        if (config.skinSoft > 0) {
            ctx.save();
            ctx.globalAlpha = config.skinSoft * 0.4;
            ctx.filter = 'blur(4px)';
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 4. Glow / Bloom
        if (config.glow > 0) {
            ctx.save();
            ctx.globalAlpha = config.glow * 0.5;
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = `blur(${Math.max(1, 20 * config.glow)}px) brightness(1.3)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 5. Grain (Realistic Noise)
        if (config.grain > 0) {
            ctx.save();
            ctx.globalAlpha = config.grain * 0.3;
            ctx.globalCompositeOperation = 'overlay';
            for (let i = 0; i < 400; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
                ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
            }
            ctx.restore();
        }

        // 6. Color Tint
        if (config.tint !== 'rgba(255,255,255,0)') {
            ctx.save();
            ctx.fillStyle = config.tint;
            ctx.globalAlpha = 1.0;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // 7. Identity (Only on Save)
        if (isFinal) {
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;
            const fontSizeDate = Math.round(h * 0.035);
            const paddingX = Math.round(w * 0.06);
            const paddingY = Math.round(h * 0.06);

            ctx.save();
            // Vintage Yellow Date
            ctx.font = `bold ${fontSizeDate}px "Courier New", monospace`;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = h * 0.005;
            ctx.fillText(dateStr, paddingX, h - paddingY);
            
            // Neos Branding
            ctx.font = `italic ${fontSizeDate * 0.8}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'right';
            ctx.fillText('Neos', w - paddingX, h - paddingY);
            ctx.restore();
        }

        // 8. Vignette
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

            applyAestheticPipeline(ctx, vw, vh, PRESETS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        setCameraError(null);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
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
            applyAestheticPipeline(outCtx, cropW, cropH, PRESETS[activeVibe], true);
        }

        const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.95);
        setCapturedImages(prev => [dataUrl, ...prev]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-black flex flex-col overflow-hidden touch-none h-[100dvh] font-sans text-white">
            {showFlashAnim && <div className="fixed inset-0 bg-white z-[1000] animate-flash-out"></div>}

            {/* BARRA SUPERIOR */}
            <header className="absolute top-0 left-0 right-0 p-5 flex justify-between items-center z-50 bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-black/30 backdrop-blur-xl rounded-full border border-white/10 active:scale-90 transition-all text-xl">&times;</button>
                
                <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl px-5 py-2 rounded-full border border-white/10">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button 
                            key={mm}
                            onClick={() => setLensMM(mm)}
                            className={`text-[10px] font-black tracking-widest transition-all ${lensMM === mm ? 'text-sky-400 scale-110' : 'text-white/40'}`}
                        >
                            {mm}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                        className="w-10 h-10 flex items-center justify-center bg-black/30 backdrop-blur-xl rounded-full border border-white/10 active:scale-90 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </header>

            {/* VIEWPORT */}
            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                {viewingGallery ? (
                    <div className="absolute inset-0 z-[200] bg-black flex flex-col animate-fade-in">
                        <header className="p-5 flex justify-between items-center bg-zinc-900/80 backdrop-blur-xl border-b border-white/5">
                            <button onClick={() => setViewingGallery(false)} className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Voltar</button>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em]">{capturedImages.length} Recs</h3>
                            <button onClick={() => setCapturedImages([])} className="text-red-500 text-[10px] font-black uppercase">Limpar</button>
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
                            <div className="p-10 text-center space-y-4">
                                <p className="text-white/60 font-black text-xs uppercase tracking-widest">{cameraError}</p>
                                <button onClick={() => startCamera()} className="bg-sky-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest">Tentar Novamente</button>
                            </div>
                        ) : (
                            <canvas ref={canvasRef} className="w-full h-full object-cover" />
                        )}
                        
                        {/* MOLDURA DA LENTE */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div 
                                className="border-[0.5px] border-white/30 transition-all duration-700 ease-out relative rounded-2xl"
                                style={{ 
                                    width: `${100 / getZoomFactor(lensMM)}%`,
                                    aspectRatio: '3/4',
                                    boxShadow: '0 0 0 4000px rgba(0,0,0,0.4)'
                                }}
                            >
                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.3em] text-white/50">{lensMM}mm</div>
                                <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/60"></div>
                                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/60"></div>
                                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white/60"></div>
                                <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/60"></div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* VIEWER FULLSCREEN */}
            {fullScreenImage && (
                <div className="fixed inset-0 z-[300] bg-black flex flex-col animate-fade-in" onClick={() => setFullScreenImage(null)}>
                    <header className="p-6 flex justify-between items-center z-10" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setFullScreenImage(null)} className="p-3 bg-black/40 backdrop-blur-xl rounded-full text-white text-2xl font-thin">&times;</button>
                        <button 
                            onClick={() => {
                                const a = document.createElement('a');
                                a.href = fullScreenImage;
                                a.download = `neos-paradise-${Date.now()}.jpg`;
                                a.click();
                            }}
                            className="bg-white text-black px-8 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all"
                        >
                            Salvar Rec
                        </button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={fullScreenImage} className="max-w-full max-h-full rounded-[2.5rem] shadow-2xl object-contain" />
                    </div>
                </div>
            )}

            {/* CONTROLES INFERIORES */}
            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                {!viewingGallery ? (
                    <div className="flex flex-col gap-8">
                        {/* SWIPER DE EFEITOS */}
                        <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 snap-x snap-mandatory px-4">
                            {(Object.values(PRESETS)).map((eff) => (
                                <button
                                    key={eff.id}
                                    onClick={() => setActiveVibe(eff.id)}
                                    className={`flex flex-col items-center shrink-0 snap-center transition-all duration-500 ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'scale-90 opacity-20'}`}
                                >
                                    <div className={`w-16 h-16 rounded-[1.5rem] flex flex-col items-center justify-center border-2 transition-all ${activeVibe === eff.id ? 'bg-zinc-900 border-sky-400 shadow-[0_0_30px_rgba(14,165,233,0.3)]' : 'bg-zinc-900/50 border-white/10'}`}>
                                        <span className="text-[7px] font-black uppercase text-white/40 tracking-tighter">{eff.label}</span>
                                        <span className={`text-[9px] font-black uppercase mt-1 tracking-widest ${activeVibe === eff.id ? 'text-white' : 'text-zinc-600'}`}>00{(Object.values(PRESETS)).indexOf(eff)+1}</span>
                                    </div>
                                    <span className={`text-[8px] font-black uppercase mt-3 tracking-widest ${activeVibe === eff.id ? 'text-sky-400' : 'text-zinc-500'}`}>{eff.name}</span>
                                </button>
                            ))}
                        </div>

                        {/* DISPARADOR */}
                        <div className="flex items-center justify-between px-10">
                            <button 
                                onClick={() => setViewingGallery(true)}
                                className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center active:scale-90 transition-all shadow-inner relative group"
                            >
                                {capturedImages.length > 0 ? (
                                    <>
                                        <img src={capturedImages[0]} className="w-full h-full object-cover opacity-60" />
                                        <div className="absolute inset-0 bg-sky-500/10 group-hover:opacity-0 transition-opacity"></div>
                                    </>
                                ) : (
                                    <div className="w-7 h-7 border-2 border-white/10 rounded-lg group-hover:border-sky-500/40 transition-colors"></div>
                                )}
                            </button>

                            <button 
                                onClick={executeCapture} 
                                className="w-24 h-24 rounded-full border-4 border-white/20 flex items-center justify-center p-1.5 active:scale-95 transition-all shadow-[0_0_50px_rgba(255,255,255,0.05)]"
                            >
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center relative overflow-hidden">
                                    <div className="w-full h-full rounded-full bg-gradient-to-tr from-zinc-200 to-white"></div>
                                </div>
                            </button>

                            <div className="w-14 h-14 flex items-center justify-center">
                                <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-3 animate-slide-up">
                        <button 
                            onClick={() => { setCapturedImages([]); setViewingGallery(false); }}
                            className="flex-1 py-5 bg-zinc-900 text-zinc-500 text-[10px] font-black uppercase tracking-widest rounded-[2rem] border border-white/5 active:scale-95"
                        >
                            Resetar
                        </button>
                        <button 
                            onClick={() => {
                                capturedImages.forEach((img, i) => {
                                    const a = document.createElement('a');
                                    a.href = img;
                                    a.download = `neos-rec-${Date.now()}-${i}.jpg`;
                                    a.click();
                                });
                                onClose();
                            }}
                            className="flex-1 py-5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-[2rem] shadow-2xl active:scale-95 transition-all"
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
                @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;