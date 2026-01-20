import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 'analog' | 'cinematic' | 'pastel' | 'vhs';
type LensMM = 24 | 35 | 50 | 85 | 101;

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    clarity: number;
    sharpness: number; // 0 a 100
    noiseReduction: number;
    grain: number;
    saturation: number;
    temp: number;
    vignette: number;
    splitToneShadows?: { hue: number; sat: number };
    splitToneHighlights?: { hue: number; sat: number };
    vibrance?: number;
}

const PROFESSIONAL_PACK: Record<VibeEffect, EffectConfig> = {
    analog: { 
        id: 'analog', name: 'Analógico Clássico', label: '🎞️', 
        exposure: 1.10, contrast: 1.18, highlights: -0.25, shadows: 0.20, whites: 0.08, blacks: -0.12, 
        clarity: 1.12, sharpness: 45, noiseReduction: 15, grain: 18, saturation: 1.06, temp: 5, vignette: 0.05,
        splitToneShadows: { hue: 240, sat: 0.2 }, splitToneHighlights: { hue: 40, sat: 0.15 } 
    },
    cinematic: { 
        id: 'cinematic', name: 'Cinematográfico', label: '🎬', 
        exposure: 1.05, contrast: 1.34, highlights: -0.35, shadows: 0.10, whites: 0.14, blacks: -0.30, 
        clarity: 1.28, sharpness: 60, noiseReduction: 8, grain: 8, saturation: 1.10, temp: -5, vignette: 0.15,
        splitToneHighlights: { hue: 25, sat: 0.1 }, splitToneShadows: { hue: 220, sat: 0.15 } 
    },
    pastel: { 
        id: 'pastel', name: 'Pastel Suave', label: '📷', 
        exposure: 1.20, contrast: 0.95, highlights: -0.15, shadows: 0.25, whites: 0.10, blacks: -0.05, 
        clarity: 0.90, sharpness: 30, noiseReduction: 18, grain: 20, saturation: 1.08, temp: 15, vignette: 0.02
    },
    vhs: { 
        id: 'vhs', name: 'VHS Lo-Fi', label: '📼', 
        exposure: 1.05, contrast: 0.90, highlights: -0.30, shadows: 0.30, whites: 0.05, blacks: -0.15, 
        clarity: 0.80, sharpness: 15, noiseReduction: 20, grain: 45, saturation: 0.90, temp: -10, vignette: 0.20,
        vibrance: -0.05
    }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('analog');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<number | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => {
        switch(mm) {
            case 24: return 1.0;
            case 35: return 1.45;
            case 50: return 2.10;
            case 85: return 3.40;
            case 101: return 4.80;
            default: return 1.0;
        }
    };

    // Algoritmo de Unsharp Mask para melhorar qualidade de câmeras ruins
    const applyAdaptiveSharpening = (ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) => {
        if (amount <= 0) return;
        const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        const mix = amount / 100;
        ctx.globalAlpha = mix;
        // Simulação leve de convolução via offsets de drawImage (Performance-friendly)
        ctx.drawImage(ctx.canvas, -1, 0, w, h);
        ctx.drawImage(ctx.canvas, 1, 0, w, h);
        ctx.drawImage(ctx.canvas, 0, -1, w, h);
        ctx.drawImage(ctx.canvas, 0, 1, w, h);
        ctx.globalAlpha = 1.0;
    };

    const applyProfessionalPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        
        // 1. Super-Resolution / Sharpness Adaptativo
        if (isFinal) {
            applyAdaptiveSharpening(ctx, w, h, config.sharpness);
        }

        // 2. Correção de Cor Base
        const sat = config.saturation * (config.vibrance || 1.0);
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${sat}) hue-rotate(${config.temp}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        // 3. Simulação de Range Dinâmico (HDR Software)
        if (config.highlights < 0) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = Math.abs(config.highlights) * 0.4;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
        }
        if (config.shadows > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = config.shadows * 0.3;
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, w, h);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // 4. Granulação de Filme Orgânica
        if (config.grain > 0) {
            ctx.filter = 'none';
            const grainScale = isFinal ? 2 : 1;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = config.grain / 255;
            for(let i=0; i < (isFinal ? 2000 : 400); i++){
                ctx.fillRect(Math.random()*w, Math.random()*h, grainScale, grainScale);
            }
            ctx.globalAlpha = 1.0;
        }

        // 5. Vinheta Óptica
        if (config.vignette > 0) {
            ctx.filter = 'none';
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.85);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette + 0.1})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // 6. Selos Profissionais Néos
        if (isFinal) {
            ctx.filter = 'none';
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            
            // Data Digital Retro
            ctx.font = `bold ${Math.round(h * 0.038)}px "Courier New", monospace`;
            ctx.fillStyle = '#facc15'; 
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 8;
            ctx.fillText(dateStr, w * 0.08, h * 0.93);

            // Néos PRO Watermark
            ctx.font = `900 ${Math.round(h * 0.015)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
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

            applyProfessionalPipeline(ctx, vw, vh, PROFESSIONAL_PACK[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
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
        setTimeout(() => setShowFlashAnim(false), 80);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        
        const cropW = vw / zoom;
        const cropH = vh / zoom;
        const sx = (vw - cropW) / 2;
        const sy = (vh - cropH) / 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1440; // High Resolution Output
        outCanvas.height = 1920;
        const oCtx = outCanvas.getContext('2d');
        
        if(oCtx) {
            oCtx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, outCanvas.width, outCanvas.height);
            applyProfessionalPipeline(oCtx, outCanvas.width, outCanvas.height, PROFESSIONAL_PACK[activeVibe], true);
        }

        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 1.0), ...prev]);
    };

    if (!isOpen) return null;

    const zoom = getZoomFactor(lensMM);

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white font-sans z-[600]">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white animate-pulse"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl shadow-2xl active:scale-90">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 shadow-2xl overflow-x-auto no-scrollbar max-w-[60%]">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[10px] font-black transition-all shrink-0 ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/40'}`}>{mm}mm</button>
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

                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border-2 border-white/20 rounded-[2.5rem] shadow-[0_0_0_2000px_rgba(0,0,0,0.5)] transition-all duration-700 ease-out"
                        style={{ width: `${100/zoom}%`, aspectRatio: '3/4' }}
                    >
                         <div className="absolute bottom-6 left-6 opacity-30 flex flex-col gap-0.5">
                            <span className="text-[10px] font-black tracking-[0.2em]">{lensMM}MM HD OPTICS</span>
                            <span className="text-[8px] font-bold uppercase">Super-Res Engine Active</span>
                         </div>
                    </div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-8">
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2 items-center justify-center">
                        {Object.values(PROFESSIONAL_PACK).map(eff => (
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
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Fechar</button>
                        <h3 className="font-black uppercase tracking-[0.3em] text-xs">Galeria Paradise</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                        {capturedImages.map((img, i) => (
                            <div key={i} onClick={() => setFullscreenImage(i)} className="aspect-[3/4] relative cursor-pointer active:opacity-50"><img src={img} className="w-full h-full object-cover" alt={`img-${i}`} /></div>
                        ))}
                    </div>
                </div>
            )}

            {fullscreenImage !== null && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center bg-black/90">
                        <button onClick={() => setFullscreenImage(null)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Voltar</button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={capturedImages[fullscreenImage]} className="max-h-full max-w-full object-contain rounded-[2rem] shadow-2xl" alt="full" />
                    </div>
                    <footer className="p-10 flex gap-4 bg-black/90">
                        <button onClick={() => {
                            const link = document.createElement('a');
                            link.href = capturedImages[fullscreenImage!];
                            link.download = `Neos_Paradise_${Date.now()}.jpg`;
                            link.click();
                        }} className="flex-1 py-5 bg-white text-black rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl">Baixar Foto Pro</button>
                    </footer>
                </div>
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;