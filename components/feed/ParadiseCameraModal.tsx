import React, { useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, storage, storageRef, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } from '../../firebase';
import Button from '../common/Button';

interface ParadiseCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type VibeEffect = 
    | 'soft_girl' 
    | 'clean_beauty' 
    | 'barbie_glow' 
    | 'tumblr_girl' 
    | 'glow_night' 
    | 'elegant' 
    | 'sad_girl';

type LensMM = 24 | 35 | 50 | 85 | 101;

interface EffectConfig {
    id: VibeEffect;
    name: string;
    label: string;
    grain: number;
    blur: number;
    temp: number;
    glow: number;
    saturation: number;
    contrast: number;
    exposure: number;
    sharpness: number;
    vignette: number;
    fade: number;
    skinSoft: number;
    magenta?: number;
    haze?: boolean;
    retroDate?: boolean;
}

const PRESETS: Record<VibeEffect, EffectConfig> = {
    soft_girl: { id: 'soft_girl', name: 'Soft Girl', label: '🌸', grain: 0, blur: 0.1, temp: 5, magenta: 4, glow: 0.3, saturation: 0.95, contrast: 0.85, exposure: 1.15, sharpness: 0.9, vignette: 0.1, fade: 10, skinSoft: 0.8 },
    clean_beauty: { id: 'clean_beauty', name: 'Clean Beauty', label: '💄', grain: 0, blur: 0, temp: 0, magenta: 0, glow: 0.1, saturation: 1.05, contrast: 1.05, exposure: 1.1, sharpness: 1.1, vignette: 0.05, fade: 0, skinSoft: 0.5 },
    barbie_glow: { id: 'barbie_glow', name: 'Barbie Glow', label: '💗', grain: 0, blur: 0.2, temp: 8, magenta: 8, glow: 0.6, saturation: 1.1, contrast: 0.9, exposure: 1.25, sharpness: 0.75, vignette: 0.2, fade: 5, skinSoft: 0.9 },
    tumblr_girl: { id: 'tumblr_girl', name: 'Tumblr Girl', label: '📸', grain: 0.2, blur: 0.3, temp: -10, magenta: 0, glow: 0, saturation: 0.9, contrast: 0.9, exposure: 0.9, sharpness: 0.9, vignette: 0.3, fade: 30, skinSoft: 0, retroDate: true },
    glow_night: { id: 'glow_night', name: 'Glow Night', label: '✨', grain: 0.1, blur: 0, temp: 4, magenta: 2, glow: 0.45, saturation: 1.08, contrast: 1.1, exposure: 1.15, sharpness: 1.2, vignette: 0.2, fade: 0, skinSoft: 0.4 },
    elegant: { id: 'elegant', name: 'Elegant', label: '💍', grain: 0, blur: 0, temp: -5, magenta: 0, glow: 0, saturation: 0.95, contrast: 1.2, exposure: 1.05, sharpness: 1.25, vignette: 0.15, fade: 5, skinSoft: 0.3 },
    sad_girl: { id: 'sad_girl', name: 'Sad Girl', label: '🌙', grain: 0.3, blur: 0.2, temp: -15, magenta: -2, glow: 0, saturation: 0.8, contrast: 0.8, exposure: 0.7, sharpness: 1.0, vignette: 0.5, fade: 15, skinSoft: 0, haze: true }
};

const ParadiseCameraModal: React.FC<ParadiseCameraModalProps> = ({ isOpen, onClose }) => {
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [activeVibe, setActiveVibe] = useState<VibeEffect>('soft_girl');
    const [lensMM, setLensMM] = useState<LensMM>(35);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [viewingGallery, setViewingGallery] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showFlashAnim, setShowFlashAnim] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef<number | null>(null);

    const getZoomFactor = (mm: LensMM) => ({ 24: 1.0, 35: 1.3, 50: 1.8, 85: 2.6, 101: 3.2 }[mm]);

    const applyQualityPipeline = (ctx: CanvasRenderingContext2D, w: number, h: number, config: EffectConfig, isFinal: boolean) => {
        if (config.skinSoft > 0) {
            ctx.save();
            ctx.globalAlpha = config.skinSoft * 0.3;
            ctx.filter = `blur(${Math.round(w * 0.005)}px)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        const hue = config.temp + (config.magenta || 0);
        ctx.filter = `brightness(${config.exposure}) contrast(${config.contrast}) saturate(${config.saturation}) hue-rotate(${hue}deg)`;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        if(tCtx) {
            tCtx.drawImage(ctx.canvas, 0, 0);
            ctx.filter = 'none';
            ctx.drawImage(tempCanvas, 0, 0);
        }

        if (config.glow > 0) {
            ctx.save();
            ctx.globalAlpha = config.glow * 0.4;
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = `blur(${Math.round(w * 0.03)}px)`;
            ctx.drawImage(ctx.canvas, 0, 0);
            ctx.restore();
        }

        if (isFinal) {
            ctx.save();
            if (config.retroDate) {
                const now = new Date();
                const dateStr = `'${now.getFullYear().toString().slice(-2)} ${ (now.getMonth() + 1).toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}`;
                ctx.font = `bold ${Math.round(h * 0.04)}px monospace`;
                ctx.fillStyle = '#facc15';
                ctx.fillText(dateStr, w * 0.05, h - h * 0.05);
            }
            ctx.restore();
        }

        if (config.vignette > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, `rgba(0,0,0,${config.vignette})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
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
            
            const vw = canvas.width;
            const vh = canvas.height;

            ctx.save();
            if (facingMode === 'user') {
                ctx.translate(vw, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();

            applyQualityPipeline(ctx, vw, vh, PRESETS[activeVibe], false);
        }
        requestRef.current = requestAnimationFrame(renderLoop);
    }, [facingMode, activeVibe]);

    const startCamera = useCallback(async () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                requestRef.current = requestAnimationFrame(renderLoop);
            }
        } catch (err) {
            setCameraError("Acesso à câmera negado.");
        }
    }, [facingMode, renderLoop]);

    useEffect(() => {
        if (isOpen) startCamera();
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isOpen, startCamera]);

    const executeCapture = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setShowFlashAnim(true);
        setTimeout(() => setShowFlashAnim(false), 80);

        const zoom = getZoomFactor(lensMM);
        const vw = canvas.width;
        const vh = canvas.height;
        const outW = vw / zoom;
        const outH = vh / zoom;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = outW; outCanvas.height = outH;
        const oCtx = outCanvas.getContext('2d');
        if(oCtx) {
            oCtx.drawImage(canvas, (vw-outW)/2, (vh-outH)/2, outW, outH, 0, 0, outW, outH);
            applyQualityPipeline(oCtx, outW, outH, PRESETS[activeVibe], true);
        }

        setCapturedImages(prev => [outCanvas.toDataURL('image/jpeg', 0.95), ...prev]);
    };

    const handleDelete = (index: number) => {
        if (window.confirm("Deseja excluir esta foto?")) {
            setCapturedImages(prev => prev.filter((_, i) => i !== index));
            setFullscreenImage(null);
        }
    };

    const handleSaveLocal = async (dataUrl: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Paradise_${Date.now()}.jpg`;
        link.click();
        alert("Salvo na galeria do dispositivo!");
    };

    const handleSaveToPost = async (dataUrl: string) => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const fileRef = storageRef(storage, `paradise/${auth.currentUser?.uid}/${Date.now()}.jpg`);
            await uploadBytes(fileRef, blob);
            const url = await getDownloadURL(fileRef);

            await addDoc(collection(db, 'posts'), {
                userId: auth.currentUser?.uid,
                username: auth.currentUser?.displayName,
                userAvatar: auth.currentUser?.photoURL,
                imageUrl: url,
                media: [{ url, type: 'image' }],
                caption: `📸 Capturado via Câmera do Paraíso (${lensMM}mm)`,
                likes: [],
                timestamp: serverTimestamp()
            });
            alert("Postado com sucesso!");
            setFullscreenImage(null);
            setViewingGallery(false);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const applyEditCrop = () => {
        if (fullscreenImage === null) return;
        const imgData = capturedImages[fullscreenImage];
        const img = new Image();
        img.src = imgData;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = Math.min(img.width, img.height);
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size);
                const croppedData = canvas.toDataURL('image/jpeg', 0.95);
                setCapturedImages(prev => prev.map((item, i) => i === fullscreenImage ? croppedData : item));
                setIsEditing(false);
            }
        };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-black flex flex-col overflow-hidden touch-none h-[100dvh] text-white">
            {showFlashAnim && <div className="fixed inset-0 bg-white z-[1000] animate-pulse"></div>}

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <button onClick={onClose} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10 text-xl">&times;</button>
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                    {([24, 35, 50, 85] as LensMM[]).map(mm => (
                        <button key={mm} onClick={() => setLensMM(mm)} className={`text-[10px] font-black ${lensMM === mm ? 'text-sky-400' : 'text-white/40'}`}>{mm}mm</button>
                    ))}
                </div>
                <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/10">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2}/></svg>
                </button>
            </header>

            <div className="flex-grow relative bg-zinc-950 flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" playsInline muted />
                <canvas ref={canvasRef} className="w-full h-full object-cover" />
                
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div 
                        className="border border-white/20 rounded-3xl shadow-[0_0_0_1000px_rgba(0,0,0,0.4)]"
                        style={{ width: `${100/getZoomFactor(lensMM)}%`, aspectRatio: '3/4' }}
                    ></div>
                </div>
            </div>

            <footer className="bg-black px-4 pb-12 pt-6 border-t border-white/5 z-50">
                <div className="flex flex-col gap-6">
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
                        {Object.values(PRESETS).map(eff => (
                            <button 
                                key={eff.id} 
                                onClick={() => setActiveVibe(eff.id)}
                                className={`flex flex-col items-center shrink-0 transition-all ${activeVibe === eff.id ? 'scale-110 opacity-100' : 'opacity-30'}`}
                            >
                                <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-xl border border-white/10">{eff.label}</div>
                                <span className="text-[8px] font-black uppercase mt-2">{eff.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between px-8">
                        <button onClick={() => setViewingGallery(true)} className="w-14 h-14 rounded-xl bg-zinc-900 border-2 border-white/20 overflow-hidden active:scale-95 transition-all">
                            {capturedImages.length > 0 ? <img src={capturedImages[0]} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500 font-black">0</div>}
                        </button>

                        <button onClick={executeCapture} className="w-20 h-20 rounded-full border-4 border-white/20 p-1 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                            <div className="w-full h-full rounded-full bg-white"></div>
                        </button>

                        <div className="w-14"></div>
                    </div>
                </div>
            </footer>

            {viewingGallery && (
                <div className="fixed inset-0 z-[700] bg-black flex flex-col animate-fade-in">
                    <header className="p-6 flex justify-between items-center border-b border-white/10 bg-black/80 backdrop-blur-md">
                        <button onClick={() => setViewingGallery(false)} className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Voltar</button>
                        <h3 className="font-black uppercase tracking-[0.2em] text-xs">Galeria do Paraíso</h3>
                        <div className="w-10"></div>
                    </header>
                    <div className="flex-grow overflow-y-auto grid grid-cols-3 gap-1 p-1 no-scrollbar">
                        {capturedImages.map((img, i) => (
                            <div key={i} onClick={() => setFullscreenImage(i)} className="aspect-[3/4] relative cursor-pointer group">
                                <img src={img} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        ))}
                        {capturedImages.length === 0 && (
                            <div className="col-span-3 py-20 text-center opacity-20">
                                <p className="text-xs font-black uppercase">Nenhuma foto ainda</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {fullscreenImage !== null && (
                <div className="fixed inset-0 z-[800] bg-black flex flex-col animate-fade-in">
                    <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-[810] bg-gradient-to-b from-black/80 to-transparent">
                        <button onClick={() => { setFullscreenImage(null); setIsEditing(false); }} className="p-2"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2.5}/></svg></button>
                        <div className="flex gap-4">
                            <button onClick={() => setIsEditing(!isEditing)} className={`p-2 rounded-xl border ${isEditing ? 'bg-sky-500 border-sky-400' : 'bg-black/40 border-white/10'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M14.121 14.121L19 19m-7-7l7 7m-7-7l-2.828 2.828.707.707L10.586 15z" strokeWidth={2}/><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg></button>
                            <button onClick={() => handleDelete(fullscreenImage!)} className="p-2 bg-black/40 border border-white/10 rounded-xl text-red-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg></button>
                        </div>
                    </header>

                    <div className="flex-grow flex items-center justify-center relative bg-black">
                        <img src={capturedImages[fullscreenImage]} className={`max-h-full max-w-full object-contain ${isEditing ? 'opacity-50' : ''}`} />
                        {isEditing && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-72 h-72 border-2 border-white border-dashed rounded-3xl animate-pulse"></div>
                                <div className="absolute bottom-32 pointer-events-auto">
                                    <button onClick={applyEditCrop} className="bg-sky-500 px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-xl">Recortar 1:1</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {!isEditing && (
                        <footer className="absolute bottom-0 left-0 right-0 p-8 flex gap-4 bg-gradient-to-t from-black/80 to-transparent z-[810]">
                            <button onClick={() => handleSaveLocal(capturedImages[fullscreenImage!])} className="flex-1 py-4 bg-zinc-800 rounded-3xl font-black text-[10px] uppercase tracking-widest">Salvar no Celular</button>
                            <button 
                                onClick={() => handleSaveToPost(capturedImages[fullscreenImage!])}
                                disabled={isSaving}
                                className="flex-1 py-4 bg-white text-black rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                            >
                                {isSaving ? "Postando..." : "Postar no Néos"}
                            </button>
                        </footer>
                    )}
                </div>
            )}
        </div>
    );
};

export default ParadiseCameraModal;