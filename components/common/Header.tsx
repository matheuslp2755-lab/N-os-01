import React, { useState, useEffect, useRef } from 'react';
import { auth, db, collection, query, where, getDocs, limit, doc, serverTimestamp, onSnapshot, writeBatch, getDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from '../profile/UserProfile';

type UserSearchResult = {
    id: string;
    username: string;
    avatar: string;
    isPrivate: boolean;
    isVerified?: boolean;
    lastSeen?: { seconds: number; nanoseconds: number };
};

type Notification = {
    id: string;
    type: 'follow' | 'message' | 'follow_request' | 'mention_comment' | 'duo_request' | 'duo_accepted' | 'duo_refused' | 'tag_request' | 'tag_accepted';
    fromUserId: string;
    fromUsername: string;
    fromUserAvatar: string;
    timestamp: { seconds: number; nanoseconds: number };
    read: boolean;
    conversationId?: string;
    postId?: string;
    commentText?: string;
    isFromVerified?: boolean;
};


interface HeaderProps {
    onSelectUser: (userId: string) => void;
    onGoHome: () => void;
    onOpenMessages: (conversationId?: string) => void;
    onOpenBrowser: () => void;
}

const SearchOverlay: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSelectUser: (id: string) => void;
}> = ({ isOpen, onClose, onSelectUser }) => {
    const { t } = useLanguage();
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState<UserSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!queryText.trim()) {
            setResults([]);
            return;
        }
        setLoading(true);
        const timer = setTimeout(async () => {
            const q = query(
                collection(db, 'users'),
                where('username_lowercase', '>=', queryText.toLowerCase()),
                where('username_lowercase', '<=', queryText.toLowerCase() + '\uf8ff'),
                limit(15)
            );
            try {
                const snap = await getDocs(q);
                setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserSearchResult)));
            } catch (e) {} finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [queryText]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-white dark:bg-black animate-fade-in flex flex-col">
            <header className="flex items-center gap-4 p-4 border-b dark:border-zinc-800">
                <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div className="flex-grow bg-zinc-100 dark:bg-zinc-900 rounded-2xl flex items-center px-4 py-2">
                    <input 
                        autoFocus
                        type="text" 
                        value={queryText}
                        onChange={e => setQueryText(e.target.value)}
                        placeholder="Pesquisar usuários..."
                        className="w-full bg-transparent outline-none text-sm font-bold"
                    />
                </div>
            </header>
            <main className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar">
                {loading ? (
                    <div className="py-10 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div></div>
                ) : results.length > 0 ? results.map(u => (
                    <div key={u.id} onClick={() => { onSelectUser(u.id); onClose(); }} className="flex items-center gap-4 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-2xl cursor-pointer transition-all active:scale-95">
                        <img src={u.avatar} className="w-14 h-14 rounded-full object-cover border dark:border-zinc-800" />
                        <div className="flex flex-col">
                            <span className="font-black text-sm flex items-center">{u.username} {u.isVerified && <VerifiedBadge className="w-4 h-4 ml-1" />}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Néos User</span>
                        </div>
                    </div>
                )) : queryText && (
                    <p className="text-center py-20 text-zinc-500 text-xs font-black uppercase tracking-widest">Nenhum usuário encontrado</p>
                )}
            </main>
        </div>
    );
};

const Header: React.FC<HeaderProps> = ({ onSelectUser, onGoHome, onOpenMessages, onOpenBrowser }) => {
    const { t } = useLanguage();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isActivityDropdownOpen, setIsActivityDropdownOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
    
    const activityRef = useRef<HTMLDivElement>(null);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'users', currentUser.uid, 'notifications'), limit(20));
        return onSnapshot(q, async (snapshot) => {
            const fetched = await Promise.all(snapshot.docs.map(async d => {
                const data = d.data() as Notification;
                const userSnap = await getDoc(doc(db, 'users', data.fromUserId));
                return { 
                    id: d.id, 
                    ...data, 
                    isFromVerified: userSnap.exists() ? userSnap.data().isVerified : false 
                };
            }));
            const sorted = fetched.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setNotifications(sorted);
            setHasUnreadNotifications(sorted.some(n => !n.read));
        });
    }, [currentUser]);

    const handleAcceptDuoRequest = async (n: Notification) => {
        if (!currentUser || !n.postId) return;
        const batch = writeBatch(db);
        batch.update(doc(db, 'posts', n.postId), {
            duoPending: false,
            duoPartner: { id: currentUser.uid, username: currentUser.displayName, avatar: currentUser.photoURL }
        });
        batch.delete(doc(db, 'users', currentUser.uid, 'notifications', n.id));
        const notifRef = doc(collection(db, 'users', n.fromUserId, 'notifications'));
        batch.set(notifRef, {
            type: 'duo_accepted',
            fromUserId: currentUser.uid,
            fromUsername: currentUser.displayName,
            fromUserAvatar: currentUser.photoURL,
            timestamp: serverTimestamp(),
            read: false
        });
        await batch.commit();
    };

    const handleDeclineDuoRequest = async (n: Notification) => {
        if (!currentUser || !n.postId) return;
        const batch = writeBatch(db);
        batch.update(doc(db, 'posts', n.postId), { duoPending: false, duoPartnerId: null });
        batch.delete(doc(db, 'users', currentUser.uid, 'notifications', n.id));
        await batch.commit();
    };

    return (
        <header className="fixed top-0 left-0 right-0 bg-white dark:bg-black border-b dark:border-zinc-800 z-50 transition-all duration-300">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-5xl">
                <div className="flex items-center gap-3">
                    <h1 onClick={onGoHome} className="text-3xl cursor-pointer font-black bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-transparent bg-clip-text tracking-tighter italic">Néos</h1>
                </div>

                <div className="flex-grow max-w-xs mx-4" onClick={() => setIsSearchOpen(true)}>
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-2xl border border-transparent cursor-text">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                        <span className="text-sm font-bold text-zinc-500">Pesquisar...</span>
                    </div>
                </div>

                <nav className="flex items-center gap-3 sm:gap-4">
                    <button onClick={onOpenBrowser} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-indigo-500"><svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg></button>
                    <div ref={activityRef} className="relative">
                        <button onClick={() => setIsActivityDropdownOpen(!isActivityDropdownOpen)} className="relative hover:scale-110 transition-transform">
                            <svg className="w-7 h-7 text-zinc-800 dark:text-zinc-200" fill="currentColor" viewBox="0 0 24 24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-6.12 8.351C12.89 20.72 12.434 21 12 21s-.89-.28-1.38-.627C7.152 14.08 4.5 12.192 4.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.118-1.763a4.21 4.21 0 0 1 3.675-1.941Z"></path></svg>
                            {hasUnreadNotifications && <span className="absolute top-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-black"></span>}
                        </button>
                        {isActivityDropdownOpen && (
                            <div className="absolute right-0 top-full mt-4 w-80 bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border dark:border-zinc-800 z-50 max-h-[70vh] overflow-y-auto animate-fade-in no-scrollbar">
                                {notifications.length > 0 ? notifications.map(n => (
                                    <div key={n.id} className="flex items-start p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-b last:border-0 dark:border-zinc-900 transition-colors">
                                        <img src={n.fromUserAvatar} className="w-10 h-10 rounded-full object-cover shrink-0 border dark:border-zinc-700"/>
                                        <div className="ml-3 text-xs flex-grow">
                                            <p className="leading-snug"><b>{n.fromUsername}</b> {n.type === 'follow' ? 'começou a seguir você.' : n.type === 'message' ? 'enviou uma mensagem.' : 'interagiu com você.'}</p>
                                        </div>
                                    </div>
                                )) : <div className="p-10 text-center text-xs font-black uppercase text-zinc-400">Nenhuma atividade</div>}
                            </div>
                        )}
                    </div>
                    <button onClick={() => onOpenMessages()} className="hover:scale-110 transition-transform"><svg className="w-7 h-7 text-zinc-800 dark:text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2Z"/></svg></button>
                </nav>
            </div>
            <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSelectUser={onSelectUser} />
        </header>
    );
};

export default Header;