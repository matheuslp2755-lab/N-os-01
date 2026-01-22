
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
    filterCSS: string;
}

const PRESETS: Preset[] = [
    { id: 'dazz', name: 'DAZZ', filterCSS: 'brightness(0.99) contrast(0.90) saturate(0.92) sepia(0.06)' },
    { id: 'grf', name: 'GRF 2016', filterCSS: 'brightness(0.92) contrast(0.82) saturate(0.85) sepia(0.06)' },
    { id: 'huji', name: 'HUJI 98', filterCSS: 'brightness(0.95) contrast(0.9) saturate(0.92) sepia(0.12)' },
];

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [activePreset, setActivePreset] = useState<Preset>(PRESETS[0]);
    const [zoom, setZoom] = useState(1);
    const [exposure, setExposure] = useState(1); 
    const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '9:16'>('3:4');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedMedia, setCapturedMedia] = useState<string[]>([]);
    const [focusUI, setFocusUI] = useState<{ x: number, y: number } | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 4096 }, height: { ideal: 2160 } }
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.filter = `${activePreset.filterCSS} brightness(${exposure})`;
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0);
            ctx.restore();
            setCapturedMedia(prev => [canvas.toDataURL('image/jpeg', 0.98), ...prev]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[600] flex flex-col text-white font-sans overflow-hidden">
            <div className="flex-grow relative flex items-center justify-center bg-black p-4">
                <div onClick={(e) => setFocusUI({ x: e.clientX, y: e.clientY })} className={`relative overflow-hidden rounded-[2.5rem] bg-zinc-900 border border-white/10 ${aspectRatio === '3:4' ? 'aspect-[3/4] w-full' : aspectRatio === '1:1' ? 'aspect-square w-full' : 'aspect-[9/16] h-full'}`}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ filter: `${activePreset.filterCSS} brightness(${exposure})`, transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'} scale(${zoom})` }} />
                    <div className="absolute top-6 left-6 text-[10px] font-mono uppercase opacity-50">HD_RAW • {zoom}x</div>
                </div>
            </div>

            <div className="flex flex-col gap-6 p-6 bg-black">
                <div className="flex justify-center gap-4">
                    {[1, 1.5, 2, 4].map(z => (
                        <button key={z} onClick={() => setZoom(z)} className={`w-10 h-10 rounded-full border border-white/10 text-[10px] font-black ${zoom === z ? 'bg-white text-black' : 'bg-zinc-900'}`}>{z}x</button>
                    ))}
                </div>
                
                <div className="flex justify-around items-center">
                    <button onClick={() => setAspectRatio(prev => prev === '3:4' ? '1:1' : prev === '1:1' ? '9:16' : '3:4')} className="p-3 bg-zinc-900 rounded-2xl text-[10px] font-black">{aspectRatio}</button>
                    <button onClick={handleCapture} className="w-20 h-20 bg-white rounded-full p-2"><div className="w-full h-full rounded-full border-4 border-black"></div></button>
                    <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="p-3 bg-zinc-900 rounded-2xl"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                </div>
                
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6">
                    {PRESETS.map(p => (
                        <button key={p.id} onClick={() => setActivePreset(p)} className={`px-6 py-2 rounded-full text-[10px] font-black border transition-all ${activePreset.id === p.id ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-500'}`}>{p.name}</button>
                    ))}
                </div>
                <button onClick={onClose} className="py-4 text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Fechar</button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default ParadiseCameraModal;
