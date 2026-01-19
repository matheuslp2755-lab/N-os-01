
import React, { useState, useEffect } from 'react';
import { db, collection, query, where, getDocs, limit, doc, updateDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from './UserProfile';
import TextInput from '../common/TextInput';

interface AdminVerifyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AdminVerifyModal: React.FC<AdminVerifyModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!search.trim()) {
            setResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, 'users'),
                    where('username_lowercase', '>=', search.toLowerCase()),
                    where('username_lowercase', '<=', search.toLowerCase() + '\uf8ff'),
                    limit(10)
                );
                const snap = await getDocs(q);
                setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => clearTimeout(delayDebounce);
    }, [search]);

    const handleToggleVerify = async (userId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'users', userId), {
                isVerified: !currentStatus
            });
            setResults(prev => prev.map(u => u.id === userId ? { ...u, isVerified: !currentStatus } : u));
        } catch (e) {
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b dark:border-zinc-800 text-center relative">
                    <h3 className="font-black text-sm uppercase tracking-widest text-sky-500">{t('profile.adminVerifyTitle')}</h3>
                    <button onClick={onClose} className="absolute right-6 top-6 text-zinc-400 hover:text-zinc-600 text-2xl font-light">&times;</button>
                </header>
                
                <div className="p-4">
                    <TextInput 
                        id="admin-search" 
                        label={t('profile.searchUserToVerify')} 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        className="!rounded-2xl !bg-zinc-100 dark:!bg-zinc-900 border-none"
                    />
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-3 no-scrollbar">
                    {loading ? (
                        <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div></div>
                    ) : results.length === 0 && search ? (
                        <p className="text-center text-zinc-500 font-bold text-xs py-10 opacity-50 uppercase tracking-widest">{t('header.noResults')}</p>
                    ) : (
                        results.map(user => (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border dark:border-zinc-800 transition-all">
                                <div className="flex items-center gap-3">
                                    <img src={user.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-transparent" />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm flex items-center">
                                            {user.username}
                                            {user.isVerified && <VerifiedBadge className="w-3.5 h-3.5 ml-1" />}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-medium">{user.email}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleToggleVerify(user.id, !!user.isVerified)} 
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${user.isVerified ? 'bg-red-500 text-white' : 'bg-sky-500 text-white'}`}
                                >
                                    {user.isVerified ? t('profile.unverifyAction') : t('profile.verifyAction')}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminVerifyModal;
