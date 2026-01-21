
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
    { id: 'reel', name: 'Reel', icon: '📽️', filter: 'contrast(1.1) sepia(0.2) saturate(1.2)' },
    { id: 'mangacore', name: 'MangaCore', icon: '📸', filter: 'grayscale(1) contrast(1.5) brightness(1.2)' },
    { id: 'kodak200', name: 'Kodak 200', icon: '🟡', filter: 'contrast(1.05) saturate(1.1) hue-rotate(-5deg)' },
    { id: 'g7x2', name: 'G7X2', icon: '📷', filter: 'brightness(1.1) contrast(1.1) saturate(1.05)', isPremium: true },
    { id: 'blue3k', name: 'Blue3K', icon: '🔵', filter: 'hue-rotate(190deg) brightness(1.05) saturate(1.2)' },
    { id: 'dcr', name: 'DCR', icon: '📹', filter: 'contrast(0.9) brightness(1.1) saturate(0.8) blur(0.5px)', isPremium: true },
    { id: 'fuji-x', name: 'FUJI-X', icon: '🔴', filter: 'contrast(1.2) saturate(1.3) brightness(1.05)' },
    { id: 'nokia', name: 'NOKIA', icon: '📱', filter: 'pixelate(4) contrast(0.8) brightness(1.2)', isPremium: true },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activeMode, setActiveMode] = useState<CamMode>('Foto');
    const [selectedCamera, setSelectedCamera] = useState<CameraModel>(CAMERA_MODELS[2]); // Kodak 200 default
    const [zoom, setZoom] = useState(1);
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16' | 'full'>('3:4');
    const [flash, setFlash] = useState(false);
    const [timer, setTimer] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [showFlashAnim, setShowFlashAnim] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err) { console.error(err); }
    }, [facingMode]);

    useEffect(() => {
        if (isOpen) startCamera();
        return () => streamRef.current?.getTracks().forEach(t => t.stop());
    }, [isOpen, startCamera]);

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 100);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0);
            
            // Aplicar filtro da câmera selecionada
            ctx.filter = selectedCamera.filter;
            ctx.drawImage(canvas, 0, 0);

            // Carimbo de data estilo Kapi
            const now = new Date();
            const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
            ctx.filter = 'none';
            ctx.font = 'bold 40px Courier, monospace';
            ctx.fillStyle = '#f59e0b';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 5;
            ctx.fillText(dateStr, canvas.width * 0.75, canvas.height * 0.92);
            
            ctx.restore();
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setCapturedMedia(prev => [dataUrl, ...prev]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col overflow-hidden text-white font-sans touch-none select-none">
            {showFlashAnim && <div className="fixed inset-0 z-[1000] bg-white"></div>}

            {/* Viewfinder Container */}
            <div className="flex-grow relative flex items-center justify-center bg-[#050505] pt-4 px-4 pb-2">
                <div className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/5 transition-all duration-300 shadow-2xl ${
                    aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : 
                    aspectRatio === '1:1' ? 'aspect-square w-full' : 'w-full h-full'
                }`}>
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                        style={{ filter: selectedCamera.filter, transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                    />
                    
                    {/* UI do Viewfinder (Kapi Style) */}
                    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                         <div className="flex justify-between items-start opacity-60">
                             <div className="text-[10px] font-mono">ISO 400<br/>F 2.8</div>
                             <div className="text-[10px] font-mono text-right">RAW<br/>4K 60FPS</div>
                         </div>
                         
                         {/* Zoom Selector */}
                         <div className="flex flex-col items-center gap-1 mb-8">
                             <div className="flex gap-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 pointer-events-auto">
                                 {['.5', '1x', '2x', '3x'].map(z => (
                                     <button key={z} className={`text-[10px] font-black w-7 h-7 rounded-full transition-all ${z === '1x' ? 'bg-zinc-800 text-white' : 'text-white/40'}`}>{z}</button>
                                 ))}
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Toolbar Superior (Ícones Kapi) */}
            <div className="flex justify-around items-center px-6 py-4 bg-black">
                <button onClick={() => setFlash(!flash)} className={`p-2 transition-colors ${flash ? 'text-yellow-400' : 'text-white/80'}`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </button>
                <button onClick={() => setTimer(!timer)} className={`p-2 transition-colors ${timer ? 'text-sky-400' : 'text-white/80'}`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
                <button onClick={() => setAspectRatio(prev => prev === '3:4' ? '1:1' : '3:4')} className="bg-white/10 px-3 py-1 rounded-lg text-[10px] font-black border border-white/10">
                    {aspectRatio}
                </button>
                <button className="text-white/80 p-2">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>
                </button>
                <button className="text-white/80 p-2">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
                </button>
            </div>

            {/* Camera Model Carousel (Kapicam Core) */}
            <div className="bg-[#111] py-6 border-t border-white/5">
                <div className="flex gap-6 overflow-x-auto px-10 no-scrollbar items-center">
                    {CAMERA_MODELS.map((cam) => (
                        <button 
                            key={cam.id} 
                            onClick={() => setSelectedCamera(cam)}
                            className={`flex flex-col items-center shrink-0 gap-3 transition-all ${selectedCamera.id === cam.id ? 'scale-110 opacity-100' : 'opacity-40'}`}
                        >
                            <div className="relative">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border-2 ${selectedCamera.id === cam.id ? 'border-sky-500' : 'border-white/10'}`}>
                                    {cam.icon}
                                </div>
                                {cam.isPremium && (
                                    <div className="absolute -top-1.5 -right-1.5 text-[8px] bg-amber-400 text-black px-1 rounded font-black">PRO</div>
                                )}
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${selectedCamera.id === cam.id ? 'text-sky-500' : 'text-zinc-500'}`}>{cam.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom Navigation & Controls */}
            <footer className="bg-black pt-4 pb-12 px-8">
                {/* Modos: Vídeo, Foto, Live */}
                <div className="flex justify-center gap-8 mb-8">
                    {(['Vídeo', 'Foto', 'Live'] as CamMode[]).map(m => (
                        <button 
                            key={m} 
                            onClick={() => setActiveMode(m)}
                            className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeMode === m ? 'text-white' : 'text-zinc-600'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Main Capture Buttons */}
                <div className="flex items-center justify-between">
                    <button className="w-14 h-14 rounded-2xl bg-zinc-900/50 border border-white/10 overflow-hidden shadow-lg active:scale-95 transition-all">
                        {capturedMedia.length > 0 && <img src={capturedMedia[0]} className="w-full h-full object-cover" />}
                    </button>
                    
                    <button 
                        onClick={handleCapture}
                        className="w-24 h-24 rounded-full border-4 border-white/20 p-2 flex items-center justify-center active:scale-90 transition-all shadow-[0_0_50px_rgba(255,255,255,0.05)]"
                    >
                        <div className="w-full h-full rounded-full bg-white shadow-inner flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full border-2 border-black/5"></div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                        className="w-14 h-14 rounded-full bg-zinc-900/50 border border-white/10 flex items-center justify-center active:scale-95 transition-all"
                    >
                        <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </footer>

            {/* Banner Kapi Cam Pro Style */}
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-600/20 p-4 border-t border-white/10 flex items-center justify-between px-8 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-amber-400">Obtenha acesso ilimitado ao Pro</p>
                        <p className="text-[8px] text-white/40 font-bold">R$ 12,99/mês. Cancele a qualquer momento.</p>
                    </div>
                </div>
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" strokeWidth={2.5}/></svg>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
};

export default ParadiseCameraModal;
