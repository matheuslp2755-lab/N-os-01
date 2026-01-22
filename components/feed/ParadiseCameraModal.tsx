
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
    { id: 'dazz', name: 'DAZZ DANSCAN', description: 'Flash Vintage', filterCSS: 'brightness(0.99) contrast(0.90) saturate(0.92) sepia(0.06)', grain: 0.16, dateColor: 'transparent', isDazz: true },
    { id: 'grf', name: 'GRF 2016', description: 'Classic 2016', filterCSS: 'brightness(0.92) contrast(0.82) saturate(0.85) sepia(0.06)', grain: 0.18, dateColor: '#FFC83D' },
    { id: 'huji', name: 'HUJI 98', description: 'Disposable', filterCSS: 'brightness(0.95) contrast(0.9) saturate(0.92) sepia(0.12)', grain: 0.30, dateColor: '#ef4444' },
    { id: 'iphone6', name: 'IPHONE 6', description: 'iOS 9 Camera', filterCSS: 'contrast(1.05) saturate(0.95) brightness(1.0)', grain: 0.05, dateColor: '#ffffff' },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activePreset, setActivePreset] = useState<Preset>(PRESETS[0]);
    const [zoom, setZoom] = useState(1);
    const [exposure, setExposure] = useState(1); 
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16'>('3:4');
    const [flash, setFlash] = useState(false);
    const [timer, setTimer] = useState(0); 
    const [countdown, setCountdown] = useState<number | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    
    const [showGallery, setShowGallery] = useState(false);
    const [galleryIdx, setGalleryIdx] = useState(0);
    const [focusUI, setFocusUI] = useState<{ x: number, y: number } | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode, 
                    width: { ideal: 4096 }, 
                    height: { ideal: 2160 }, 
                    frameRate: { ideal: 60 } 
                }
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        } catch (err) { console.error("Erro câmera:", err); }
    }, [facingMode]);

    useEffect(() => {
        if (isOpen && !showGallery) startCamera();
        return () => streamRef.current?.getTracks().forEach(t => t.stop());
    }, [isOpen, startCamera, showGallery]);

    const handleFocusAndExposure = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return;
        const x = e.clientX;
        const y = e.clientY;
        setFocusUI({ x, y });
        setTimeout(() => setFocusUI(null), 3500);
    };

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.imageSmoothingQuality = 'high';
            ctx.filter = `${activePreset.filterCSS} brightness(${exposure})`;
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            
            // Marca d'água PRO
            ctx.font = `black ${Math.floor(canvas.width * 0.04)}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'right';
            ctx.fillText("NÉOS PRO", canvas.width * 0.95, canvas.height * 0.95);

            setCapturedMedia(prev => [canvas.toDataURL('image/jpeg', 0.98), ...prev]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none select-none">
            <div className="flex-grow relative flex items-center justify-center bg-[#050505] p-4">
                <div onClick={handleFocusAndExposure} className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/10 transition-all duration-500 ${aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : aspectRatio === '1:1' ? 'aspect-square w-full' : 'w-full h-full'}`}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-transform duration-300" style={{ filter: `${activePreset.filterCSS} brightness(${exposure})`, transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'} scale(${zoom})` }} />
                    
                    {focusUI && (
                        <div className="absolute z-50 pointer-events-none" style={{ left: focusUI.x - 35, top: focusUI.y - 35 }}>
                            <div className="w-[70px] h-[70px] border-2 border-purple-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center justify-center">
                                <div className="w-1 h-1 bg-purple-500 rounded-full"></div>
                            </div>
                            <div className="absolute left-[85px] top-0 h-[70px] flex items-center pointer-events-auto">
                                <div className="relative h-full flex flex-col items-center">
                                    <div className="w-[2px] h-full bg-white/40 rounded-full"></div>
                                    <input type="range" min="0.4" max="1.8" step="0.05" value={exposure} onChange={e => setExposure(parseFloat(e.target.value))} className="absolute -left-[14px] top-0 h-full w-8 opacity-0 cursor-pointer appearance-none orient-vertical" style={{ WebkitAppearance: 'slider-vertical' } as any} />
                                    <div className="absolute w-4 h-4 bg-[#FFC83D] rounded-full shadow-lg border-2 border-black" style={{ bottom: `${((exposure - 0.4) / 1.4) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                         <div className="flex justify-between items-start opacity-60">
                             <div className="text-[10px] font-mono uppercase">{activePreset.name}<br/>AF_Active<br/>Grain_16%</div>
                             <div className="text-[10px] font-mono text-right uppercase">RAW_QUALITY<br/>{zoom.toFixed(1)}x<br/>ULTRA_HD</div>
                         </div>
                         <div className="flex flex-col items-center gap-1 mb-8">
                             <div className="flex gap-4 bg-black/50 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                                 {[1, 1.5, 2, 4].map(z => (<button key={z} onClick={(e) => { e.stopPropagation(); setZoom(z); }} className={`text-[10px] font-black w-8 h-8 rounded-full transition-all ${zoom === z ? 'bg-white text-black' : 'text-white/40'}`}>{z}x</button>))}
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-around items-center px-6 py-4 bg-black/90 backdrop-blur-md">
                <button onClick={() => setFlash(!flash)} className={`p-3 rounded-2xl transition-all ${flash ? 'bg-[#FFC83D] text-black shadow-lg' : 'bg-white/5 text-white/80'}`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>
                <button onClick={() => setAspectRatio(prev => prev === '3:4' ? '1:1' : prev === '1:1' ? '9:16' : '3:4')} className="bg-white/10 px-4 py-2 rounded-xl text-[11px] font-black border border-white/10">{aspectRatio.toUpperCase()}</button>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="p-3 bg-white/5 rounded-2xl text-white/80"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                <button onClick={onClose} className="p-3 bg-red-500/10 text-red-500 rounded-2xl"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <footer className="bg-black pt-4 pb-12 px-8 flex items-center justify-between">
                <button onClick={() => capturedMedia.length > 0 && setShowGallery(true)} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-2xl transition-all active:scale-95">{capturedMedia.length > 0 && <img src={capturedMedia[0]} className="w-full h-full object-cover" />}</button>
                <button onClick={handleCapture} className="w-24 h-24 rounded-full border-[6px] border-white/20 p-2 flex items-center justify-center active:scale-90 transition-all"><div className="w-full h-full rounded-full bg-white shadow-inner"></div></button>
                <div className="w-14" />
            </footer>
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default ParadiseCameraModal;
