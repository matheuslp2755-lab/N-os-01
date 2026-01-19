
import React, { useState, useEffect } from 'react';
import { auth, db, collection, getDocs, doc, getDoc, query, where, orderBy } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import TextInput from '../common/TextInput';

interface SearchFollowingModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    onSelect: (user: any) => void;
}

const SearchFollowingModal: React.FC<SearchFollowingModalProps> = ({ isOpen, onClose, title, onSelect }) => {
    const { t } = useLanguage();
    const [following, setFollowing] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!isOpen || !currentUser) return;

        const fetchFollowing = async () => {
            setLoading(true);
            try {
                const followingRef = collection(db, 'users', currentUser.uid, 'following');
                const snap = await getDocs(followingRef);
                const followingData = await Promise.all(snap.docs.map(async d => {
                    const userSnap = await getDoc(doc(db, 'users', d.id));
                    return { id: d.id, ...userSnap.data() };
                }));
                setFollowing(followingData);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchFollowing();
    }, [isOpen, currentUser]);

    if (!isOpen) return null;

    const filtered = following.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b dark:border-zinc-800 text-center relative">
                    <h3 className="font-bold">{title}</h3>
                    <button onClick={onClose} className="absolute right-4 top-4 text-2xl font-light">&times;</button>
                </header>
                <div className="p-3">
                    <TextInput id="friend-search" label="Pesquisar amigos..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex-grow overflow-y-auto p-2">
                    {loading ? (
                        <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-sky-500"></div></div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-zinc-500 text-sm py-10">Nenhum amigo encontrado.</p>
                    ) : (
                        filtered.map(user => (
                            <button 
                                key={user.id} 
                                onClick={() => { onSelect(user); onClose(); }}
                                className="w-full flex items-center gap-3 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            >
                                <img src={user.avatar} className="w-10 h-10 rounded-full object-cover" />
                                <span className="font-semibold text-sm">{user.username}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SearchFollowingModal;
