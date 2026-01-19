
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, storage, addDoc, collection, serverTimestamp, storageRef, uploadString, getDownloadURL } from '../../firebase';
import Button from '../common/Button';
import { useLanguage } from '../../context/LanguageContext';

interface CrystalData {
    streak: number;
    level: 'BRILHANTE' | 'EQUILIBRADO' | 'APAGADO' | 'RACHADO';
}

interface UserInfo {
    uid?: string;
    photoURL?: string | null;
    id: string;
    username: string;
    avatar: string;
}

interface ConnectionStreakShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  crystalData: CrystalData;
  currentUser: any; // Firebase User type
  otherUser: UserInfo;
  currentUserAvatar: string;
  otherUserAvatar: string;
  onPulseCreated: () => void;
}

const Spinner: React.FC = () => (
    <div className="flex justify-center items-center p-4">
        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const loadImageSafe = async (url: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;

    const getSafeUrl = (u: string) => {
        try {
            let normalizedUrl = u.replace(/firebasestorage\.app/g, 'appspot.com');
            if (normalizedUrl.startsWith('data:')) return normalizedUrl;
            return normalizedUrl;
        } catch (e) {
            return u;
        }
    };

    const createImg = (src: string, isCrossOrigin: boolean): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (isCrossOrigin) {
                img.crossOrigin = "anonymous";
            }
            img.referrerPolicy = "no-referrer";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image`));
            img.src = src;
        });
    };

    const safeUrl = getSafeUrl(url);

    try {
        const response = await fetch(safeUrl);
        if (!response.ok) throw new Error(`Fetch failed`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        return await createImg(objectUrl, false);
    } catch (e: any) {
        // Fallback para crossorigin se o fetch falhar
    }

    try {
        return await createImg(safeUrl, true);
    } catch (e: any) {
        // Fallback final
    }

    try {
         return await createImg(safeUrl, false);
    } catch (e) {
         return null;
    }
};

const FALLBACK_AVATAR_URL = "https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/avatars%2Fdefault%2Favatar.png?alt=media";

const ConnectionStreakShareModal: React.FC<ConnectionStreakShareModalProps> = ({ isOpen, onClose, crystalData, currentUser, otherUser, currentUserAvatar, otherUserAvatar, onPulseCreated }) => {
    const { t } = useLanguage();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setGeneratedImage(null);
            setIsGenerating(true);
            setError('');
            return;
        }

        const generateCard = async () => {
            setIsGenerating(true);
            setError('');
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const W = 1080;
            const H = 1920;
            canvas.width = W;
            canvas.height = H;

            try {
                const [userImg, otherUserImg] = await Promise.all([
                    loadImageSafe(currentUserAvatar || FALLBACK_AVATAR_URL),
                    loadImageSafe(otherUserAvatar || FALLBACK_AVATAR_URL)
                ]);

                const drawCanvas = (safeMode: boolean) => {
                    const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
                    bgGradient.addColorStop(0, '#020617');
                    bgGradient.addColorStop(0.5, '#1e3a8a');
                    bgGradient.addColorStop(1, '#3b82f6');
                    ctx.fillStyle = bgGradient;
                    ctx.fillRect(0, 0, W, H);

                    for (let i = 0; i < 400; i++) {
                        const x = Math.random() * W;
                        const y = Math.random() * H;
                        const radius = Math.random() * 4 + 1;
                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.6 + 0.1})`;
                        ctx.fill();
                    }

                    const avatarSize = 300; 
                    const avatarY = 600;
                    const spacing = 60;
                    const startX = (W - (avatarSize * 2 + spacing)) / 2;
                    const userAvatarX = startX;
                    const otherAvatarX = startX + avatarSize + spacing;

                    ctx.save();
                    ctx.shadowColor = '#fef08a'; 
                    ctx.shadowBlur = 40;
                    ctx.strokeStyle = '#fde047'; 
                    ctx.lineWidth = 10;
                    ctx.lineCap = 'round';
                    const lineY = avatarY + (avatarSize / 2);
                    const lineStartX = userAvatarX + avatarSize - 20;
                    const lineEndX = otherAvatarX + 20;
                    ctx.beginPath();
                    ctx.moveTo(lineStartX, lineY);
                    ctx.lineTo(lineStartX + (lineEndX - lineStartX) * 0.3, lineY - 30);
                    ctx.lineTo(lineStartX + (lineEndX - lineStartX) * 0.6, lineY + 30);
                    ctx.lineTo(lineEndX, lineY);
                    ctx.stroke();
                    ctx.restore();

                    const drawAvatar = (img: HTMLImageElement | null, x: number, y: number) => {
                        ctx.save();
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 20;
                        ctx.shadowOffsetY = 10;
                        ctx.beginPath();
                        ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 12;
                        ctx.stroke();
                        ctx.clip();
                        
                        ctx.fillStyle = '#cbd5e1';
                        ctx.fillRect(x, y, avatarSize, avatarSize);

                        if (img && !safeMode) {
                            try {
                                ctx.drawImage(img, x, y, avatarSize, avatarSize);
                            } catch (e: any) {
                                drawFallback(x, y);
                            }
                        } else {
                            drawFallback(x, y);
                        }
                        ctx.restore();
                    };

                    const drawFallback = (x: number, y: number) => {
                        ctx.fillStyle = '#94a3b8';
                        ctx.beginPath();
                        ctx.arc(x + avatarSize / 2, y + avatarSize / 2 - avatarSize * 0.15, avatarSize * 0.25, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(x + avatarSize / 2, y + avatarSize, avatarSize * 0.45, Math.PI, 0);
                        ctx.fill();
                    }

                    drawAvatar(userImg, userAvatarX, avatarY);
                    drawAvatar(otherUserImg, otherAvatarX, avatarY);

                    ctx.font = 'bold 80px "Helvetica Neue", sans-serif';
                    ctx.fillStyle = '#f8fafc'; 
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 15;
                    ctx.fillText(t('crystal.shareTitle'), W / 2, 300);

                    ctx.font = 'bold 500px "Helvetica Neue", sans-serif';
                    const textGradient = ctx.createLinearGradient(0, 1000, 0, 1500);
                    textGradient.addColorStop(0, '#ffffff'); 
                    textGradient.addColorStop(1, '#bae6fd'); 
                    ctx.fillStyle = textGradient;
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 30;
                    ctx.fillText(crystalData.streak.toString(), W / 2, 1200);

                    ctx.font = 'bold 60px "Helvetica Neue", sans-serif';
                    ctx.fillStyle = '#e0f2fe'; 
                    ctx.shadowBlur = 5;
                    ctx.fillText("Dias de Conexão", W / 2, 1450);

                    ctx.font = 'italic 40px serif';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.fillText('Vibe App', W / 2, H - 100);
                };

                drawCanvas(false);
                
                try {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    setGeneratedImage(dataUrl);
                } catch (securityError: any) {
                    drawCanvas(true);
                    setGeneratedImage(canvas.toDataURL('image/jpeg', 0.9));
                }
                
                setIsGenerating(false);

            } catch (e: any) {
                console.error("Generation Error:", e.message || String(e));
                setError("Erro ao criar arte do Crystal.");
                setIsGenerating(false);
            }
        };
        
        generateCard();

    }, [isOpen, crystalData, currentUserAvatar, otherUserAvatar, t]);

    const handlePublish = async () => {
        if (!generatedImage || !currentUser) return;
        setIsPublishing(true);
        setError('');

        try {
            const pulseRef = storageRef(storage, `pulses/${currentUser.uid}/streak_${Date.now()}.jpg`);
            await uploadString(pulseRef, generatedImage, 'data_url');
            const downloadURL = await getDownloadURL(pulseRef);

            await addDoc(collection(db, 'pulses'), {
                authorId: currentUser.uid,
                mediaUrl: downloadURL,
                legenda: `Minha conexão de ${crystalData.streak} dias! 🔥`,
                createdAt: serverTimestamp(),
            });

            onPulseCreated();
        } catch (err: any) {
            console.error("Publish Error:", err.message || String(err));
            setError("Falha ao compartilhar no Pulse.");
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60]" onClick={onClose}>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="bg-zinc-800 text-white rounded-lg shadow-xl w-full max-w-sm p-4 border border-zinc-700 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Compartilhar Conexão</h3>
                    <button onClick={onClose} className="text-2xl">&times;</button>
                </div>
                
                <div className="aspect-[9/16] w-full bg-zinc-900 rounded-md flex items-center justify-center overflow-hidden relative">
                    {isGenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-10">
                             <Spinner />
                             <p className="text-xs text-zinc-400 mt-2">Criando imagem...</p>
                        </div>
                    )}
                    {error && !isGenerating && !generatedImage && <p className="text-red-400 text-center p-4">{error}</p>}
                    {generatedImage && (
                        <img src={generatedImage} alt="Connection streak preview" className="w-full h-full object-contain" />
                    )}
                </div>

                <Button onClick={handlePublish} disabled={isGenerating || isPublishing || !!error}>
                    {isPublishing ? "Publicando..." : "Compartilhar no Pulse"}
                </Button>
            </div>
        </div>
    );
};

export default ConnectionStreakShareModal;
