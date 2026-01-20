import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = string;
type LensMM = 24 | 35 | 50 | 85 | 101;

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    exposure: number;
    contrast: number;
    saturation: number;
    temp: number;
    sharpness: number;
    grain: number;
    vignette: number;
    magenta?: number;
    glow?: number;
    skinSoft?: number;
    vibrance?: number;
}

const PARADISE_PACK: Record<string, EffectConfig> = {
    d_classic: { id: 'd_classic', name: 'D Classic', label: '📷', exposure: 1.05, contrast: 1.1, saturation: 1.0, vibrance: 1.0, temp: 0, magenta: 0, sharpness: 1.5, grain: 2, skinSoft: 0.2, glow: 0.1, vignette: 0.05 },
    sr_135: { id: 'sr_135', name: '135 SR', label: '🎞️', exposure: 1.0, contrast: 1.05, saturation: 0.9, vibrance: 0.95, temp: 15, magenta: 2, sharpness: 1.2, grain: 8, skinSoft: 0.3, glow: 0.2, vignette: 0.1 },
    hoga: { id: 'hoga', name: 'Hoga', label: '☁️', exposure: 1.1, contrast: 0.85, saturation: 0.85, vibrance: 0.9, temp: 5, magenta: 5, sharpness: 0.8, grain: 12, skinSoft: 0.8, glow: 0.6, vignette: 0.3 },
    nt16: { id: 'nt16', name: 'NT16', label: '👤', exposure: 1.0, contrast: 1.0, saturation: 1.05, vibrance: 1.1, temp: 0, magenta: 0, sharpness: 1.8, grain: 0, skinSoft: 0.5, glow: 0.1, vignette: 0.05 },
    d_exp: { id: 'd_exp', name: 'D Exp', label: '🌈', exposure: 0.95, contrast: 1.4, saturation: 1.5, vibrance: 1.6, temp: 0, magenta: 0, sharpness: 2.0, grain: 5, skinSoft: 0.1, glow: 0.4, vignette: 0.2 },
    fxn_r: { id: 'fxn_r', name: 'FXN R', label: '🏙️', exposure: 1.0, contrast: 1.3, saturation: 1.2, vibrance: 1.1, temp: -5, magenta: -2, sharpness: 2.2, grain: 15, skinSoft: 0, glow: 0.2, vignette: 0.15 },
    cpm35: { id: 'cpm35', name: 'CPM35', label: '🌸', exposure: 1.15, contrast: 0.9, saturation: 0.8, vibrance: 1.0, temp: 8, magenta: 6, sharpness: 1.0, grain: 3, skinSoft: 0.7, glow: 0.5, vignette: 0.08 },
    d_fun_s: { id: 'd_fun_s', name: 'D Fun S', label: '✨', exposure: 1.1, contrast: 1.05, saturation: 1.1, vibrance: 1.2, temp: 20, magenta: 0, sharpness: 1.3, grain: 5, skinSoft: 0.4, glow: 0.3, vignette: 0.1 },
    vhs: { id: 'vhs', name: 'VHS', label: '📼', exposure: 1.2, contrast: 1.1, saturation: 0.8, vibrance: 0.9, temp: -10, magenta: -5, sharpness: 0.6, grain: 40, skinSoft: 0.1, glow: 0.8, vignette: 0.2 }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('d_classic');
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
            case 35: return 1.4;
            case 50: return 2.1;
            case 85: return 3.2;
            case 101: return 4.5;
            default: return 1.0;
        }
    };

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        
        // 1. Matriz de Cor e Luz
        const hue = (config.temp || 0) + (config.magenta || 0);
        const sat = (config.saturation || 1.0) * (config.vibrance || 1.0);
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${sat}) hue-rotate(${hue}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        // 2. Glow (Visual etéreo)
        if (config.glow && config.glow > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = config.glow * 0.3;
            ctx.filter = `blur(${Math.round(w * 0.02)}px) brightness(1.3)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
        }

        // 3. Suavização (Skin)
        if (config.skinSoft && config.skinSoft > 0) {
            ctx.globalAlpha = config.skinSoft * 0.2;
            ctx.filter = `blur(${Math.round(w * 0.005)}px)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.globalAlpha = 1.0;
        }

        // 4. Grain (Textura de Filme)
        if (config.grain && config.grain > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = config.grain / 255;
            for(let i=0; i< (isFinal ? 1000 : 200); i++){
                ctx.fillRect(Math.random()*w, Math.random()*h, isFinal ? 2 : 1, isFinal ? 2 : 1);
            }
            ctx.globalAlpha = 1.0;
        }

        // 5. Vinheta
        if (config.vignette && config.vignette > 0) {
            ctx.filter = 'none';
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.8);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // 6. Selos Profissionais Nelcel (Captura Final)
        if (isFinal) {
            ctx.filter = 'none';
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            
            // Data Amarela Vintage
            ctx.font = `bold ${Math.round(h * 0.04)}px monospace`;
            ctx.fillStyle = '#fbbf24'; 
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(dateStr, w * 0.08, h * 0.92);

            // Marca d'água Nelcel
            ctx.font = `900 ${Math.round(h * 0.018)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'right';
            ctx.letterSpacing = "4px";
            ctx.fillText("NELCEL", w * 0.92, h * 0.92);
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

            applyQualityPipeline(ctx, vw, vh, PARADISE_PACK[activeVibe], false);
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
        setTimeout(() => setShowFlashAnim(false), 80);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        
        // Recorte Matemático Real (Crop Zoom)
        const cropW = vw / zoom;
        const cropH = vh / zoom;
        const sx = (vw - cropW) / 2;
        const sy = (vh - cropH) / 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const oCtx = outCanvas.getContext('2d');
        
        if(oCtx) {
            oCtx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
            applyQualityPipeline(oCtx, cropW, cropH, PARADISE_PACK[activeVibe], true);
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
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                
                {/* Viewport com Transição Suave de Zoom */}
                <div className="w-full h-full flex items-center justify-center transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1)" style={{ transform: `scale(${zoom})` }}>
                    <canvas ref={canvasRef} className="w-full h-full object-cover" />
                </div>

                {/* Guia de Enquadramento Proporcional */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border-2 border-white/20 rounded-[2.5rem] shadow-[0_0_0_2000px_rgba(0,0,0,0.4)] transition-all duration-500 ease-out"
                        style={{ width: `${100/zoom}%`, aspectRatio: '3/4' }}
                    >
                         <div className="absolute bottom-6 left-6 opacity-40 flex flex-col gap-0.5">
                            <span className="text-[10px] font-black tracking-widest">{lensMM}MM NELCEL OPTICS</span>
                            <span className="text-[8px] font-bold">f/2.8 IS PRO</span>
                         </div>
                    </div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-8">
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2 items-center">
                        {Object.values(PARADISE_PACK).map(eff => (
                            <button key={eff.id} onClick={() => setActiveVibe(eff.id)} className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl border ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-center whitespace-nowrap">{eff.name}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-10">
                        <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-lg active:scale-95 transition-all">
                            {capturedImages.length > 0 && <img src={capturedImages[0]} className="w-full h-full object-cover" alt="prev" />}
                        </button>
                        <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                            <div className="w-full h-full rounded-full bg-white shadow-inner"></div>
                        </button>
                        <div className="w-14 h-14 bg-zinc-900/40 rounded-full flex items-center justify-center border border-white/5 opacity-20">
                             <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>
                        </div>
                    </div>
                </div>
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/90 backdrop-blur-md">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Fechar</button>
                        <h3 className="font-black uppercase tracking-[0.3em] text-xs">Galeria Nelcel</h3>
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
                            link.download = `Nelcel_Paradise_${Date.now()}.jpg`;
                            link.click();
                        }} className="flex-1 py-5 bg-white text-black rounded-3xl font-black text-[10px] uppercase tracking-[0.2em]">Baixar Foto</button>
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