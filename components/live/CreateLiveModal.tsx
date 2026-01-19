
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import Button from '../common/Button';

interface CreateLiveModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreateLiveModal: React.FC<CreateLiveModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const { startLive, activeLive, endLive } = useCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);

    // Initialize Camera Preview
    useEffect(() => {
        if (!isOpen) {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
            return;
        }

        const startPreview = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                    audio: true
                });
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (error) {
                console.error("Error accessing camera:", error);
            }
        };

        startPreview();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        };
    }, [isOpen]);

    const handleStartLive = async () => {
        setIsStarting(true);
        if(stream) {
            // Stop preview stream to let context take over
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        await startLive();
        setIsStarting(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col">
            <div className="flex-grow relative bg-black">
                {stream && (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className="w-full h-full object-cover mirrored"
                        style={{ transform: 'scaleX(-1)' }}
                    />
                )}
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 z-10 text-white text-3xl font-light"
                >
                    &times;
                </button>
            </div>
            
            <div className="p-6 bg-black text-center">
                <h2 className="text-white text-xl font-bold mb-6">{t('live.title')}</h2>
                <Button 
                    onClick={handleStartLive} 
                    disabled={isStarting}
                    className="w-full !rounded-full !py-4 !text-lg !font-bold !bg-red-600 hover:!bg-red-700 shadow-lg"
                >
                    {isStarting ? t('live.starting') : t('live.start')}
                </Button>
            </div>
        </div>
    );
};

export default CreateLiveModal;
