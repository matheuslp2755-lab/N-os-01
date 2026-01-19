import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from '../profile/UserProfile';

type Pulse = {
    id: string;
    mediaUrl: string;
    legenda: string;
    createdAt: { seconds: number; nanoseconds: number };
    authorId: string;
};

type UserWithPulses = {
    author: {
        id: string;
        username: string;
        avatar: string;
        isVerified?: boolean;
    };
    pulses: Pulse[];
};

interface PulseBarProps {
    usersWithPulses: UserWithPulses[];
    onViewPulses: (authorId: string) => void;
}

const PulseBar: React.FC<PulseBarProps> = ({ usersWithPulses, onViewPulses }) => {
    const { t } = useLanguage();

    return (
        <div className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black lg:rounded-xl lg:border lg:mb-4 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4 overflow-x-auto no-scrollbar scroll-smooth">
                {/* Cartões de Pulse (Stories) */}
                {usersWithPulses.map(({ author, pulses }) => {
                    const latestPulse = pulses && pulses.length > 0 ? pulses[pulses.length - 1] : null;
                    if (!latestPulse) return null;
                    const isVideo = latestPulse.mediaUrl?.match(/\.(mp4|webm|mov|ogg)$/i);

                    return (
                        <div 
                            key={author?.id} 
                            className="relative flex-shrink-0 w-24 h-40 lg:w-28 lg:h-44 cursor-pointer group rounded-2xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800 transition-all duration-300 hover:scale-105 active:scale-95"
                            onClick={() => author?.id && onViewPulses(author.id)}
                            role="button"
                        >
                            <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-900">
                                {isVideo ? (
                                    <video src={latestPulse.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                    <img src={latestPulse.mediaUrl} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80"></div>
                            </div>
                            <div className="absolute bottom-2 left-0 right-0 px-2 text-center">
                                <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 mx-auto mb-1 shadow-lg ring-2 ring-black">
                                    <img src={author?.avatar || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="w-full h-full rounded-full object-cover bg-black" />
                                </div>
                                <p className="text-white text-[10px] font-bold truncate drop-shadow-md flex items-center justify-center">
                                    {author?.username || 'User'}
                                    {author?.isVerified && <VerifiedBadge className="w-2.5 h-2.5 ml-0.5" />}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PulseBar;