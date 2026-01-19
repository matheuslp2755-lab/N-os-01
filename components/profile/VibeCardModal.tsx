
import React, { useState, useEffect, useRef } from 'react';
// Added auth to the imports from firebase
import { auth } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from './UserProfile';
import Button from '../common/Button';

interface VibeCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onSelectUser?: (userId: string) => void;
}

const VibeCardModal: React.FC<VibeCardModalProps> = ({ isOpen, onClose, user, onSelectUser }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'card' | 'scanner'>('card');
    const [qrUrl, setQrUrl] = useState('');
    const [cameraError, setCameraError] = useState('');
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        if (isOpen && user) {
            // Gerar QR Code via API pública (estilo Instagram)
            // O QR Code aponta para o ID do usuário
            const size = 300;
            // Use auth.currentUser?.uid if user.userId is not available
            const data = encodeURIComponent(`vibe:user:${user.userId || auth.currentUser?.uid}`);
            setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}&color=000&bgcolor=fff&margin=2`);
        }
        if (!isOpen) {
            stopScanner();
            setMode('card');
        }
    }, [isOpen, user]);

    const startScanner = async () => {
        setMode('scanner');
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                scanFrame();
            }
        } catch (err) {
            setCameraError('Não foi possível acessar a câmera para o scanner.');
        }
    };

    const stopScanner = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    };

    const scanFrame = () => {
        if (mode !== 'scanner' || !videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Aqui normalmente usaríamos jsQR, mas para este protótipo vamos simular
            // a detecção se o usuário "centralizar" o código (ou usar uma biblioteca real se disponível)
            // Por simplicidade, assumimos que o scanner está ativo e ouvindo.
        }
        requestAnimationFrame(scanFrame);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-fade-in">
            <button onClick={onClose} className="absolute top-10 right-10 text-white/40 text-4xl font-thin hover:text-white transition-colors">&times;</button>

            <div className="w-full max-w-sm flex flex-col gap-8">
                
                {mode === 'card' ? (
                    <div className="animate-slide-up space-y-8">
                        <div className="bg-white rounded-[3rem] p-8 shadow-[0_0_100px_rgba(255,255,255,0.1)] relative overflow-hidden group">
                            {/* Header do Card */}
                            <div className="flex flex-col items-center text-center gap-4 mb-10">
                                <div className="relative">
                                    <img src={user.avatar} className="w-24 h-24 rounded-full border-4 border-zinc-50 object-cover shadow-2xl" />
                                    <div className="absolute -bottom-1 -right-1 bg-sky-500 rounded-full p-1 border-4 border-white">
                                        <VerifiedBadge className="w-4 h-4 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-black tracking-tighter">@{user.username}</h2>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Vibe Pro Card</p>
                                </div>
                            </div>

                            {/* QR Code Area */}
                            <div className="relative aspect-square w-full bg-zinc-50 rounded-[2.5rem] flex items-center justify-center p-6 border-2 border-dashed border-zinc-200">
                                {qrUrl ? (
                                    <img src={qrUrl} className="w-full h-full mix-blend-multiply opacity-90" alt="QR Code" />
                                ) : (
                                    <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                     <div className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border-4 border-zinc-50">
                                        <img src={user.avatar} className="w-full h-full rounded-xl object-cover" />
                                     </div>
                                </div>
                            </div>

                            <p className="text-center text-[9px] font-bold text-zinc-400 mt-8 uppercase tracking-widest leading-relaxed">
                                Peça para um amigo escanear<br/>para te encontrar no Vibe
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Button 
                                onClick={startScanner}
                                className="!py-5 !rounded-3xl !font-black !uppercase !tracking-[0.2em] !bg-sky-500 !text-white shadow-2xl active:scale-95 transition-all"
                            >
                                <div className="flex items-center justify-center gap-3">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                                    Abrir Scanner
                                </div>
                            </Button>
                            <button className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] py-2 hover:text-white transition-colors">Compartilhar Link</button>
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in flex flex-col gap-6">
                        <div className="relative w-full aspect-square rounded-[3rem] overflow-hidden bg-zinc-900 border-2 border-white/20">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            <canvas ref={canvasRef} className="hidden" />
                            
                            {/* Overlay do Scanner */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-64 h-64 border-2 border-sky-500 rounded-[2rem] relative">
                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-sky-500 rounded-tl-xl"></div>
                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-sky-500 rounded-tr-xl"></div>
                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-sky-500 rounded-bl-xl"></div>
                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-sky-500 rounded-br-xl"></div>
                                    
                                    {/* Linha de Scan Animada */}
                                    <div className="absolute left-4 right-4 h-0.5 bg-sky-500/50 shadow-[0_0_15px_#0ea5e9] animate-scan-line"></div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center space-y-4">
                            <h3 className="text-white font-black text-lg uppercase tracking-widest">Escaneando...</h3>
                            <p className="text-zinc-500 text-xs font-medium">Aponte para o Vibe Card de um amigo</p>
                        </div>

                        <button 
                            onClick={() => { stopScanner(); setMode('card'); }} 
                            className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] tracking-widest"
                        >
                            Meu Cartão
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes scan-line {
                    0% { top: 10%; }
                    50% { top: 90%; }
                    100% { top: 10%; }
                }
                .animate-scan-line { animation: scan-line 3s ease-in-out infinite; }
            `}</style>
        </div>
    );
};

export default VibeCardModal;