import React, { useState, useEffect, useRef } from 'react';
import { auth, db, collection, query, where, getDocs, limit, doc, serverTimestamp, onSnapshot, writeBatch, getDoc, updateDoc, orderBy } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from '../profile/UserProfile';

type Notification = {
    id: string;
    type: 'follow' | 'message' | 'follow_request' | 'mention_comment' | 'duo_request' | 'duo_accepted' | 'duo_refused' | 'tag_request' | 'tag_accepted' | 'like_pulse' | 'like_post' | 'like_vibe';
    fromUserId: string;
    fromUsername: string;
    fromUserAvatar: string;
    timestamp: { seconds: number; nanoseconds: number };
    read: boolean;
    conversationId?: string;
    postId?: string;
    commentText?: string;
};

interface HeaderProps {
    onSelectUser: (userId: string) => void;
    onGoHome: () => void;
    onOpenMessages: (conversationId?: string) => void;
    onOpenBrowser: () => void;
    hasUnread?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onSelectUser, onGoHome, onOpenMessages, onOpenBrowser, hasUnread }) => {
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isActivityDropdownOpen, setIsActivityDropdownOpen] = useState(false);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'users', currentUser.uid, 'notifications'), orderBy('timestamp', 'desc'), limit(30));
        return onSnapshot(q, (snapshot) => {
            setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
        });
    }, [currentUser]);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setSearchResults([]);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const q = query(
                    collection(db, 'users'),
                    where('username_lowercase', '>=', searchQuery.toLowerCase()),
                    where('username_lowercase', '<=', searchQuery.toLowerCase() + '\uf8ff'),
                    limit(15)
                );
                const querySnapshot = await getDocs(q);
                const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setSearchResults(users);
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const markAllAsRead = async () => {
        if (!currentUser) return;
        const batch = writeBatch(db);
        notifications.forEach(n => {
            if (!n.read) {
                batch.update(doc(db, 'users', currentUser.uid, 'notifications', n.id), { read: true });
            }
        });
        await batch.commit();
    };

    const toggleActivity = () => {
        if (!isActivityDropdownOpen) markAllAsRead();
        setIsActivityDropdownOpen(!isActivityDropdownOpen);
    };

    const closeSearch = () => {
        setIsSearchOverlayOpen(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    const getNotificationText = (n: Notification) => {
        switch(n.type) {
            case 'follow': return 'começou a seguir você.';
            case 'like_post': return 'curtiu sua publicação.';
            case 'like_pulse': return 'curtiu seu pulse.';
            case 'like_vibe': return 'curtiu seu vibe.';
            case 'mention_comment': return 'mencionou você em um comentário.';
            default: return 'interagiu com você.';
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 bg-white dark:bg-black border-b dark:border-zinc-800 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-5xl">
                <div className="flex items-center gap-4 flex-1">
                    <h1 onClick={onGoHome} className="text-3xl cursor-pointer font-black bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-transparent bg-clip-text tracking-tighter italic shrink-0">Néos</h1>
                    
                    {/* Barra de pesquisa compacta ao lado do logo */}
                    <div 
                        onClick={() => setIsSearchOverlayOpen(true)}
                        className="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-full px-4 py-2 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all max-w-[200px] w-full group"
                    >
                        <svg className="w-4 h-4 text-zinc-400 mr-2 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <span className="text-zinc-400 text-sm font-medium truncate">Pesquisar...</span>
                    </div>
                </div>

                <nav className="flex items-center gap-3 sm:gap-4">
                    <button onClick={onOpenBrowser} className="p-1.5 text-indigo-500 hover:scale-110 transition-transform"><svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg></button>
                    
                    <div className="relative">
                        <button onClick={toggleActivity} className="relative hover:scale-110 transition-transform">
                            <svg className={`w-7 h-7 ${hasUnread ? 'text-sky-500' : 'text-zinc-800 dark:text-zinc-200'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-6.12 8.351C12.89 20.72 12.434 21 12 21s-.89-.28-1.38-.627C7.152 14.08 4.5 12.192 4.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.118-1.763a4.21 4.21 0 0 1 3.675-1.941Z"></path></svg>
                            {hasUnread && (
                                <span className="absolute -top-0.5 -right-0.5 block h-3 w-3 rounded-full bg-sky-500 border-2 border-white dark:border-black animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.8)]"></span>
                            )}
                        </button>
                        {isActivityDropdownOpen && (
                            <div className="absolute right-0 top-full mt-4 w-80 bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border dark:border-zinc-800 z-50 max-h-[70vh] overflow-y-auto no-scrollbar animate-fade-in">
                                {notifications.length > 0 ? notifications.map(n => (
                                    <div key={n.id} onClick={() => { onSelectUser(n.fromUserId); setIsActivityDropdownOpen(false); }} className="flex items-start p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-b last:border-0 dark:border-zinc-900 transition-colors cursor-pointer">
                                        <img src={n.fromUserAvatar} className="w-10 h-10 rounded-full object-cover shrink-0 border dark:border-zinc-700"/>
                                        <div className="ml-3 text-xs flex-grow">
                                            <p className="leading-snug"><b>{n.fromUsername}</b> {getNotificationText(n)}</p>
                                        </div>
                                    </div>
                                )) : <div className="p-10 text-center text-xs font-black uppercase text-zinc-400">Nenhuma atividade</div>}
                            </div>
                        )}
                    </div>

                    <button onClick={() => onOpenMessages()} className="hover:scale-110 transition-transform"><svg className="w-7 h-7 text-zinc-800 dark:text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2Z"/></svg></button>
                </nav>
            </div>

            {/* Tela de Pesquisa Fullscreen */}
            {isSearchOverlayOpen && (
                <div className="fixed inset-0 bg-white dark:bg-black z-[100] animate-fade-in flex flex-col">
                    <header className="flex items-center gap-4 p-4 border-b dark:border-zinc-800 shrink-0">
                        <button onClick={closeSearch} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-all">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <div className="flex-grow flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-2.5">
                            <svg className="w-5 h-5 text-zinc-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input 
                                autoFocus
                                type="text" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Pesquisar por nome ou usuário..."
                                className="w-full bg-transparent outline-none text-base font-bold dark:text-white"
                            />
                            {isSearching && <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                        </div>
                    </header>
                    
                    <main className="flex-grow overflow-y-auto p-4 no-scrollbar">
                        <div className="max-w-xl mx-auto">
                            {searchResults.length > 0 ? (
                                <div className="space-y-2">
                                    {searchResults.map(user => (
                                        <button 
                                            key={user.id} 
                                            onClick={() => { onSelectUser(user.id); closeSearch(); }} 
                                            className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-3xl transition-all text-left group"
                                        >
                                            <div className="relative">
                                                <img src={user.avatar} className="w-14 h-14 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-500/50 transition-all" />
                                            </div>
                                            <div className="flex-grow">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-black text-base">{user.username}</span>
                                                    {user.isVerified && <VerifiedBadge className="w-4 h-4" />}
                                                </div>
                                                <p className="text-xs text-zinc-500 font-medium">Ver perfil de {user.username}</p>
                                            </div>
                                            <svg className="w-5 h-5 text-zinc-300 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    ))}
                                </div>
                            ) : searchQuery.length > 0 && !isSearching ? (
                                <div className="py-20 text-center space-y-4 opacity-30">
                                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-10 h-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                                    </div>
                                    <h3 className="text-xl font-black uppercase tracking-widest">Nenhum sinal encontrado</h3>
                                    <p className="text-sm font-bold">Tente um termo de busca diferente</p>
                                </div>
                            ) : !searchQuery && (
                                <div className="py-20 text-center space-y-4 opacity-20">
                                    <h3 className="text-2xl font-black italic uppercase tracking-tighter bg-gradient-to-r from-indigo-500 to-pink-500 text-transparent bg-clip-text">Encontre sua Vibe</h3>
                                    <p className="text-xs font-black uppercase tracking-[0.3em]">Pesquise amigos e conexões</p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            )}
        </header>
    );
};

export default Header;