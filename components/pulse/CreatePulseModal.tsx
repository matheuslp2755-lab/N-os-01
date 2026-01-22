
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
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [isUsingCamera, setIsUsingCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

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
                video: { facingMode, width: { ideal: 3840 }, height: { ideal: 2160 } }
            });
            setCameraStream(stream);
            if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        } catch (err) { setError("Câmera indisponível."); }
    };

    useEffect(() => {
        if (isUsingCamera && isOpen) startCamera(); else stopCamera();
        return () => stopCamera();
    }, [isUsingCamera, isOpen, facingMode]);

    const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const result = await processPulseImage(file);
            setMediaFile(result.file);
            setMediaPreview(result.preview);
        } catch (err) { setError("Erro ao processar."); } finally { setIsProcessing(false); }
    };

    const handleCapture = () => {
        const video = videoPreviewRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        canvas.width = video.videoWidth; 
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.save();
            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0);
            ctx.restore();
            canvas.toBlob((blob) => {
                if (blob) { 
                    setMediaFile(blob); 
                    setMediaPreview(URL.createObjectURL(blob)); 
                    setIsUsingCamera(false); 
                }
            }, 'image/jpeg', 0.98);
        }
    };

    const handleSubmit = async () => {
        if (!mediaFile || submitting) return;
        const user = auth.currentUser;
        if (!user) return;
        
        setSubmitting(true);
        try {
            const fileName = `pulse-${Date.now()}.jpg`;
            const ref = storageRef(storage, `pulses/${user.uid}/${fileName}`);
            await uploadBytes(ref, mediaFile);
            const url = await getDownloadURL(ref);

            await addDoc(collection(db, 'pulses'), {
                authorId: user.uid,
                mediaUrl: url,
                filter: FILTERS[filterIndex].filter,
                createdAt: serverTimestamp(),
                musicInfo: selectedMusic || null
            });
            
            onPulseCreated(); 
            onClose();
        } catch (err) { 
            console.error(err);
            setError("Falha ao publicar."); 
        } finally { setSubmitting(false); }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[70] flex flex-col animate-fade-in overflow-hidden">
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[80] bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={onClose} className="text-white text-4xl font-light">&times;</button>
                {mediaPreview && (
                    <Button onClick={handleSubmit} disabled={submitting || isProcessing} className="!w-auto !py-2 !px-8 !bg-white !text-black !rounded-full font-black uppercase text-[10px]">
                        {submitting ? 'Postando...' : 'Publicar'}
                    </Button>
                )}
            </header>

            <div className="flex-grow flex items-center justify-center bg-zinc-950">
                {isUsingCamera ? (
                    <div className="relative w-full h-full">
                        <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : {}} />
                        <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-12">
                            <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"><div className="w-16 h-16 bg-white rounded-full"></div></button>
                        </div>
                    </div>
                ) : mediaPreview ? (
                    <img src={mediaPreview} className="w-full h-full object-contain" style={{ filter: FILTERS[filterIndex].filter }} />
                ) : (
                    <div className="flex gap-8">
                        <button onClick={() => setIsUsingCamera(true)} className="p-8 bg-zinc-900 rounded-3xl text-white font-bold">Câmera</button>
                        <button onClick={() => fileInputRef.current?.click()} className="p-8 bg-zinc-900 rounded-3xl text-white font-bold">Galeria</button>
                    </div>
                )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleMediaChange} className="hidden" accept="image/*" />
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default CreatePulseModal;
