
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface MusicInfo {
  nome: string;
  artista: string;
  capa: string;
  preview: string;
  startTime?: number;
}

interface ProfileMusicPlayerProps {
  musicInfo: MusicInfo;
}

const PlayIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8.002v3.996a1 1 0 001.555.832l3.197-1.998a1 1 0 000-1.664l-3.197-1.998z" clipRule="evenodd" />
    </svg>
);

const PauseIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 100-2H9V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 100-2h-1V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);

const SNIPPET_DURATION = 25; 

const ProfileMusicPlayer: React.FC<ProfileMusicPlayerProps> = ({ musicInfo }) => {
    const { t } = useLanguage();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(musicInfo.startTime || 0);

    const togglePlayPause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current || !musicInfo.preview) return;
        
        const startTime = musicInfo.startTime || 0;

        if (isAudioPlaying) {
            audioRef.current.pause();
        } else {
            if (audioRef.current.currentTime < startTime || audioRef.current.currentTime >= startTime + SNIPPET_DURATION) {
                audioRef.current.currentTime = startTime;
            }
            audioRef.current.play().catch(err => {
                console.warn("Erro ao reproduzir áudio perfil:", err?.message || String(err));
                setIsAudioPlaying(false);
            });
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !musicInfo.preview) return;

        const startTime = musicInfo.startTime || 0;

        const handleTimeUpdate = () => {
            const time = audio.currentTime;
            if (time >= startTime + SNIPPET_DURATION) {
                audio.currentTime = startTime; 
            }
            setCurrentTime(time);
        };

        const handlePlay = () => setIsAudioPlaying(true);
        const handlePause = () => setIsAudioPlaying(false);
        const handleEnded = () => {
            setIsAudioPlaying(false);
            setCurrentTime(startTime);
            audio.currentTime = startTime;
        };
        const handleError = () => {
            const err = audio.error;
            console.error("Profile music error code:", err?.code);
            setIsAudioPlaying(false);
        };
        
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);

        // Resetar para o tempo inicial quando trocar a música
        audio.currentTime = startTime;
        setCurrentTime(startTime);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('error', handleError);
        };
    }, [musicInfo.preview, musicInfo.startTime]);
    
    const startTime = musicInfo.startTime || 0;
    const relativeCurrentTime = Math.max(0, currentTime - startTime);
    const progressPercentage = Math.min(100, (relativeCurrentTime / SNIPPET_DURATION) * 100);

    return (
        <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 w-full">
            <div className="flex items-center gap-3">
                 <button 
                    onClick={togglePlayPause} 
                    className="flex-shrink-0 text-sky-500 hover:scale-110 transition-transform"
                    aria-label={isAudioPlaying ? "Pausar" : "Tocar"}
                >
                   {isAudioPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}
                </button>
                <div className="flex-grow overflow-hidden">
                    <p className="font-semibold text-sm truncate">{musicInfo.nome}</p>
                    <p className="text-xs text-zinc-500 truncate">{musicInfo.artista}</p>
                </div>
                <img src={musicInfo.capa} alt={musicInfo.nome} className="w-10 h-10 rounded-md object-cover flex-shrink-0 shadow-sm"/>
                {musicInfo.preview && (
                    <audio 
                        key={musicInfo.preview}
                        ref={audioRef} 
                        src={musicInfo.preview} 
                        preload="metadata" 
                        crossOrigin="anonymous"
                    />
                )}
            </div>
             <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1 mt-2">
                <div className="bg-sky-50 h-1 rounded-full transition-all duration-100" style={{ width: `${progressPercentage}%` }}></div>
            </div>
        </div>
    );
};

export default ProfileMusicPlayer;
