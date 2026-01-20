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
    splitToneShadow?: { hue: number; sat: number };
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
        sharpness: 50, grain: 5, saturation: 1.2, temp: -5, vignette: 0.2,
        splitToneShadow: { hue: 210, sat: 0.1 }
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
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [showFlashAnim, setShowFlashAnim] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    // Fatores de zoom para simular as lentes
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

    const applyAIPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        ctx.save();
        
        // Efeito de Sharpness
        if (isFinal && config.sharpness > 0) {
            ctx.filter = `contrast(${1 + config.sharpness/100})`;
        }

        // Filtros Base
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${config.temp}deg)`;
        ctx.drawImage(ctx.canvas, 0, 0);

        // Grão de Filme
        if (config.grain > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = 'white';
            ctx.globalAlpha = config.grain / 255;
            for(let i=0; i < (isFinal ? 15000 : 1500); i++) {
                ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
            }
            ctx.globalAlpha = 1.0;
        }

        // Vinheta
        if (config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w * 0.8);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette + 0.3})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // Data e Marca d'água (Apenas no final)
        if (isFinal) {
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            ctx.font = `bold ${Math.round(h * 0.035)}px "Courier New", monospace`;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 5;
            ctx.fillText(dateStr, w * 0.08, h * 0.92);

            ctx.font = `900 ${Math.round(h * 0.015)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.textAlign = 'right';
            ctx.letterSpacing = "4px";
            ctx.fillText("PARADISE ENGINE PRO", w * 0.92, h * 0.92);
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
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
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

    const handleCapture = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 100);

        const zoom = getLensZoom(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        
        // Área do quadrado central baseado no zoom da lente
        const rectSize = Math.min(vw, vh) / zoom;
        const sx = (vw - rectSize) / 2;
        const sy = (vh - rectSize * 1.33) / 2; // Proporção vertical 3:4

        const outCanvas = document.createElement('canvas');
        outCanvas.width = 1200; 
        outCanvas.height = 1600;
        const oCtx = outCanvas.getContext('2d');
        
        if (oCtx) {
            // Desenha apenas o conteúdo dentro do quadrado visível
            oCtx.drawImage(canvas, sx, sy, rectSize, rectSize * 1.33, 0, 0, 1200, 1600);
            applyAIPipeline(oCtx, 1200, 1600, CAMERA_ENGINE_PACKS[activeVibe], true);
            const dataUrl = outCanvas.toDataURL('image/jpeg', 0.95);
            setCapturedImages(prev => [dataUrl, ...prev]);
        }
    };

    const discardImage = (img: string) => {
        if (window.confirm("Descartar esta foto?")) {
            setCapturedImages(prev => prev.filter(i => i !== img));
            setSelectedImage(null);
        }
    };

    const saveImage = (img: string) => {
        const link = document.createElement('a');
        link.href = img;
        link.download = `Paradise_Cam_${Date.now()}.jpg`;
        link.click();
    };

    if (!isOpen) return null;

    const currentZoom = getLensZoom(lensMM);

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white animate-fade-out"></div>}

            {/* Header: Controles de Lente */}
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl shadow-2xl active:scale-90">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-5 py-2 rounded-full border border-white/10 shadow-2xl overflow-x-auto no-scrollbar">
                    {([24, 35, 50, 85, 101] as LensMM[]).map(mm => (
                        <button 
                            key={mm} 
                            onClick={() => setLensMM(mm)} 
                            className={`text-[11px] font-black transition-all ${lensMM === mm ? 'text-sky-400 scale-125' : 'text-white/40'}`}
                        >
                            {mm}mm
                        </button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </header>

            {/* Viewfinder: A imagem amplia conforme a lente, mas o quadrado de recorte guia o usuário */}
            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                
                {/* Imagem Ampliada (Zoom) */}
                <div 
                    className="w-full h-full flex items-center justify-center transition-transform duration-500 ease-out"
                    style={{ transform: `scale(${currentZoom})` }}
                >
                    <canvas ref={canvasRef} className="w-full h-full object-cover" />
                </div>

                {/* Moldura de Recorte Estática: O que estiver aqui dentro é o que sai na foto */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div 
                        className="border-2 border-white/30 rounded-[3rem] shadow-[0_0_0_2000px_rgba(0,0,0,0.6)] transition-all duration-500"
                        style={{ width: `${90 / currentZoom}%`, aspectRatio: '3/4' }}
                    >
                         <div className="absolute bottom-6 left-6 opacity-40 flex flex-col gap-0.5">
                            <span className="text-[10px] font-black tracking-widest">{lensMM}MM OPTIC</span>
                            <span className="text-[8px] font-bold">AREA DE CAPTURA</span>
                         </div>
                    </div>
                </div>
            </div>

            {/* Footer: Efeitos e Captura */}
            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-8">
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
                            {capturedImages.length > 0 && <img src={capturedImages[0]} className="w-full h-full object-cover" alt="prev" />}
                        </button>
                        <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white/30 p-1 active:scale-90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                            <div className="w-full h-full rounded-full bg-white"></div>
                        </button>
                        <div className="w-14"></div>
                    </div>
                </div>
            </footer>

            {/* Galeria Grid */}
            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-black uppercase text-[10px] tracking-widest">Fechar</button>
                        <h3 className="font-black uppercase tracking-[0.3em] text-xs">Film Roll</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5">
                        {capturedImages.map((img, i) => (
                            <div key={i} className="aspect-[3/4] cursor-pointer active:opacity-70" onClick={() => setSelectedImage(img)}>
                                <img src={img} className="w-full h-full object-cover" alt={`captured-${i}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Visualizador Fullscreen */}
            {selectedImage && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center z-10">
                        <button onClick={() => setSelectedImage(null)} className="p-2 bg-black/40 rounded-full">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2.5}/></svg>
                        </button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl shadow-white/5" alt="Fullscreen" />
                    </div>
                    <footer className="p-8 flex gap-4">
                        <button 
                            onClick={() => discardImage(selectedImage)} 
                            className="flex-1 py-4 rounded-2xl bg-zinc-900 text-red-500 font-black uppercase text-[10px] tracking-widest border border-red-500/20 active:scale-95 transition-all"
                        >
                            Descartar
                        </button>
                        <button 
                            onClick={() => saveImage(selectedImage)} 
                            className="flex-1 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                        >
                            Salvar Foto
                        </button>
                    </footer>
                </div>
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-fade-out { animation: fade-out 0.5s ease-out forwards; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;