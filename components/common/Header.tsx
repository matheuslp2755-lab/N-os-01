
import React, { useState, useEffect } from 'react';
import { auth, db, collection, query, where, getDocs, limit, doc, serverTimestamp, onSnapshot, writeBatch, getDoc, orderBy, setDoc, deleteDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { VerifiedBadge } from '../profile/UserProfile';

type Notification = {
    id: string;
    type: 'follow' | 'message' | 'follow_request' | 'mention_comment' | 'duo_request' | 'tag_request' | 'like_pulse' | 'like_post' | 'like_vibe';
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

const Header: React.FC<HeaderProps> = ({ onSelectUser, onGoHome, onOpenMessages, onOpenBrowser }) => {
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isActivityDropdownOpen, setIsActivityDropdownOpen] = useState(false);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'users', currentUser.uid, 'notifications'), orderBy('timestamp', 'desc'), limit(30));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
            setNotifications(items);
            setUnreadCount(items.filter(n => !n.read).length);
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
        if (!currentUser || unreadCount === 0) return;
        const batch = writeBatch(db);
        notifications.forEach(n => {
            if (!n.read) {
                batch.update(doc(db, 'users', currentUser.uid, 'notifications', n.id), { read: true });
            }
        });
        await batch.commit();
        setUnreadCount(0);
    };

    const handleAcceptRequest = async (notif: Notification) => {
        if (!currentUser) return;
        const batch = writeBatch(db);
        
        // 1. Adicionar aos seguidores
        batch.set(doc(db, 'users', currentUser.uid, 'followers', notif.fromUserId), {
            username: notif.fromUsername,
            avatar: notif.fromUserAvatar,
            timestamp: serverTimestamp()
        });

        // 2. Adicionar à lista de "seguindo" da outra pessoa
        const targetUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const myData = targetUserDoc.data();
        batch.set(doc(db, 'users', notif.fromUserId, 'following', currentUser.uid), {
            username: myData?.username,
            avatar: myData?.avatar,
            timestamp: serverTimestamp()
        });

        // 3. Limpar documentos de solicitação
        batch.delete(doc(db, 'users', currentUser.uid, 'followRequests', notif.fromUserId));
        batch.delete(doc(db, 'users', notif.fromUserId, 'sentFollowRequests', currentUser.uid));

        // 4. Marcar notificação como processada/lida
        batch.update(doc(db, 'users', currentUser.uid, 'notifications', notif.id), { 
            read: true,
            type: 'follow' // Converte para seguidor normal na visualização
        });

        await batch.commit();
    };

    const handleDeclineRequest = async (notif: Notification) => {
        if (!currentUser) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'users', currentUser.uid, 'followRequests', notif.fromUserId));
        batch.delete(doc(db, 'users', notif.fromUserId, 'sentFollowRequests', currentUser.uid));
        batch.delete(doc(db, 'users', currentUser.uid, 'notifications', notif.id));
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
            case 'follow_request': return t('header.followRequestNotification', { username: '' }).replace(': ""', '').trim();
            default: return 'interagiu com você.';
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 bg-white dark:bg-black border-b dark:border-zinc-800 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-5xl">
                <div className="flex items-center gap-4 flex-1">
                    <h1 onClick={onGoHome} className="text-3xl cursor-pointer font-black bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-transparent bg-clip-text tracking-tighter italic shrink-0">Néos</h1>
                    
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
                            <svg className={`w-7 h-7 ${unreadCount > 0 ? 'text-indigo-500' : 'text-zinc-800 dark:text-zinc-200'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-6.12 8.351C12.89 20.72 12.434 21 12 21s-.89-.28-1.38-.627C7.152 14.08 4.5 12.192 4.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.118-1.763a4.21 4.21 0 0 1 3.675-1.941Z"></path></svg>
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 block h-3 w-3 rounded-full bg-indigo-500 border-2 border-white dark:border-black animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.8)]"></span>
                            )}
                        </button>
                        {isActivityDropdownOpen && (
                            <div className="absolute right-0 top-full mt-4 w-80 bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border dark:border-zinc-800 z-50 max-h-[70vh] overflow-y-auto no-scrollbar animate-fade-in">
                                <div className="p-4 border-b dark:border-zinc-900 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Notificações</h4>
                                    {unreadCount > 0 && <span className="text-[9px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold">{unreadCount} novas</span>}
                                </div>
                                {notifications.length > 0 ? notifications.map(n => (
                                    <div key={n.id} className={`flex flex-col p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-b last:border-0 dark:border-zinc-900 transition-colors ${!n.read ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}>
                                        <div className="flex items-start cursor-pointer" onClick={() => { onSelectUser(n.fromUserId); setIsActivityDropdownOpen(false); }}>
                                            <img src={n.fromUserAvatar} className="w-10 h-10 rounded-full object-cover shrink-0 border dark:border-zinc-700"/>
                                            <div className="ml-3 text-xs flex-grow">
                                                <p className="leading-snug"><b>{n.fromUsername}</b> {getNotificationText(n)}</p>
                                                <p className="text-[9px] text-zinc-400 mt-1 uppercase font-bold">Há alguns instantes</p>
                                            </div>
                                            {!n.read && n.type !== 'follow_request' && <div className="w-2 h-2 rounded-full bg-indigo-500 self-center"></div>}
                                        </div>
                                        
                                        {n.type === 'follow_request' && (
                                            <div className="flex gap-2 mt-3 ml-13">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleAcceptRequest(n); }}
                                                    className="flex-1 bg-sky-500 text-white text-[10px] font-black uppercase py-2 rounded-lg shadow-lg shadow-sky-500/10 active:scale-95 transition-all"
                                                >
                                                    {t('header.accept')}
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeclineRequest(n); }}
                                                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-black uppercase py-2 rounded-lg active:scale-95 transition-all"
                                                >
                                                    {t('header.decline')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )) : <div className="p-10 text-center text-xs font-black uppercase text-zinc-400">Nenhuma atividade</div>}
                            </div>
                        )}
                    </div>

                    <button onClick={() => onOpenMessages()} className="hover:scale-110 transition-transform"><svg className="w-7 h-7 text-zinc-800 dark:text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2Z"/></svg></button>
                </nav>
            </div>
            {/* Search Overlay remains same */}
        </header>
    );
};

export default Header;
