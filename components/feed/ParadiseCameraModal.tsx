
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
    overlay?: string;
    isPremium?: boolean;
}

const CAMERA_MODELS: CameraModel[] = [
    { id: 'reel', name: 'Reel', icon: '📽️', filter: 'contrast(1.1) sepia(0.3) saturate(1.4)' },
    { id: 'mangacore', name: 'MangaCore', icon: '📸', filter: 'grayscale(1) contrast(1.8) brightness(1.1)' },
    { id: 'kodak200', name: 'Kodak 200', icon: '🟡', filter: 'contrast(1.1) saturate(1.2) hue-rotate(-5deg) brightness(1.05)' },
    { id: 'g7x2', name: 'G7X2', icon: '📷', filter: 'brightness(1.15) contrast(1.05) saturate(1.1)', isPremium: true },
    { id: 'blue3k', name: 'Blue3K', icon: '🔵', filter: 'hue-rotate(190deg) brightness(1.1) saturate(1.3)' },
    { id: 'dcr', name: 'DCR', icon: '📹', filter: 'contrast(0.9) brightness(1.2) saturate(0.9) blur(0.3px)', isPremium: true },
    { id: 'fuji-x', name: 'FUJI-X', icon: '🔴', filter: 'contrast(1.3) saturate(1.4) brightness(1.02)' },
    { id: 'nokia', name: 'NOKIA', icon: '📱', filter: 'contrast(0.9) brightness(1.3) saturate(1.5)', isPremium: true },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activeMode, setActiveMode] = useState<CamMode>('Foto');
    const [selectedCamera, setSelectedCamera] = useState<CameraModel>(CAMERA_MODELS[2]);
    const [zoom, setZoom] = useState(1);
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16' | 'full'>('3:4');
    const [flash, setFlash] = useState(false);
    const [timer, setTimer] = useState(0); // 0, 3, 10
    const [countdown, setCountdown] = useState<number | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    const [showFlashAnim, setShowFlashAnim] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            // Requisita qualidade ultra-alta (4K se disponível)
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
        if (isOpen) startCamera();
        return () => streamRef.current?.getTracks().forEach(t => t.stop());
    }, [isOpen, startCamera]);

    const executeCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        // Efeito de Flash na UI
        if (flash) {
            setShowFlashAnim(true);
            setTimeout(() => setShowFlashAnim(false), 150);
        }

        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            // Mantém a resolução nativa do vídeo para qualidade máxima
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.imageSmoothingEnabled = false; // Garante nitidez (pixel perfect)

            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }

            // Aplicar Zoom no Canvas (centralizado)
            if (zoom > 1) {
                const zW = canvas.width / zoom;
                const zH = canvas.height / zoom;
                const sx = (canvas.width - zW) / 2;
                const sy = (canvas.height - zH) / 2;
                ctx.drawImage(video, sx, sy, zW, zH, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.drawImage(video, 0, 0);
            }
            
            // Aplicar Filtro Vintage Pro
            ctx.filter = selectedCamera.filter;
            ctx.drawImage(canvas, 0, 0);

            // Carimbo de Data Néos Original
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            ctx.filter = 'none';
            ctx.font = `bold ${Math.floor(canvas.width * 0.03)}px Courier, monospace`;
            ctx.fillStyle = '#f59e0b';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 10;
            ctx.fillText(dateStr, canvas.width * 0.72, canvas.height * 0.94);
            
            ctx.restore();
            
            const dataUrl = canvas.toDataURL('image/jpeg', 1.0); // Qualidade máxima 100%
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
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white animate-pulse"></div>}

            {/* Viewfinder HD Container */}
            <div className="flex-grow relative flex items-center justify-center bg-[#050505] pt-4 px-4 pb-2">
                <div className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/10 transition-all duration-500 shadow-[0_0_100px_rgba(0,0,0,0.5)] ${
                    aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : 
                    aspectRatio === '1:1' ? 'aspect-square w-full' : 'w-full h-full'
                }`}>
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover transition-transform duration-300"
                        style={{ 
                            filter: selectedCamera.filter, 
                            transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'} scale(${zoom})`,
                            imageRendering: 'auto'
                        }}
                    />
                    
                    {/* UI do Viewfinder overlay */}
                    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                         <div className="flex justify-between items-start opacity-60">
                             <div className="text-[10px] font-mono leading-tight">ISO 800<br/>F 1.8<br/>HD_HDR</div>
                             <div className="text-[10px] font-mono text-right leading-tight">AF-C<br/>3840x2160<br/>60 FPS</div>
                         </div>
                         
                         {countdown !== null && (
                             <div className="absolute inset-0 flex items-center justify-center">
                                 <span className="text-8xl font-black italic animate-ping text-white/80">{countdown}</span>
                             </div>
                         )}

                         {/* Zoom Selector Functional */}
                         <div className="flex flex-col items-center gap-1 mb-8">
                             <div className="flex gap-4 bg-black/50 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                                 {[1, 1.5, 2, 3].map(z => (
                                     <button 
                                        key={z} 
                                        onClick={() => setZoom(z)}
                                        className={`text-[10px] font-black w-8 h-8 rounded-full transition-all active:scale-90 ${zoom === z ? 'bg-white text-black' : 'text-white/40'}`}
                                     >
                                         {z}x
                                     </button>
                                 ))}
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Toolbar Superior Funcional */}
            <div className="flex justify-around items-center px-6 py-4 bg-black/90 backdrop-blur-md">
                <button onClick={() => setFlash(!flash)} className={`p-3 rounded-2xl transition-all active:scale-90 ${flash ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(250,204,21,0.4)]' : 'bg-white/5 text-white/80'}`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </button>
                <button onClick={() => setTimer(prev => prev === 0 ? 3 : prev === 3 ? 10 : 0)} className={`p-3 rounded-2xl transition-all active:scale-90 ${timer > 0 ? 'bg-sky-500 text-white shadow-[0_0_20px_rgba(14,165,233,0.4)]' : 'bg-white/5 text-white/80'}`}>
                    <div className="relative">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {timer > 0 && <span className="absolute -top-1 -right-1 bg-white text-black text-[8px] px-1 rounded-full font-black">{timer}s</span>}
                    </div>
                </button>
                <button onClick={() => setAspectRatio(prev => prev === '3:4' ? '1:1' : prev === '1:1' ? 'full' : '3:4')} className="bg-white/10 px-4 py-2 rounded-xl text-[11px] font-black border border-white/10 active:scale-95 transition-all">
                    {aspectRatio.toUpperCase()}
                </button>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="p-3 bg-white/5 rounded-2xl active:scale-90 transition-all text-white/80">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={onClose} className="p-3 bg-red-500/10 text-red-500 rounded-2xl active:scale-90 transition-all">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            {/* Camera Model Carousel (Kapi Core) */}
            <div className="bg-[#0a0a0a] py-6 border-t border-white/5 shadow-inner">
                <div className="flex gap-6 overflow-x-auto px-10 no-scrollbar items-center">
                    {CAMERA_MODELS.map((cam) => (
                        <button 
                            key={cam.id} 
                            onClick={() => setSelectedCamera(cam)}
                            className={`flex flex-col items-center shrink-0 gap-3 transition-all duration-500 ${selectedCamera.id === cam.id ? 'scale-110 opacity-100' : 'opacity-30 blur-[0.5px]'}`}
                        >
                            <div className="relative">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border-2 ${selectedCamera.id === cam.id ? 'border-sky-500 ring-4 ring-sky-500/20' : 'border-white/10'}`}>
                                    {cam.icon}
                                </div>
                                {cam.isPremium && (
                                    <div className="absolute -top-2 -right-2 text-[8px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-black shadow-lg">PRO</div>
                                )}
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${selectedCamera.id === cam.id ? 'text-sky-500' : 'text-zinc-500'}`}>{cam.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom Navigation & Shutter */}
            <footer className="bg-black pt-4 pb-12 px-8">
                <div className="flex justify-center gap-10 mb-8">
                    {(['Vídeo', 'Foto', 'Live'] as CamMode[]).map(m => (
                        <button 
                            key={m} 
                            onClick={() => setActiveMode(m)}
                            className={`text-[11px] font-black uppercase tracking-[0.3em] transition-all relative ${activeMode === m ? 'text-white' : 'text-zinc-700'}`}
                        >
                            {m}
                            {activeMode === m && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-sky-500 rounded-full"></div>}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shadow-2xl active:scale-95 transition-all cursor-pointer">
                        {capturedMedia.length > 0 && <img src={capturedMedia[0]} className="w-full h-full object-cover animate-fade-in" />}
                    </div>
                    
                    <button 
                        onClick={handleCaptureClick}
                        className="w-24 h-24 rounded-full border-[6px] border-white/20 p-2 flex items-center justify-center active:scale-90 transition-all shadow-[0_0_50px_rgba(255,255,255,0.05)] relative group"
                    >
                        <div className="w-full h-full rounded-full bg-white shadow-inner flex items-center justify-center group-hover:scale-95 transition-transform">
                            {activeMode === 'Foto' ? (
                                <div className="w-16 h-16 rounded-full border-2 border-black/5"></div>
                            ) : (
                                <div className="w-8 h-8 bg-red-600 rounded-lg animate-pulse"></div>
                            )}
                        </div>
                    </button>

                    <button className="w-14 h-14 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center active:scale-95 transition-all text-white/50">
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                </div>
            </footer>

            <canvas ref={canvasRef} className="hidden" />

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;
