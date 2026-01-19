
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '../../firebase';

interface BottomNavProps {
    currentView: 'feed' | 'vibes' | 'profile';
    onChangeView: (view: 'feed' | 'vibes' | 'profile') => void;
    onCreateClick: () => void;
}

const HomeIcon: React.FC<{ filled: boolean, className?: string }> = ({ filled, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
);

const PulseVideoIcon: React.FC<{ filled: boolean, className?: string }> = ({ filled, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView, onCreateClick }) => {
    const { t } = useLanguage();
    const currentUser = auth.currentUser;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-800 z-40 pb-safe">
            <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
                <button 
                    onClick={() => onChangeView('feed')}
                    className={`p-2 transition-transform active:scale-90 ${currentView === 'feed' ? 'text-black dark:text-white' : 'text-zinc-500'}`}
                    aria-label="Home"
                >
                    <HomeIcon filled={currentView === 'feed'} className="w-7 h-7" />
                </button>

                <button 
                    onClick={() => onChangeView('vibes')}
                    className={`p-2 transition-transform active:scale-90 ${currentView === 'vibes' ? 'text-black dark:text-white' : 'text-zinc-500'}`}
                    aria-label={t('header.vibes')}
                >
                    <PulseVideoIcon filled={currentView === 'vibes'} className="w-7 h-7" />
                </button>

                <button 
                    onClick={onCreateClick}
                    className="p-2 transition-transform active:scale-90 text-black dark:text-white"
                    aria-label={t('header.createPost')}
                >
                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl p-2 border border-zinc-300 dark:border-zinc-700">
                        <PlusIcon className="w-6 h-6" />
                    </div>
                </button>

                <button 
                    onClick={() => onChangeView('profile')}
                    className={`p-2 transition-transform active:scale-90 ${currentView === 'profile' ? 'ring-2 ring-black dark:ring-white rounded-full p-0.5' : ''}`}
                    aria-label={t('header.profile')}
                >
                    <img 
                        src={currentUser?.photoURL || `https://i.pravatar.cc/150?u=${currentUser?.uid}`} 
                        alt="Profile" 
                        className="w-7 h-7 rounded-full object-cover" 
                    />
                </button>
            </div>
        </div>
    );
};

export default BottomNav;
