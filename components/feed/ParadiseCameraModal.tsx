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
    beauty_glow: { id: 'beauty_glow', name: 'Beauty Glow', label: '✨', exposure: 1.15, contrast: 1.05, saturation: 1.1, vibrance: 1.2, temp: 8, magenta: 2, sharpness: 1.0, grain: 0, skinSoft: 0.9, glow: 0.5, vignette: 0.05 },
    sharp_boy: { id: 'sharp_boy', name: 'Sharp Boy', label: '👔', exposure: 1.05, contrast: 1.2, saturation: 1.0, vibrance: 1.0, temp: -5, magenta: 0, sharpness: 2.2, grain: 5, skinSoft: 0.2, glow: 0.1, vignette: 0.12 },
    sunset: { id: 'sunset', name: 'Sunset Paradise', label: '🌅', exposure: 1.1, contrast: 1.1, saturation: 1.3, vibrance: 1.4, temp: 25, magenta: 5, sharpness: 1.4, grain: 0, skinSoft: 0.4, glow: 0.4, vignette: 0.1 },
    night: { id: 'night', name: 'Night Shine', label: '🌃', exposure: 1.4, contrast: 1.25, saturation: 1.1, vibrance: 1.1, temp: 5, magenta: -2, sharpness: 1.6, grain: 12, skinSoft: 0.3, glow: 0.6, vignette: 0.2 },
    golden: { id: 'golden', name: 'Golden Hour', label: '🌞', exposure: 1.1, contrast: 1.05, saturation: 1.15, vibrance: 1.2, temp: 18, magenta: 3, sharpness: 1.2, grain: 0, skinSoft: 0.7, glow: 0.3, vignette: 0.08 },
    cinematic: { id: 'cinematic', name: 'Cinematic', label: '🎬', exposure: 0.9, contrast: 1.3, saturation: 0.8, vibrance: 0.9, temp: -12, magenta: -4, sharpness: 1.8, grain: 20, skinSoft: 0, glow: 0.4, vignette: 0.3 },
    pop: { id: 'pop', name: 'Asterix Pop', label: '💥', exposure: 1.0, contrast: 1.2, saturation: 1.4, vibrance: 1.5, temp: 10, magenta: 0, sharpness: 1.5, grain: 0, skinSoft: 0.2, glow: 0.2, vignette: 0.05 },
    elegant: { id: 'elegant', name: 'Elegant Pro', label: '💎', exposure: 1.0, contrast: 1.15, saturation: 0.85, vibrance: 0.9, temp: -10, magenta: 2, sharpness: 2.0, grain: 5, skinSoft: 0.4, glow: 0.1, vignette: 0.15 },
    party: { id: 'party', name: 'Vibrant Party', label: '🎉', exposure: 1.25, contrast: 1.2, saturation: 1.3, vibrance: 1.3, temp: 5, magenta: 4, sharpness: 1.2, grain: 8, skinSoft: 0.1, glow: 0.7, vignette: 0.1 },
    mood: { id: 'mood', name: 'Mood Blue', label: '❄️', exposure: 1.05, contrast: 1.1, saturation: 0.7, vibrance: 0.8, temp: -30, magenta: -8, sharpness: 1.4, grain: 15, skinSoft: 0, glow: 0.3, vignette: 0.25 }
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
    
    // Zoom real: Lentes maiores diminuem o campo de visão
    const getZoomFactor = (mm: LensMM) => {
        switch(mm) {
            case 24: return 1.0;
            case 35: return 1.4;
            case 50: return 2.0;
            case 85: return 3.2;
            default: return 1.0;
        }
    };

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        
        // 1. Processamento de Cor e Luz (Base)
        const hue = (config.temp || 0) + (config.magenta || 0);
        const sat = (config.saturation || 1.0) * (config.vibrance || 1.0);
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${sat}) hue-rotate(${hue}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        // 2. Glow e Difusão (Luzes Suaves)
        if (config.glow && config.glow > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = config.glow * 0.3;
            ctx.filter = `blur(${Math.round(w * 0.02)}px) brightness(1.5)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
        }

        // 3. Suavização de Pele (Selective Blur)
        if (config.skinSoft && config.skinSoft > 0) {
            ctx.globalAlpha = config.skinSoft * 0.2;
            ctx.filter = `blur(${Math.round(w * 0.004)}px)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.globalAlpha = 1.0;
        }

        // 4. Granulação (Textura Analógica)
        if (config.grain && config.grain > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = config.grain / 200;
            for(let i=0; i<100; i++){
                ctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);
            }
            ctx.globalAlpha = 1.0;
        }

        // 5. Vinheta (Profundidade)
        if (config.vignette && config.vignette > 0) {
            ctx.filter = 'none';
            const grad = ctx.createRadialGradient(w/2, h/2, w/3, w/2, h/2, w);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // 6. SELOS DE AUTENTICIDADE (Somente na captura final)
        if (isFinal) {
            ctx.filter = 'none';
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            
            // Data Amarela (Retro)
            ctx.font = `bold ${Math.round(h * 0.035)}px monospace`;
            ctx.fillStyle = '#facc15'; // Amarelo clássico
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(dateStr, w * 0.06, h * 0.94);

            // Marca d'água Nelcel
            ctx.font = `900 ${Math.round(h * 0.02)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'right';
            ctx.letterSpacing = "2px";
            ctx.fillText("NELCEL PARADISE", w * 0.94, h * 0.94);
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
        
        // Calculando a área de recorte baseada no zoom
        const cropW = vw / zoom;
        const cropH = vh / zoom;
        const startX = (vw - cropW) / 2;
        const startY = (vh - cropH) / 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const oCtx = outCanvas.getContext('2d');
        
        if(oCtx) {
            // Desenha apenas a parte de dentro do quadro (Zoom Real)
            oCtx.drawImage(canvas, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
            const activeConfig = isCreatingFilter ? newFilter : allPresets[activeVibe];
            applyQualityPipeline(oCtx, cropW, cropH, activeConfig, true);
        }

        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 0.98), ...prev]);
    };

    const saveCustomFilter = () => {
        const name = prompt("Nome do seu efeito Nelcel:", "Minha Lente");
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
        { id: 'contrast', name: 'Contraste', icon: '🌓', min: 0.5, max: 1.8, step: 0.05 },
        { id: 'sharpness', name: 'Nitidez', icon: '✨', min: 1.0, max: 4.0, step: 0.1 },
        { id: 'temp', name: 'Calor', icon: '🌡️', min: -50, max: 50, step: 1 },
        { id: 'saturation', name: 'Cor', icon: '🌈', min: 0, max: 2.0, step: 0.05 },
        { id: 'glow', name: 'Brilho', icon: '☁️', min: 0, max: 1.0, step: 0.05 },
    ];

    if (!isOpen) return null;

    const currentZoom = getZoomFactor(lensMM);

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white font-sans z-[600]">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white animate-pulse"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 shadow-2xl">
                    {([24, 35, 50, 85] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[10px] font-black transition-all ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/40'}`}>{mm}mm</button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                
                {/* Visualização da Câmera com Zoom Dinâmico */}
                <div className="w-full h-full flex items-center justify-center transition-transform duration-500 ease-out" style={{ transform: `scale(${currentZoom})` }}>
                    <canvas ref={canvasRef} className="w-full h-full object-cover" />
                </div>

                {/* Guia de Enquadramento (A área que será cortada) */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border-2 border-white/20 rounded-[2.5rem] shadow-[0_0_0_2000px_rgba(0,0,0,0.4)]"
                        style={{ width: `${100/currentZoom}%`, aspectRatio: '3/4' }}
                    >
                         <div className="absolute bottom-4 left-4 flex flex-col gap-1 opacity-50">
                            <span className="text-[10px] font-bold">Lente {lensMM}mm</span>
                            <span className="text-[8px] font-black uppercase tracking-widest">Nelcel Optics</span>
                         </div>
                    </div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-4 border-t border-white/5 z-50">
                {isCreatingFilter ? (
                    <div className="flex flex-col gap-6 animate-slide-up">
                        {activeEditTool ? (
                            <div className="px-6 py-4 bg-zinc-900 rounded-[2rem] space-y-4 shadow-2xl">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">
                                        {editTools.find(t => t.id === activeEditTool)?.name}
                                    </span>
                                    <button onClick={() => setActiveEditTool(null)} className="text-xs font-bold text-white">OK</button>
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
                            <button onClick={() => setIsCreatingFilter(false)} className="flex-1 py-4 bg-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancelar</button>
                            <button onClick={saveCustomFilter} className="flex-1 py-4 bg-sky-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-sky-500/20">Salvar Lente</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-2">
                            <button onClick={() => setIsCreatingFilter(true)} className="flex flex-col items-center shrink-0">
                                <div className="w-14 h-14 rounded-full bg-zinc-900 border-2 border-dashed border-white/20 flex items-center justify-center text-xl text-zinc-500 hover:border-white transition-all">+</div>
                                <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-zinc-500">Criar</span>
                            </button>
                            {Object.values(allPresets).map(eff => (
                                <button key={eff.id} onClick={() => setActiveVibe(eff.id)} className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}>
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl border ${activeVibe === eff.id ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>{eff.label}</div>
                                    <span className="text-[8px] font-black uppercase mt-2 tracking-widest text-center">{eff.name.split(' ').slice(-1)}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between px-8">
                            <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-lg active:scale-95 transition-all">
                                {capturedImages.length > 0 && <img src={capturedImages[0]} className="w-full h-full object-cover" alt="prev" />}
                            </button>
                            <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                <div className="w-full h-full rounded-full bg-white shadow-inner"></div>
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
                        <h3 className="font-black uppercase tracking-[0.2em] text-xs">Nelcel Paradise</h3>
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
                        <img src={capturedImages[fullscreenImage]} className="max-h-full max-w-full object-contain rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)]" alt="full" />
                    </div>
                    <footer className="p-8 flex gap-4 bg-black/90">
                        <button onClick={() => {
                            const link = document.createElement('a');
                            link.href = capturedImages[fullscreenImage!];
                            link.download = `Nelcel_Paradise_${Date.now()}.jpg`;
                            link.click();
                        }} className="flex-1 py-4 bg-zinc-900 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em]">Download</button>
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