import React, { useState, useEffect } from 'react';
import { db, collection, getDocs, doc, getDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';

interface PulseViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pulseId: string;
  onUserSelect?: (userId: string) => void;
}

type InteractionUser = {
    id: string;
    username: string;
    avatar: string;
    hasLiked: boolean;
};

const Spinner: React.FC = () => (
    <div className="flex justify-center items-center p-4">
        <svg className="animate-spin h-5 w-5 text-zinc-500 dark:text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const PulseViewsModal: React.FC<PulseViewsModalProps> = ({ isOpen, onClose, pulseId, onUserSelect }) => {
    const { t } = useLanguage();
    const [users, setUsers] = useState<InteractionUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'all' | 'likes'>('all');

    useEffect(() => {
        if (!isOpen) return;

        const fetchInteractions = async () => {
            setLoading(true);
            try {
                // 1. Get likers from main pulse doc
                const pulseSnap = await getDoc(doc(db, 'pulses', pulseId));
                const likersIds = pulseSnap.data()?.likes || [];

                // 2. Get viewers from subcollection
                const viewsRef = collection(db, 'pulses', pulseId, 'views');
                const viewsSnap = await getDocs(viewsRef);
                const viewerIds = viewsSnap.docs.map(d => d.id);

                // Unique list of all interacters
                const allIds = Array.from(new Set([...likersIds, ...viewerIds]));

                if (allIds.length > 0) {
                    const userPromises = allIds.map(id => getDoc(doc(db, 'users', id)));
                    const userDocs = await Promise.all(userPromises);
                    
                    const data = userDocs
                        .filter(d => d.exists())
                        .map(d => ({
                            id: d.id,
                            username: d.data()?.username,
                            avatar: d.data()?.avatar,
                            hasLiked: likersIds.includes(d.id)
                        } as InteractionUser));

                    setUsers(data);
                } else {
                    setUsers([]);
                }
            } catch (error) {
                console.error("Error fetching pulse interactions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchInteractions();
    }, [isOpen, pulseId]);

    if (!isOpen) return null;

    const filteredUsers = tab === 'likes' ? users.filter(u => u.hasLiked) : users;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[200]" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-sm border dark:border-zinc-800 flex flex-col h-[70vh] sm:h-[500px]" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b dark:border-zinc-800 text-center relative flex-shrink-0">
                    <div className="w-12 h-1.5 bg-zinc-200 dark:border-zinc-800 rounded-full mx-auto mb-4 sm:hidden"></div>
                    <h2 className="text-sm font-black uppercase tracking-widest">{t('pulseViewer.interactors') || 'Atividade'}</h2>
                    <button onClick={onClose} className="absolute right-6 top-6 text-zinc-400 hover:text-white text-2xl font-light">&times;</button>
                </header>

                <div className="flex border-b dark:border-zinc-800">
                    <button 
                        onClick={() => setTab('all')}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'all' ? 'text-sky-500 border-b-2 border-sky-500' : 'text-zinc-500'}`}
                    >
                        Vistos ({users.length})
                    </button>
                    <button 
                        onClick={() => setTab('likes')}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'likes' ? 'text-red-500 border-b-2 border-red-500' : 'text-zinc-500'}`}
                    >
                        Curtidas ({users.filter(u => u.hasLiked).length})
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto no-scrollbar p-2">
                    {loading ? (
                        <Spinner />
                    ) : filteredUsers.length > 0 ? (
                        <div className="space-y-1">
                            {filteredUsers.map(user => (
                                <button 
                                    key={user.id} 
                                    onClick={() => onUserSelect?.(user.id)}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-[1.5rem] transition-all group"
                                >
                                    <div className="relative">
                                        <img src={user.avatar} className="w-11 h-11 rounded-full object-cover border dark:border-zinc-800" alt={user.username} />
                                        {user.hasLiked && (
                                            <div className="absolute -bottom-1 -right-1 bg-red-500 text-white p-1 rounded-full border-2 border-white dark:border-black shadow-lg">
                                                <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left flex-grow">
                                        <p className="font-black text-sm tracking-tight group-hover:text-sky-500 transition-colors">@{user.username}</p>
                                        <p className="text-[9px] text-zinc-500 uppercase tracking-widest">{user.hasLiked ? 'Curtiu seu Pulse' : 'Visualizou'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeWidth={1.5}/></svg>
                            <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma atividade ainda</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PulseViewsModal;