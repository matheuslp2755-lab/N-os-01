import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Button from '../../common/Button';
import heic2any from 'heic2any';

interface GalleryImage {
    file: File | Blob;
    preview: string;
}

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImagesSelected: (images: GalleryImage[]) => void;
}

const processImagePipeline = async (file: File): Promise<GalleryImage> => {
    let finalFile: File | Blob = file;

    // 1. DETECÇÃO E CONVERSÃO OBRIGATÓRIA DE HEIC
    if (file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic")) {
        console.log("Pipeline: Convertendo HEIC...");
        try {
            const converted = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            });
            const blob = Array.isArray(converted) ? converted[0] : converted;
            finalFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
        } catch (e) {
            console.error("Pipeline: Falha na conversão HEIC:", e);
        }
    }

    // 2. NORMALIZAÇÃO VIA CANVAS (Resize e Redução de Peso)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;

                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height *= maxDim / width;
                        width = maxDim;
                    } else {
                        width *= maxDim / height;
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('ctx null');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const preview = URL.createObjectURL(blob);
                        resolve({ file: blob, preview });
                    } else {
                        reject('blob null');
                    }
                }, 'image/jpeg', 0.85);
            };
            img.onerror = (err) => reject(err);
            img.src = e.target?.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(finalFile);
    });
};

const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose, onImagesSelected }) => {
    const { t } = useLanguage();
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const [selectedImages, setSelectedImages] = useState<GalleryImage[]>([]);
    const [activeTab, setActiveTab] = useState<'gallery' | 'camera'>('gallery');
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [isProcessing, setIsProcessing] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!isOpen) {
            galleryImages.forEach(img => {
                if (img.preview.startsWith('blob:')) URL.revokeObjectURL(img.preview);
            });
            setGalleryImages([]);
            setSelectedImages([]);
            setActiveTab('gallery');
            setIsProcessing(false);
            stopCamera();
        }
    }, [isOpen]);

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
    };

    const startCamera = async () => {
        stopCamera();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } } 
            });
            setCameraStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera access error:", err);
        }
    };

    useEffect(() => {
        if (activeTab === 'camera' && isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
    }, [activeTab, isOpen, facingMode]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsProcessing(true);
            const files = Array.from(e.target.files);
            
            try {
                const processed = await Promise.all(files.map(async (file: File) => {
                    console.log("Processando imagem:", file.name, file.type);
                    if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith(".heic")) {
                        return await processImagePipeline(file);
                    }
                    // Fallback para outros tipos (ex: vídeo)
                    const url = URL.createObjectURL(file);
                    return { file, preview: url };
                }));

                setGalleryImages(prev => [...processed, ...prev]);
                if (selectedImages.length === 0) {
                    setSelectedImages([processed[0]]);
                }
            } catch (err) {
                console.error("Processing error", err);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            canvas.toBlob((blob) => {
                if (blob) {
                    const preview = URL.createObjectURL(blob);
                    const newImage = { file: blob, preview };
                    setGalleryImages(prev => [newImage, ...prev]);
                    setSelectedImages(prev => prev.length < 20 ? [...prev, newImage] : prev);
                    setActiveTab('gallery');
                }
            }, 'image/jpeg', 0.9);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white dark:bg-black z-[60] flex flex-col animate-fade-in">
            <header className="flex-shrink-0 flex items-center justify-between p-4 border-b dark:border-zinc-800">
                <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h2 className="text-sm font-black uppercase tracking-widest">
                    {isProcessing ? 'Processando...' : `${t('gallery.title')} (${selectedImages.length}/20)`}
                </h2>
                <Button onClick={() => onImagesSelected(selectedImages)} disabled={selectedImages.length === 0 || isProcessing} className="!w-auto !py-1.5 !px-5 !text-[10px] font-black !rounded-full">
                    {t('gallery.next')}
                </Button>
            </header>
            
            <div className="flex-grow flex flex-col overflow-hidden">
                {activeTab === 'gallery' ? (
                    <div className="w-full aspect-square bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                        {selectedImages.length > 0 ? (
                            <img src={selectedImages[selectedImages.length - 1].preview} className="max-h-full max-w-full object-contain" alt="Preview" />
                        ) : (
                            <div className="text-center p-8 opacity-30">
                                <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                        )}
                        {isProcessing && (
                            <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center z-10">
                                <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative flex-grow bg-black">
                        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${facingMode === 'user' ? 'mirrored' : ''}`} style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : {}} />
                        <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-12 z-20">
                            <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="p-5 bg-zinc-800/80 backdrop-blur-md rounded-full text-white">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                            <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center shadow-2xl active:scale-90 transition-all">
                                <div className="w-16 h-16 bg-white rounded-full"></div>
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex justify-around border-t border-b dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <button onClick={() => setActiveTab('gallery')} className={`w-full py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'gallery' ? 'text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white' : 'text-zinc-400'}`}>{t('gallery.galleryTab')}</button>
                    <button onClick={() => setActiveTab('camera')} className={`w-full py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'camera' ? 'text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white' : 'text-zinc-400'}`}>{t('gallery.cameraTab')}</button>
                </div>

                {activeTab === 'gallery' && (
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-0.5 p-0.5 no-scrollbar">
                        <div onClick={() => fileInputRef.current?.click()} className="aspect-square bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-200 transition-colors group">
                            <svg className="w-8 h-8 text-zinc-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>
                        </div>
                        {galleryImages.map((img, i) => (
                            <div key={i} onClick={() => setSelectedImages(prev => prev.some(s => s.preview === img.preview) ? prev.filter(s => s.preview !== img.preview) : prev.length < 20 ? [...prev, img] : prev)} className="relative aspect-square cursor-pointer overflow-hidden animate-fade-in">
                                <img src={img.preview} className="w-full h-full object-cover" alt="" />
                                {selectedImages.some(s => s.preview === img.preview) && (
                                    <div className="absolute top-2 right-2 w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-lg">
                                        {selectedImages.findIndex(s => s.preview === img.preview) + 1}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*" multiple />
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default GalleryModal;