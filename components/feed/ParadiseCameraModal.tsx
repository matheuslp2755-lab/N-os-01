import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = string;
type LensMM = 24 | 35 | 50 | 85;

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
    isCustom?: boolean;
}

const PREMIUM_PACK: Record<string, EffectConfig> = {
    beauty_glow: { id: 'beauty_glow', name: 'Neos Beauty Glow', label: '✨', exposure: 1.4, contrast: 1.1, saturation: 1.08, vibrance: 1.15, temp: 10, magenta: 0, sharpness: 1.0, grain: 0, skinSoft: 0.8, glow: 0.4, vignette: 0.05 },
    sharp_boy: { id: 'sharp_boy', name: 'Neos Sharp Boy', label: '👔', exposure: 1.3, contrast: 1.15, saturation: 1.05, vibrance: 1.0, temp: 0, magenta: 0, sharpness: 1.8, grain: 0, skinSoft: 0.3, glow: 0.2, vignette: 0.08 },
    sunset_paradise: { id: 'sunset_paradise', name: 'Neos Sunset Paradise', label: '🌅', exposure: 1.4, contrast: 1.15, saturation: 1.2, vibrance: 1.25, temp: 25, magenta: 5, sharpness: 1.2, grain: 0, skinSoft: 0.4, glow: 0.5, vignette: 0.05 },
    night_shine: { id: 'night_shine', name: 'Neos Night Shine', label: '🌃', exposure: 1.3, contrast: 1.2, saturation: 1.15, vibrance: 1.2, temp: 5, magenta: 0, sharpness: 1.3, grain: 5, skinSoft: 0.3, glow: 0.4, vignette: 0.12 },
    golden_hour: { id: 'golden_hour', name: 'Neos Golden Hour Pro', label: '🌞', exposure: 1.3, contrast: 1.1, saturation: 1.1, vibrance: 1.15, temp: 18, magenta: 3, sharpness: 1.5, grain: 0, skinSoft: 0.6, glow: 0.4, vignette: 0.05 },
    cinematic_vibe: { id: 'cinematic_vibe', name: 'Neos Cinematic Vibe', label: '🎬', exposure: 0.9, contrast: 0.9, saturation: 0.9, vibrance: 1.0, temp: -15, magenta: 0, sharpness: 1.1, grain: 15, skinSoft: 0.1, glow: 0.3, vignette: 0.15 },
    asterix_pop: { id: 'asterix_pop', name: 'Neos Asterix Pop', label: '💥', exposure: 1.2, contrast: 1.15, saturation: 1.2, vibrance: 1.25, temp: 8, magenta: 0, sharpness: 1.5, grain: 0, skinSoft: 0.0, glow: 0.3, vignette: 0.08 },
    elegant_pro: { id: 'elegant_pro', name: 'Neos Elegant Pro', label: '💎', exposure: 1.1, contrast: 1.2, saturation: 0.95, vibrance: 1.0, temp: -5, magenta: 0, sharpness: 1.7, grain: 0, skinSoft: 0.2, glow: 0.1, vignette: 0.1 },
    vibrant_party: { id: 'vibrant_party', name: 'Neos Vibrant Party', label: '🎉', exposure: 1.3, contrast: 1.2, saturation: 1.25, vibrance: 1.3, temp: 0, magenta: 0, sharpness: 1.4, grain: 0, skinSoft: 0.1, glow: 0.5, vignette: 0.05 },
    mood_blue: { id: 'mood_blue', name: 'Neos Mood Blue', label: '❄️', exposure: 1.1, contrast: 1.1, saturation: 0.9, vibrance: 0.95, temp: -20, magenta: -5, sharpness: 1.3, grain: 10, skinSoft: 0.0, glow: 0.4, vignette: 0.12 }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('beauty_glow');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [flashOn, setFlashOn] = useState(false);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<number | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [customFilters, setCustomFilters] = useState<EffectConfig[]>([]);
    const [isCreatingFilter, setIsCreatingFilter] = useState(false);
    const [activeEditTool, setActiveEditTool] = useState<string | null>(null);
    const [newFilter, setNewFilter] = useState<EffectConfig>({
        id: '', name: '', label: '⭐', exposure: 1.0, contrast: 1.0, saturation: 1.0, temp: 0, magenta: 0, sharpness: 1.0, grain: 0, vignette: 0, isCustom: true
    });

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('neos_custom_filters');
        if (saved) setCustomFilters(JSON.parse(saved));
    }, []);

    const allPresets = { ...PREMIUM_PACK, ...Object.fromEntries(customFilters.map(f => [f.id, f])) };
    const getZoomFactor = (mm: LensMM) => ({ 24: 1.0, 35: 1.3, 50: 1.8, 85: 2.6 }[mm]);

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.filter = 'none';
        
        // 1. Processamento Base (Cor e Luz)
        const hue = (config.temp || 0) + (config.magenta || 0);
        const sat = (config.saturation || 1.0) * (config.vibrance || 1.0);
        const br = config.exposure || 1.0;
        const ct = config.contrast || 1.0;
        
        ctx.filter = `brightness(${br}) contrast(${ct}) saturate(${sat}) hue-rotate(${hue}deg)`;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        if(tCtx) {
            tCtx.drawImage(ctx.canvas, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(tempCanvas, 0, 0);
        }
        ctx.filter = 'none';

        // 2. Nitidez e Suavização de Pele
        if (config.skinSoft && config.skinSoft > 0) {
            ctx.save();
            ctx.globalAlpha = config.skinSoft * 0.3;
            ctx.filter = `blur(${Math.round(w * 0.005)}px)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 3. Efeito Glow (Luzes Difusas)
        if (config.glow && config.glow > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = config.glow * 0.4;
            ctx.filter = `blur(${Math.round(w * 0.03)}px) brightness(1.2)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        // 4. Marca d'água Proporcional
        if (isFinal) {
            ctx.save();
            const fontSize = Math.round(h * 0.03);
            ctx.font = `900 ${fontSize}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.textAlign = 'right';
            ctx.letterSpacing = "4px";
            ctx.fillText("NEOS", w - (w * 0.05), h - (h * 0.05));
            ctx.restore();
        }

        // 5. Vinheta
        if (config.vignette && config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.9);
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
            if (facingMode === 'user') { ctx.translate(vw, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();
            const activeConfig = isCreatingFilter ? newFilter : allPresets[activeVibe];
            applyQualityPipeline(ctx, vw, vh, activeConfig, false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe, isCreatingFilter, newFilter, allPresets]);

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
        const outW = vw / zoom;
        const outH = vh / zoom;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = outW; outCanvas.height = outH;
        const oCtx = outCanvas.getContext('2d');
        if(oCtx) {
            oCtx.drawImage(canvas, (vw-outW)/2, (vh-outH)/2, outW, outH, 0, 0, outW, outH);
            const activeConfig = isCreatingFilter ? newFilter : allPresets[activeVibe];
            applyQualityPipeline(oCtx, outW, outH, activeConfig, true);
        }
        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 1.0), ...prev]);
    };

    const saveCustomFilter = () => {
        const name = prompt("Qual o nome do seu efeito?", "Meu Efeito Neos");
        if (!name) return;
        const filterToSave = { ...newFilter, name, id: `custom_${Date.now()}` };
        const updated = [...customFilters, filterToSave];
        setCustomFilters(updated);
        localStorage.setItem('neos_custom_filters', JSON.stringify(updated));
        setActiveVibe(filterToSave.id);
        setIsCreatingFilter(false);
    };

    const editTools = [
        { id: 'exposure', name: 'Luz', icon: '☀️', min: 0.5, max: 2.0, step: 0.05 },
        { id: 'contrast', name: 'Contraste', icon: '🌓', min: 0.5, max: 1.5, step: 0.05 },
        { id: 'sharpness', name: 'Nitidez', icon: '✨', min: 0.5, max: 2.5, step: 0.1 },
        { id: 'temp', name: 'Tonalidade', icon: '🌡️', min: -50, max: 50, step: 1 },
        { id: 'magenta', name: 'Matiz', icon: '🎨', min: -50, max: 50, step: 1 },
        { id: 'saturation', name: 'Saturação', icon: '🌈', min: 0, max: 2.0, step: 0.05 },
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white font-sans z-[600]">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white animate-pulse"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                    {([24, 35, 50, 85] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[10px] font-black transition-colors ${lensMM === mm ? 'text-sky-400' : 'text-white/40'}`}>{mm}mm</button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                <canvas ref={canvasRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none border-[40px] border-black/10"></div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-4 border-t border-white/5 z-50">
                {isCreatingFilter ? (
                    <div className="flex flex-col gap-6 animate-slide-up">
                        {activeEditTool ? (
                            <div className="px-6 py-4 bg-zinc-900 rounded-[2rem] space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">
                                        {editTools.find(t => t.id === activeEditTool)?.name}
                                    </span>
                                    <button onClick={() => setActiveEditTool(null)} className="text-xs font-bold">OK</button>
                                </div>
                                <input 
                                    type="range" 
                                    min={editTools.find(t => t.id === activeEditTool)?.min} 
                                    max={editTools.find(t => t.id === activeEditTool)?.max} 
                                    step={editTools.find(t => t.id === activeEditTool)?.step}
                                    value={(newFilter as any)[activeEditTool]}
                                    onChange={(e) => setNewFilter(prev => ({...prev, [activeEditTool]: parseFloat(e.target.value)}))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none accent-sky-500" 
                                />
                            </div>
                        ) : (
                            <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2">
                                {editTools.map(tool => (
                                    <button 
                                        key={tool.id}
                                        onClick={() => setActiveEditTool(tool.id)}
                                        className="flex flex-col items-center shrink-0"
                                    >
                                        <div className="w-14 h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-xl hover:bg-zinc-800 transition-all">
                                            {tool.icon}
                                        </div>
                                        <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-zinc-500">{tool.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-4 px-4">
                            <button onClick={() => setIsCreatingFilter(false)} className="flex-1 py-4 bg-zinc-900 rounded-2xl font-black text-[10px] uppercase">Cancelar</button>
                            <button onClick={saveCustomFilter} className="flex-1 py-4 bg-sky-500 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-sky-500/20">Salvar Efeito</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2">
                            <button onClick={() => setIsCreatingFilter(true)} className="flex flex-col items-center shrink-0">
                                <div className="w-14 h-14 rounded-full bg-zinc-900 border-2 border-dashed border-white/20 flex items-center justify-center text-xl text-zinc-500">+</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-zinc-500">Criar</span>
                            </button>
                            {Object.values(allPresets).map(eff => (
                                <button key={eff.id} onClick={() => setActiveVibe(eff.id)} className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}>
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl border ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-xl' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                    <span className="text-[8px] font-black uppercase mt-2 tracking-widest">{eff.name.split(' ').pop()}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between px-8">
                            <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-lg">
                                {capturedImages.length > 0 && <img src={capturedImages[0]} className="w-full h-full object-cover" alt="prev" />}
                            </button>
                            <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                <div className="w-full h-full rounded-full bg-white"></div>
                            </button>
                            <div className="w-14"></div>
                        </div>
                    </div>
                )}
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/90 backdrop-blur-md">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Fechar</button>
                        <h3 className="font-black uppercase tracking-[0.2em] text-xs">Galeria Paradise</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                        {capturedImages.map((img, i) => (
                            <div key={i} onClick={() => setFullscreenImage(i)} className="aspect-[3/4] relative cursor-pointer"><img src={img} className="w-full h-full object-cover" alt={`img-${i}`} /></div>
                        ))}
                    </div>
                </div>
            )}

            {fullscreenImage !== null && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center bg-black/90">
                        <button onClick={() => setFullscreenImage(null)} className="text-zinc-400 font-black uppercase text-[10px]">Voltar</button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={capturedImages[fullscreenImage]} className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl" alt="full" />
                    </div>
                    <footer className="p-8 flex gap-4 bg-black/90">
                        <button onClick={() => {
                            const link = document.createElement('a');
                            link.href = capturedImages[fullscreenImage!];
                            link.download = `Neos_Premium_${Date.now()}.jpg`;
                            link.click();
                        }} className="flex-1 py-4 bg-zinc-900 rounded-3xl font-black text-[10px] uppercase tracking-widest">Download</button>
                    </footer>
                </div>
            )}

            <style>{`
                @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;