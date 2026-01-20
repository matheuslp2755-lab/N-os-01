import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface CreateMenuModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (type: 'post' | 'pulse' | 'vibe') => void;
}

const CreateMenuModal: React.FC<CreateMenuModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { t } = useLanguage();

    if (!isOpen) return null;

    const options = [
        { 
            id: 'post', 
            label: t('header.createPost'), 
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            ),
            color: 'bg-blue-500'
        },
        { 
            id: 'pulse', 
            label: t('header.createPulse'), 
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            ),
            color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500'
        },
        { 
            id: 'vibe', 
            label: t('header.createVibe'), 
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            color: 'bg-zinc-900 dark:bg-white dark:text-black'
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div 
                className="bg-white dark:bg-zinc-950 w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[3rem] overflow-hidden shadow-2xl animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 text-center border-b dark:border-zinc-800">
                    <div className="w-12 h-1.5 bg-zinc-200 dark:border-zinc-800 rounded-full mx-auto mb-4 sm:hidden"></div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em]">{t('header.create')}</h3>
                </div>
                
                <div className="p-4 grid grid-cols-1 gap-2">
                    {options.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => { onSelect(opt.id as any); onClose(); }}
                            className="flex items-center gap-4 p-4 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all active:scale-95 group"
                        >
                            <div className={`w-12 h-12 rounded-2xl ${opt.color} flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110`}>
                                {opt.icon}
                            </div>
                            <span className="font-bold text-sm">{opt.label}</span>
                        </button>
                    ))}
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50">
                    <button 
                        onClick={onClose}
                        className="w-full py-4 text-xs font-black uppercase tracking-widest text-zinc-500"
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateMenuModal;