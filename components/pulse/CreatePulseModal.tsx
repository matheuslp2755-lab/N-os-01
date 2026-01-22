
import React, { useState, useRef, useEffect } from 'react';
import { auth, db, storage, addDoc, collection, serverTimestamp, storageRef, getDownloadURL, uploadBytes } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import AddMusicModal from '../post/AddMusicModal';
import heic2any from 'heic2any';

const FILTERS = [
    { name: 'Normal', filter: 'none' },
    { name: 'Dream', filter: 'contrast(1.1) saturate(1.2) brightness(1.05) hue-rotate(-5deg)' },
    { name: 'Moon', filter: 'grayscale(1) contrast(1.1) brightness(1.1)' },
    { name: 'Warm', filter: 'sepia(0.3) saturate(1.3) contrast(1.05)' }
];

type MusicInfo = {
  nome: string;
  artista: string;
  capa: string;
  preview: string;
  startTime?: number;
  position?: { x: number; y: number };
  hideCover?: boolean;
};

interface CreatePulseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPulseCreated: () => void;
}

const processPulseImage = async (file: File): Promise<{ file: Blob, preview: string }> => {
    let finalFile: File | Blob = file;

    if (file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic")) {
        try {
            const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
            finalFile = Array.isArray(converted) ? converted[0] : converted;
        } catch (e) { console.warn("HEIC failure", e); }
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // USA RESOLUÇÃO REAL DA IMAGEM
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('ctx null');
                ctx.drawImage(img, 0, 0, img.width, img.height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const preview = URL.createObjectURL(blob);
                        resolve({ file: blob, preview });
                    } else reject('blob null');
                }, 'image/jpeg', 0.98);
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(finalFile);
    });
};

const CreatePulseModal: React.FC<CreatePulseModalProps> = ({ isOpen, onClose, onPulseCreated }) => {
    const { t } = useLanguage();
    const [mediaFile, setMediaFile] = useState<File | Blob | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [filterIndex, setFilterIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [selectedMusic, setSelectedMusic] = useState<MusicInfo | null>(null);
    const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
    const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
    
    const [stickerPos, setStickerPos] = useState({ x: 50, y: 50 });
    const [isDragging, setIsDragging] = useState(false);
    const [hideMusicCover, setHideMusicCover] = useState(false);

    const [isUsingCamera, setIsUsingCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
    };

    const startCamera = async () => {
        stopCamera();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: facingMode, 
                    width: { ideal: 3840 }, 
                    height: { ideal: 2160 } 
                },
                audio: false 
            });
            setCameraStream(stream);
            if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        } catch (err) { setError("Não foi possível acessar sua câmera."); }
    };

    useEffect(() => {
        if (isUsingCamera && isOpen) startCamera(); else stopCamera();
        return () => stopCamera();
    }, [isUsingCamera, isOpen, facingMode]);

    useEffect(() => {
        if (!isOpen) { 
            if (mediaPreview && mediaPreview.startsWith('blob:')) URL.revokeObjectURL(mediaPreview);
            setMediaFile(null); setMediaPreview(null); setError(''); setIsUsingCamera(false); setSelectedMusic(null); setHideMusicCover(false); setStickerPos({ x: 50, y: 50 }); setIsProcessing(false);
        }
    }, [isOpen]);

    const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError('');
        setIsProcessing(true);
        
        try {
            if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith(".heic")) {
                const result = await processPulseImage(file);
                setMediaFile(result.file);
                setMediaPreview(result.preview);
            } else {
                const url = URL.createObjectURL(file);
                setMediaFile(file);
                setMediaPreview(url);
            }
        } catch (err) {
            setError("Erro ao processar arquivo.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCapture = () => {
        const video = videoPreviewRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        
        // USA RESOLUÇÃO NATIVA
        canvas.width = video.videoWidth; 
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            canvas.toBlob((blob) => {
                if (blob) { 
                    const preview = URL.createObjectURL(blob);
                    setMediaFile(blob); 
                    setMediaPreview(preview); 
                    setIsUsingCamera(false); 
                }
            }, 'image/jpeg', 0.98);
        }
    };

    const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = (clientX / window.innerWidth) * 100;
        const y = (clientY / window.innerHeight) * 100;
        setStickerPos({ x, y });
    };

    const handleSubmit = async () => {
        if (!mediaFile || submitting) return;
        setSubmitting(true);
        try {
            const fileName = `pulse-pro-${Date.now()}.jpg`;
            const path = `pulses/${auth.currentUser?.uid}/${fileName}`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, mediaFile, { contentType: mediaFile.type || 'image/jpeg' });
            const url = await getDownloadURL(ref);

            await addDoc(collection(db, 'pulses'), {
                authorId: auth.currentUser?.uid,
                mediaUrl: url,
                filter: FILTERS[filterIndex].filter,
                createdAt: serverTimestamp(),
                weather: weather,
                musicInfo: selectedMusic ? { ...selectedMusic, position: stickerPos, hideCover: hideMusicCover } : null
            });
            onPulseCreated(); onClose();
        } catch (err) { setError("Falha ao publicar."); } finally { setSubmitting(false); }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[70] flex flex-col animate-fade-in overflow-hidden touch-none" onMouseMove={handleDragMove} onTouchMove={handleDragMove} onMouseUp={() => setIsDragging(false)} onTouchEnd={() => setIsDragging(false)}>
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[80] bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={onClose} className="text-white text-4xl font-light active:scale-90">&times;</button>
                <div className="flex gap-4">
                    {mediaPreview && (
                        <>
                            <button onClick={() => setIsMusicModalOpen(true)} className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/20 text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></button>
                        </>
                    )}
                    {mediaPreview && (
                        <Button onClick={handleSubmit} disabled={submitting || isProcessing} className="!w-auto !py-2 !px-8 !bg-white !text-black !rounded-full font-black uppercase text-[10px]">
                            {submitting ? '...' : 'Publicar'}
                        </Button>
                    )}
                </div>
            </header>

            <div className="flex-grow relative flex items-center justify-center bg-zinc-950">
                {isProcessing && (
                    <div className="absolute inset-0 z-[90] bg-black/60 flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
                {isUsingCamera ? (
                    <div className="relative w-full h-full">
                        <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : {}} />
                        <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-12">
                            <button onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')} className="p-5 bg-zinc-800/80 rounded-full text-white"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                            <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"><div className="w-16 h-16 bg-white rounded-full"></div></button>
                            <button onClick={() => setIsUsingCamera(false)} className="p-5 bg-zinc-800/80 rounded-full text-white">&times;</button>
                        </div>
                    </div>
                ) : mediaPreview ? (
                    <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
                        <img src={mediaPreview} className="w-full h-full object-contain" style={{ filter: FILTERS[filterIndex].filter }} />
                        
                        {selectedMusic && !hideMusicCover && (
                            <div 
                                className="absolute z-50 cursor-grab active:cursor-grabbing p-4"
                                style={{ left: `${stickerPos.x}%`, top: `${stickerPos.y}%`, transform: 'translate(-50%, -50%)' }}
                                onMouseDown={() => setIsDragging(true)}
                                onTouchStart={() => setIsDragging(true)}
                            >
                                <div className="bg-white/20 backdrop-blur-xl border border-white/30 rounded-3xl p-4 flex flex-col items-center gap-2 shadow-2xl animate-fade-in w-32">
                                    <img src={selectedMusic.capa} className="w-20 h-20 rounded-2xl shadow-xl rotate-2" />
                                    <p className="text-white font-black text-[9px] uppercase truncate w-full text-center">{selectedMusic.nome}</p>
                                </div>
                            </div>
                        )}

                        <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3 px-4 py-4">
                            {FILTERS.map((f, i) => (
                                <button key={i} onClick={() => setFilterIndex(i)} className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest ${filterIndex === i ? 'bg-white text-black' : 'bg-black/40 text-white/60'}`}>{f.name}</button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-10 text-center text-white">
                        <div className="flex gap-8">
                            <div onClick={() => setIsUsingCamera(true)} className="flex flex-col items-center cursor-pointer">
                                <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 border-2 border-dashed border-white/20 flex items-center justify-center hover:border-white transition-all"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg></div>
                                <p className="text-[10px] font-black uppercase mt-2">Câmera</p>
                            </div>
                            <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center cursor-pointer">
                                <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 border-2 border-dashed border-white/20 flex items-center justify-center hover:border-white transition-all"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                <p className="text-[10px] font-black uppercase mt-2">Galeria</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <input type="file" ref={fileInputRef} onChange={handleMediaChange} className="hidden" accept="image/*,video/*" />
            <canvas ref={canvasRef} className="hidden" />

            <AddMusicModal isOpen={isMusicModalOpen} onClose={() => setIsMusicModalOpen(false)} postId="" onMusicAdded={(m) => { setSelectedMusic(m); setIsMusicModalOpen(false); }} isProfileModal={true} />
        </div>
    );
};

export default CreatePulseModal;
