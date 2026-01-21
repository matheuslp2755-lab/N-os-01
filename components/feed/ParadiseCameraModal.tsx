
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type CamMode = 'Vídeo' | 'Foto' | 'Live';

interface CameraModel {
    id: string;
    name: string;
    icon: string;
    filter: string;
}

const CAMERA_MODELS: CameraModel[] = [
    { id: 'reel', name: 'Reel', icon: '📽️', filter: 'contrast(1.1) sepia(0.3) saturate(1.4)' },
    { id: 'mangacore', name: 'MangaCore', icon: '📸', filter: 'grayscale(1) contrast(1.8) brightness(1.1)' },
    { id: 'kodak200', name: 'Kodak 200', icon: '🟡', filter: 'contrast(1.1) saturate(1.2) hue-rotate(-5deg) brightness(1.05)' },
    { id: 'g7x2', name: 'G7X2', icon: '📷', filter: 'brightness(1.15) contrast(1.05) saturate(1.1)' },
    { id: 'blue3k', name: 'Blue3K', icon: '🔵', filter: 'hue-rotate(190deg) brightness(1.1) saturate(1.3)' },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activeMode, setActiveMode] = useState<CamMode>('Foto');
    const [selectedCamera, setSelectedCamera] = useState<CameraModel>(CAMERA_MODELS[2]);
    const [zoom, setZoom] = useState(1);
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16' | 'full'>('3:4');
    const [flash, setFlash] = useState(false);
    const [timer, setTimer] = useState(0); 
    const [countdown, setCountdown] = useState<number | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    const [viewingMedia, setViewingMedia] = useState<string | null>(null);
    const [focusPoint, setFocusPoint] = useState<{ x: number, y: number } | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            // Solicita a maior resolução possível do sensor (4K / Ideal)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode, 
                    width: { ideal: 3840 }, 
                    height: { ideal: 2160 },
                    frameRate: { ideal: 60 }
                },
                audio: activeMode !== 'Foto'
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err) { console.error("Erro ao iniciar câmera HD:", err); }
    }, [facingMode, activeMode]);

    useEffect(() => {
        if (isOpen && !viewingMedia) startCamera();
        return () => streamRef.current?.getTracks().forEach(t => t.stop());
    }, [isOpen, startCamera, viewingMedia]);

    // Foco Manual por Toque
    const handleFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current || !streamRef.current) return;
        const rect = videoRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setFocusPoint({ x: e.clientX, y: e.clientY });
        setTimeout(() => setFocusPoint(null), 1000);

        const track = streamRef.current.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
            try {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'manual', pointsOfInterest: [{ x, y }] }] as any
                });
            } catch (e) { console.log("Foco manual não suportado hardware"); }
        }
    };

    const executeCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            // Usa resolução nativa do vídeo sem perdas
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.imageSmoothingEnabled = false;

            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }

            // Desenha o vídeo com o zoom atual
            if (zoom > 1) {
                const zW = canvas.width / zoom;
                const zH = canvas.height / zoom;
                const sx = (canvas.width - zW) / 2;
                const sy = (canvas.height - zH) / 2;
                ctx.drawImage(video, sx, sy, zW, zH, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.drawImage(video, 0, 0);
            }
            
            // Filtro Vintage
            ctx.filter = selectedCamera.filter;
            ctx.drawImage(canvas, 0, 0);

            // Marca d'água NÉOS (Canto superior direito)
            ctx.filter = 'none';
            ctx.font = `black ${Math.floor(canvas.width * 0.045)}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'right';
            ctx.fillText("NÉOS", canvas.width * 0.95, canvas.height * 0.08);

            // Data Vertical Amarela (Lado Esquerdo)
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')} ${(now.getMonth() + 1).toString().padStart(2, '0')} ${now.getFullYear().toString().slice(-2)}`;
            ctx.save();
            ctx.translate(canvas.width * 0.06, canvas.height * 0.85);
            ctx.rotate(-Math.PI / 2); 
            ctx.font = `bold ${Math.floor(canvas.width * 0.038)}px Courier, monospace`;
            ctx.fillStyle = '#fbbf24'; 
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10;
            ctx.fillText(dateStr, 0, 0);
            ctx.restore();
            
            ctx.restore();
            
            const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
            setCapturedMedia(prev => [dataUrl, ...prev]);
        }
    };

    const handleCaptureClick = () => {
        if (timer > 0) {
            setCountdown(timer);
            const interval = setInterval(() => {
                setCountdown(prev => {
                    if (prev === 1) {
                        clearInterval(interval);
                        executeCapture();
                        return null;
                    }
                    return prev ? prev - 1 : null;
                });
            }, 1000);
        } else {
            executeCapture();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none select-none">
            {viewingMedia && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col">
                    <header className="p-6 flex justify-between items-center bg-black/40 backdrop-blur-xl border-b border-white/10 z-10">
                        <button onClick={() => setViewingMedia(null)} className="p-2 bg-white/10 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={() => { const link = document.createElement('a'); link.href = viewingMedia; link.download = "neos-paradise.jpg"; link.click(); }} className="p-2 bg-sky-500 rounded-full shadow-lg"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                    </header>
                    <div className="flex-grow flex items-center justify-center p-4">
                        <img src={viewingMedia} className="max-w-full max-h-full rounded-3xl object-contain shadow-2xl" />
                    </div>
                </div>
            )}

            <div className="flex-grow relative flex items-center justify-center bg-[#050505] p-4">
                <div 
                    onClick={handleFocus}
                    className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/10 transition-all duration-500 shadow-[0_0_100px_rgba(0,0,0,0.5)] ${
                        aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : 
                        aspectRatio === '1:1' ? 'aspect-square w-full' : 'w-full h-full'
                    }`}
                >
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover transition-transform duration-300"
                        style={{ 
                            filter: selectedCamera.filter, 
                            transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'} scale(${zoom})`,
                            imageRendering: 'optimizeQuality'
                        }}
                    />
                    
                    {focusPoint && (
                        <div 
                            className="absolute w-16 h-16 border-2 border-sky-500 rounded-full animate-ping pointer-events-none"
                            style={{ left: focusPoint.x - 32, top: focusPoint.y - 32 }}
                        ></div>
                    )}

                    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                         <div className="flex justify-between items-start opacity-60">
                             <div className="text-[10px] font-mono leading-tight uppercase">Raw_Sensor<br/>4K_Native<br/>HDR_ON</div>
                             <div className="text-[10px] font-mono text-right leading-tight uppercase">ISO_Auto<br/>{Math.floor(canvasRef.current?.width || 0)}px<br/>60FPS</div>
                         </div>
                         {countdown && <div className="absolute inset-0 flex items-center justify-center"><span className="text-9xl font-black italic text-white animate-bounce">{countdown}</span></div>}
                         <div className="flex flex-col items-center gap-1 mb-8">
                             <div className="flex gap-4 bg-black/50 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                                 {[1, 1.5, 2, 4].map(z => (
                                     <button key={z} onClick={() => setZoom(z)} className={`text-[10px] font-black w-8 h-8 rounded-full transition-all ${zoom === z ? 'bg-white text-black' : 'text-white/40'}`}>{z}x</button>
                                 ))}
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-around items-center px-6 py-4 bg-black/90 backdrop-blur-md">
                <button onClick={() => setFlash(!flash)} className={`p-3 rounded-2xl transition-all ${flash ? 'bg-yellow-400 text-black shadow-lg' : 'bg-white/5 text-white/80'}`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </button>
                <button onClick={() => setTimer(prev => prev === 0 ? 3 : prev === 3 ? 10 : 0)} className={`p-3 rounded-2xl transition-all ${timer > 0 ? 'bg-sky-500 text-white shadow-lg' : 'bg-white/5 text-white/80'}`}>
                    <div className="relative">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {timer > 0 && <span className="absolute -top-1 -right-1 bg-white text-black text-[8px] px-1 rounded-full font-black">{timer}s</span>}
                    </div>
                </button>
                <button onClick={() => setAspectRatio(prev => prev === '3:4' ? '1:1' : prev === '1:1' ? 'full' : '3:4')} className="bg-white/10 px-4 py-2 rounded-xl text-[11px] font-black border border-white/10">{aspectRatio.toUpperCase()}</button>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="p-3 bg-white/5 rounded-2xl text-white/80"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                <button onClick={onClose} className="p-3 bg-red-500/10 text-red-500 rounded-2xl"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="bg-[#0a0a0a] py-6 border-t border-white/5 shadow-inner">
                <div className="flex gap-6 overflow-x-auto px-10 no-scrollbar items-center">
                    {CAMERA_MODELS.map((cam) => (
                        <button key={cam.id} onClick={() => setSelectedCamera(cam)} className={`flex flex-col items-center shrink-0 gap-3 transition-all duration-500 ${selectedCamera.id === cam.id ? 'scale-110 opacity-100' : 'opacity-30 blur-[0.5px]'}`}>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-zinc-800 border-2 ${selectedCamera.id === cam.id ? 'border-sky-500 ring-4 ring-sky-500/20 shadow-2xl' : 'border-white/10'}`}>{cam.icon}</div>
                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${selectedCamera.id === cam.id ? 'text-sky-500' : 'text-zinc-500'}`}>{cam.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            <footer className="bg-black pt-4 pb-12 px-8 flex items-center justify-between">
                <button onClick={() => capturedMedia[0] && setViewingMedia(capturedMedia[0])} className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-2xl transition-all active:scale-95">
                    {capturedMedia.length > 0 && <img src={capturedMedia[0]} className="w-full h-full object-cover animate-fade-in" />}
                </button>
                <button onClick={handleCaptureClick} className="w-24 h-24 rounded-full border-[6px] border-white/20 p-2 flex items-center justify-center active:scale-90 transition-all group">
                    <div className="w-full h-full rounded-full bg-white shadow-inner"></div>
                </button>
                <button className="w-14 h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-white/50 active:scale-95 transition-all">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
            </footer>

            <canvas ref={canvasRef} className="hidden" />
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        </div>
    );
};

export default ParadiseCameraModal;
