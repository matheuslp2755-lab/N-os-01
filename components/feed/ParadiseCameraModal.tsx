
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Preset {
    id: string;
    name: string;
    description: string;
    filterCSS: string;
    grain: number;
    dateColor: string;
    hasLightLeak?: boolean;
    isDazz?: boolean;
}

const PRESETS: Preset[] = [
    { 
        id: 'dazz', 
        name: 'DAZZ DANSCAN', 
        description: 'Flash Vintage / GRF Look', 
        filterCSS: 'brightness(0.99) contrast(0.90) saturate(0.92) sepia(0.06) blur(0.05px)', 
        grain: 0.16, 
        dateColor: 'transparent',
        isDazz: true 
    },
    { id: 'grf', name: 'GRF 2016', description: 'Classic 2016 Web', filterCSS: 'brightness(0.92) contrast(0.82) saturate(0.85) sepia(0.06)', grain: 0.18, dateColor: '#FFC83D' },
    { id: 'huji', name: 'HUJI 98', description: 'Disposable Vintage', filterCSS: 'brightness(0.95) contrast(0.9) saturate(0.92) sepia(0.12) blur(0.1px)', grain: 0.30, dateColor: '#ef4444', hasLightLeak: true },
    { id: 'vsco', name: 'VSCO SOFT', description: 'Clean & Aesthetic', filterCSS: 'brightness(1.08) contrast(0.78) saturate(0.9) sepia(0.04)', grain: 0.10, dateColor: '#ffffff' },
    { id: 'iphone6', name: 'IPHONE 6', description: 'iOS 9 Camera', filterCSS: 'contrast(1.05) saturate(0.95) brightness(1.0)', grain: 0.05, dateColor: '#ffffff' },
    { id: 'cyber', name: 'CYBERPUNK', description: 'Neon Impact', filterCSS: 'contrast(1.3) saturate(1.35) hue-rotate(-10deg) brightness(1.1)', grain: 0.05, dateColor: '#f472b6' },
    { id: 'disposable', name: 'KODAK', description: 'Cheap Film', filterCSS: 'brightness(0.9) contrast(0.7) saturate(0.8) sepia(0.1) blur(0.2px)', grain: 0.35, dateColor: '#fbbf24' },
    { id: 'tumblr', name: 'DARK TUMBLR', description: 'Indie 2014', filterCSS: 'brightness(0.8) contrast(1.1) saturate(0.7) sepia(0.05)', grain: 0.25, dateColor: '#94a3b8' },
    { id: 'analog', name: 'ANALOG PRO', description: 'Cinema Premium', filterCSS: 'contrast(0.85) saturate(0.95) sepia(0.03)', grain: 0.12, dateColor: '#f3f4f6' },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activePreset, setActivePreset] = useState<Preset>(PRESETS[0]);
    const [zoom, setZoom] = useState(1);
    const [exposure, setExposure] = useState(1); // Brilho (1 = normal)
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16' | 'full'>('3:4');
    const [flash, setFlash] = useState(false);
    const [timer, setTimer] = useState(0); 
    const [countdown, setCountdown] = useState<number | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    
    const [showGallery, setShowGallery] = useState(false);
    const [galleryIdx, setGalleryIdx] = useState(0);
    const [focusUI, setFocusUI] = useState<{ x: number, y: number } | null>(null);
    const [isAdjustingExposure, setIsAdjustingExposure] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 } }
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        } catch (err) { console.error("Erro ao iniciar câmera:", err); }
    }, [facingMode]);

    useEffect(() => {
        if (isOpen && !showGallery) startCamera();
        return () => streamRef.current?.getTracks().forEach(t => t.stop());
    }, [isOpen, startCamera, showGallery]);

    const handleFocusAndExposure = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return;
        const rect = videoRef.current.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        
        setFocusUI({ x, y });
        setExposure(1); // Reseta brilho ao trocar foco
        
        // Timeout para sumir interface de foco
        setTimeout(() => setFocusUI(null), 3500);
    };

    const handleExposureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        setExposure(parseFloat(e.target.value));
    };

    const applyPostProcessing = (ctx: CanvasRenderingContext2D, width: number, height: number, preset: Preset) => {
        // Aplica o brilho personalizado do usuário
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = `brightness(${exposure})`;
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.restore();

        // Grão
        const grainCanvas = document.createElement('canvas');
        grainCanvas.width = 256; grainCanvas.height = 256;
        const gCtx = grainCanvas.getContext('2d');
        if (gCtx) {
            const gData = gCtx.createImageData(256, 256);
            for (let i = 0; i < gData.data.length; i += 4) {
                const val = Math.random() * 255;
                gData.data[i] = val; gData.data[i+1] = val; gData.data[i+2] = val; gData.data[i+3] = 255;
            }
            gCtx.putImageData(gData, 0, 0);
            ctx.save();
            ctx.globalAlpha = preset.grain * 0.85;
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = ctx.createPattern(grainCanvas, 'repeat')!;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        if (preset.isDazz) {
            ctx.save();
            ctx.globalCompositeOperation = 'soft-light';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
            const dazzFlash = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.9);
            dazzFlash.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
            dazzFlash.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
            ctx.fillStyle = dazzFlash;
            ctx.fillRect(0, 0, width, height);
        }

        // Marca d'água
        ctx.save();
        ctx.font = `bold ${Math.floor(width * 0.05)}px sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.textAlign = 'right';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
        ctx.fillText("NÉOS", width * 0.95, height * 0.94);
        ctx.restore();
    };

    const executeCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.imageSmoothingEnabled = true;

            // Aplica preset + exposição do usuário
            ctx.filter = `${activePreset.filterCSS} brightness(${exposure})`;
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            ctx.filter = 'none';

            applyPostProcessing(ctx, canvas.width, canvas.height, activePreset);
            setCapturedMedia(prev => [canvas.toDataURL('image/jpeg', 0.92), ...prev]);
        }
    };

    // Fix: Added handleCaptureClick to handle timer logic before executing the actual capture.
    const handleCaptureClick = () => {
        if (timer > 0) {
            let count = timer;
            setCountdown(count);
            const intervalId = window.setInterval(() => {
                count -= 1;
                if (count <= 0) {
                    window.clearInterval(intervalId);
                    setCountdown(null);
                    executeCapture();
                } else {
                    setCountdown(count);
                }
            }, 1000);
        } else {
            executeCapture();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none select-none">
            {showGallery && capturedMedia.length > 0 && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center bg-black/40 backdrop-blur-xl border-b border-white/10 z-10">
                        <button onClick={() => setShowGallery(false)} className="p-2 bg-white/10 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg></button>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Galeria Paradise ({galleryIdx + 1}/{capturedMedia.length})</span>
                        <button onClick={() => { const link = document.createElement('a'); link.href = capturedMedia[galleryIdx]; link.download = `neos-p-${Date.now()}.jpg`; link.click(); }} className="p-2 bg-sky-500 rounded-full shadow-lg"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                    </header>
                    <div className="flex-grow flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-between px-4 z-10">
                             <button onClick={() => setGalleryIdx(p => Math.max(0, p - 1))} className="p-4 opacity-50 hover:opacity-100 transition-opacity"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth={3}/></svg></button>
                             <button onClick={() => setGalleryIdx(p => Math.min(capturedMedia.length - 1, p + 1))} className="p-4 opacity-50 hover:opacity-100 transition-opacity"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth={3}/></svg></button>
                        </div>
                        <img key={galleryIdx} src={capturedMedia[galleryIdx]} className="max-w-full max-h-full object-contain animate-slide-right" />
                    </div>
                </div>
            )}

            <div className="flex-grow relative flex items-center justify-center bg-[#050505] p-4">
                <div onClick={handleFocusAndExposure} className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/10 transition-all duration-500 shadow-[0_0_100px_rgba(0,0,0,0.5)] ${aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : aspectRatio === '1:1' ? 'aspect-square w-full' : 'w-full h-full'}`}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-transform duration-300" style={{ filter: `${activePreset.filterCSS} brightness(${exposure})`, transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'}` }} />
                    
                    {focusUI && (
                        <div className="absolute z-50 pointer-events-none" style={{ left: focusUI.x - 35, top: focusUI.y - 35 }}>
                            {/* Círculo de Foco */}
                            <div className="w-[70px] h-[70px] border-2 border-purple-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center justify-center">
                                <div className="w-1 h-1 bg-purple-500 rounded-full"></div>
                            </div>
                            {/* Controle de Brilho Lateral */}
                            <div className="absolute left-[85px] top-0 h-[70px] flex items-center pointer-events-auto">
                                <div className="relative h-full flex flex-col items-center">
                                    <div className="w-[2px] h-full bg-white/40 rounded-full"></div>
                                    <input 
                                        type="range" 
                                        min="0.4" 
                                        max="1.8" 
                                        step="0.05"
                                        value={exposure}
                                        onChange={handleExposureChange}
                                        onClick={e => e.stopPropagation()}
                                        className="absolute -left-[14px] top-0 h-full w-8 opacity-0 cursor-pointer appearance-none orient-vertical"
                                        style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as any}
                                    />
                                    <div 
                                        className="absolute w-4 h-4 bg-[#FFC83D] rounded-full shadow-lg border-2 border-black transition-all"
                                        style={{ bottom: `${((exposure - 0.4) / 1.4) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                         <div className="flex justify-between items-start opacity-60">
                             <div className="text-[10px] font-mono leading-tight uppercase">{activePreset.name}<br/>AF_Active<br/>Grain_{activePreset.grain * 100}%</div>
                             <div className="text-[10px] font-mono text-right leading-tight uppercase">ISO_Auto<br/>EXP_{exposure.toFixed(2)}<br/>60FPS</div>
                         </div>
                         {countdown && <div className="absolute inset-0 flex items-center justify-center"><span className="text-9xl font-black italic text-[#FFC83D] animate-bounce">{countdown}</span></div>}
                         <div className="flex flex-col items-center gap-1 mb-8">
                             <div className="flex gap-4 bg-black/50 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                                 {[1, 1.5, 2, 4].map(z => (<button key={z} onClick={(e) => { e.stopPropagation(); setZoom(z); }} className={`text-[10px] font-black w-8 h-8 rounded-full transition-all ${zoom === z ? 'bg-white text-black' : 'text-white/40'}`}>{z}x</button>))}
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-around items-center px-6 py-4 bg-black/90 backdrop-blur-md">
                <button onClick={(e) => { e.stopPropagation(); setFlash(!flash); }} className={`p-3 rounded-2xl transition-all ${flash ? 'bg-[#FFC83D] text-black shadow-lg' : 'bg-white/5 text-white/80'}`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>
                <button onClick={(e) => { e.stopPropagation(); setTimer(prev => prev === 0 ? 3 : prev === 3 ? 10 : 0); }} className={`p-3 rounded-2xl transition-all ${timer > 0 ? 'bg-sky-500 text-white shadow-lg' : 'bg-white/5 text-white/80'}`}><div className="relative"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{timer > 0 && <span className="absolute -top-1 -right-1 bg-white text-black text-[8px] px-1 rounded-full font-black">{timer}s</span>}</div></button>
                <button onClick={(e) => { e.stopPropagation(); setAspectRatio(prev => prev === '3:4' ? '1:1' : prev === '1:1' ? 'full' : '3:4'); }} className="bg-white/10 px-4 py-2 rounded-xl text-[11px] font-black border border-white/10">{aspectRatio.toUpperCase()}</button>
                <button onClick={(e) => { e.stopPropagation(); setFacingMode(prev => prev === 'user' ? 'environment' : 'user'); }} className="p-3 bg-white/5 rounded-2xl text-white/80"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                <button onClick={onClose} className="p-3 bg-red-500/10 text-red-500 rounded-2xl"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="bg-[#0a0a0a] py-8 border-t border-white/5 shadow-inner">
                <div className="flex gap-6 overflow-x-auto px-10 no-scrollbar items-center">
                    {PRESETS.map((p) => (
                        <button key={p.id} onClick={(e) => { e.stopPropagation(); setActivePreset(p); }} className={`flex flex-col items-center shrink-0 gap-3 transition-all duration-500 ${activePreset.id === p.id ? 'scale-110 opacity-100' : 'opacity-30 blur-[0.5px]'}`}>
                            <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center bg-zinc-800 border-2 ${activePreset.id === p.id ? 'border-[#FFC83D] ring-4 ring-[#FFC83D]/20 shadow-xl' : 'border-white/10'}`}><svg className={`w-8 h-8 ${activePreset.id === p.id ? 'text-[#FFC83D]' : 'text-zinc-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                            <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${activePreset.id === p.id ? 'text-[#FFC83D]' : 'text-zinc-500'}`}>{p.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            <footer className="bg-black pt-4 pb-12 px-8 flex items-center justify-between">
                <button onClick={(e) => { e.stopPropagation(); capturedMedia.length > 0 && setShowGallery(true); }} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-2xl transition-all active:scale-95">{capturedMedia.length > 0 && <img src={capturedMedia[0]} className="w-full h-full object-cover animate-fade-in" />}</button>
                <button onClick={(e) => { e.stopPropagation(); if (countdown === null) handleCaptureClick(); }} className="w-24 h-24 rounded-full border-[6px] border-white/20 p-2 flex items-center justify-center active:scale-90 transition-all group"><div className="w-full h-full rounded-full bg-white shadow-inner"></div></button>
                <button className="w-14 h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-white/50 active:scale-95 transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>
            </footer>
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default ParadiseCameraModal;
