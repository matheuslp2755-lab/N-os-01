
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, updateDoc, onSnapshot, query, where, writeBatch, addDoc, setDoc } from '../../firebase';
import { signOut } from 'firebase/auth';
import Button from '../common/Button';
import EditProfileModal from './EditProfileModal';
import FollowersModal from './FollowersModal';
import OnlineIndicator from '../common/OnlineIndicator';
import { useLanguage } from '../../context/LanguageContext';
import Post from '../feed/Post';
import AdminDashboardModal from './AdminDashboardModal';

interface UserProfileProps {
    userId: string;
    onStartMessage: (user: any) => void;
    onSelectUser?: (userId: string) => void;
}

export const VerifiedBadge = ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={`${className} text-sky-500 fill-current inline-block ml-1`} viewBox="0 0 24 24" aria-label="Verificado">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
);

const ADMIN_EMAIL = "Matheuslp2755@gmail.com";

const UserProfile: React.FC<UserProfileProps> = ({ userId, onStartMessage, onSelectUser }) => {
    const { t } = useLanguage();
    const [user, setUser] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
    const [isFollowing, setIsFollowing] = useState(false);
    const [isRequested, setIsRequested] = useState(false);
    const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [isAdminActionLoading, setIsAdminActionLoading] = useState(false);
    
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
    const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
    
    const currentUser = auth.currentUser;
    const isOwner = currentUser?.uid === userId;
    const isAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    
    const optionsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let unsubscribePosts: (() => void) | undefined;
        let unsubscribeUser: (() => void) | undefined;
        let unsubscribeFollow: (() => void) | undefined;
        let unsubscribeRequest: (() => void) | undefined;

        const fetchUserData = async () => {
            const userRef = doc(db, 'users', userId);
            unsubscribeUser = onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    setUser(userData);
                    const lastSeen = userData.lastSeen;
                    const isUserOnline = lastSeen && (Date.now() / 1000 - lastSeen.seconds) < 120;
                    setIsOnline(!!isUserOnline);
                }
            });

            if (currentUser && !isOwner) {
                // Monitorar se sigo este usuário
                unsubscribeFollow = onSnapshot(doc(db, 'users', currentUser.uid, 'following', userId), (doc) => {
                    setIsFollowing(doc.exists());
                });

                // Monitorar se solicitei seguir (para contas privadas)
                unsubscribeRequest = onSnapshot(doc(db, 'users', currentUser.uid, 'sentFollowRequests', userId), (doc) => {
                    setIsRequested(doc.exists());
                });
            }

            const postsQ = query(collection(db, 'posts'), where('userId', '==', userId));
            unsubscribePosts = onSnapshot(postsQ, (snap) => {
                setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
                setStats(prev => ({ ...prev, posts: snap.size }));
            });

            // Listeners para contagem de seguidores/seguindo
            const unsubFollowers = onSnapshot(collection(db, 'users', userId, 'followers'), (snap) => {
                setStats(prev => ({ ...prev, followers: snap.size }));
            });
            const unsubFollowing = onSnapshot(collection(db, 'users', userId, 'following'), (snap) => {
                setStats(prev => ({ ...prev, following: snap.size }));
            });

            return () => {
                unsubFollowers();
                unsubFollowing();
            };
        };
        fetchUserData();

        const handleClickOutside = (e: MouseEvent) => {
            if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
                setIsOptionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            if (unsubscribePosts) unsubscribePosts();
            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeFollow) unsubscribeFollow();
            if (unsubscribeRequest) unsubscribeRequest();
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userId, currentUser, isOwner]);

    const handleFollow = async () => {
        if (!currentUser || !user) return;

        if (isFollowing) {
            // Unfollow
            const batch = writeBatch(db);
            batch.delete(doc(db, 'users', currentUser.uid, 'following', userId));
            batch.delete(doc(db, 'users', userId, 'followers', currentUser.uid));
            await batch.commit();
            return;
        }

        if (isRequested) {
            // Cancelar solicitação
            const batch = writeBatch(db);
            batch.delete(doc(db, 'users', currentUser.uid, 'sentFollowRequests', userId));
            batch.delete(doc(db, 'users', userId, 'followRequests', currentUser.uid));
            await batch.commit();
            return;
        }

        if (user.isPrivate) {
            // Enviar Solicitação
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', currentUser.uid, 'sentFollowRequests', userId), {
                username: user.username,
                avatar: user.avatar,
                timestamp: serverTimestamp()
            });
            batch.set(doc(db, 'users', userId, 'followRequests', currentUser.uid), {
                username: currentUser.displayName,
                avatar: currentUser.photoURL,
                timestamp: serverTimestamp()
            });
            // Criar Notificação no Coração
            const notifRef = doc(collection(db, 'users', userId, 'notifications'));
            batch.set(notifRef, {
                type: 'follow_request',
                fromUserId: currentUser.uid,
                fromUsername: currentUser.displayName,
                fromUserAvatar: currentUser.photoURL,
                read: false,
                timestamp: serverTimestamp()
            });
            await batch.commit();
        } else {
            // Seguir direto (Conta Pública)
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', currentUser.uid, 'following', userId), {
                username: user.username,
                avatar: user.avatar,
                timestamp: serverTimestamp()
            });
            batch.set(doc(db, 'users', userId, 'followers', currentUser.uid), {
                username: currentUser.displayName,
                avatar: currentUser.photoURL,
                timestamp: serverTimestamp()
            });
            // Notificação simples de "começou a te seguir"
            const notifRef = doc(collection(db, 'users', userId, 'notifications'));
            batch.set(notifRef, {
                type: 'follow',
                fromUserId: currentUser.uid,
                fromUsername: currentUser.displayName,
                fromUserAvatar: currentUser.photoURL,
                read: false,
                timestamp: serverTimestamp()
            });
            await batch.commit();
        }
    };

    const handleAdminToggleVerify = async () => {
        if (!isAdmin) return;
        setIsAdminActionLoading(true);
        try {
            await updateDoc(doc(db, 'users', userId), { isVerified: !user?.isVerified });
            setIsOptionsMenuOpen(false);
        } catch (e) { console.error(e); } finally { setIsAdminActionLoading(false); }
    };

    const handleAdminBanUser = async () => {
        if (!isAdmin || isOwner) return;
        if (!window.confirm(`Deseja banir permanentemente o usuário @${user.username}?`)) return;
        setIsAdminActionLoading(true);
        try {
            const batch = writeBatch(db);
            const userPosts = await getDocs(query(collection(db, 'posts'), where('userId', '==', userId)));
            userPosts.forEach(p => batch.delete(p.ref));
            batch.update(doc(db, 'users', userId), {
                isBanned: true,
                username: `BANIDO_${user.username}`,
                username_lowercase: `banido_${user.username.toLowerCase()}`
            });
            await batch.commit();
            alert("Usuário banido com sucesso.");
            setIsOptionsMenuOpen(false);
        } catch (e) { console.error(e); } finally { setIsAdminActionLoading(false); }
    };

    if (!user) return <div className="p-8 text-center">{t('messages.loading')}</div>;

    const showContent = !user.isPrivate || isFollowing || isOwner;

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <header className="flex flex-col sm:flex-row items-center gap-8 mb-8 relative">
                <div className={`relative w-32 h-32 flex-shrink-0 cursor-pointer p-1 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500`}>
                    <div className="w-full h-full rounded-full p-1 bg-white dark:bg-black">
                        <img src={user?.avatar || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="w-full h-full rounded-full object-cover" />
                    </div>
                    {isOnline && <OnlineIndicator />}
                </div>
                <div className="flex-grow text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-4 mb-2">
                        <h2 className="text-2xl font-light flex items-center">
                            {user?.username || 'User'}
                            {user?.isVerified && <VerifiedBadge className="w-5 h-5 ml-1" />}
                        </h2>
                        <div className="flex gap-2 relative">
                            {isOwner ? (
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => setIsEditModalOpen(true)} className="!w-auto !bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white !font-bold">
                                        {t('profile.editProfile')}
                                    </Button>
                                    <div className="relative" ref={optionsMenuRef}>
                                        <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700">
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                        </button>
                                        {isOptionsMenuOpen && (
                                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                                                {isAdmin && (
                                                    <button onClick={() => setIsAdminDashboardOpen(true)} className="w-full text-left px-4 py-3 text-sm text-sky-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">Painel Néos</button>
                                                )}
                                                <button onClick={() => signOut(auth)} className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('profile.logout')}</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button 
                                        onClick={handleFollow}
                                        className={`!w-auto !px-8 ${isFollowing || isRequested ? '!bg-zinc-200 !text-black dark:!bg-zinc-800 dark:!text-white' : '!bg-sky-500 !text-white'}`}
                                    >
                                        {isFollowing ? t('header.following') : isRequested ? t('header.requested') : user.isPrivate ? 'Enviar Solicitação' : t('header.follow')}
                                    </Button>
                                    <Button onClick={() => onStartMessage(user)} className="!w-auto !bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white">Mensagem</Button>
                                    <div className="relative" ref={optionsMenuRef}>
                                        <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700">
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                        </button>
                                        {isOptionsMenuOpen && (
                                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                                                {isAdmin && (
                                                    <>
                                                        <button onClick={handleAdminToggleVerify} className="w-full text-left px-4 py-3 text-sm text-sky-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b dark:border-zinc-800">
                                                            {user.isVerified ? "Remover Verificado" : "Dar Verificado"}
                                                        </button>
                                                        <button onClick={handleAdminBanUser} className="w-full text-left px-4 py-3 text-sm text-red-500 font-black hover:bg-red-50 dark:hover:bg-red-950/20">Banir Usuário</button>
                                                    </>
                                                )}
                                                <button className="w-full text-left px-4 py-3 text-sm text-red-500 font-bold">Denunciar Perfil</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-6 justify-center sm:justify-start text-sm mb-4 font-medium">
                        <p><b>{stats.posts}</b> publicações</p>
                        <button onClick={() => setIsFollowersModalOpen(true)}><b>{stats.followers}</b> seguidores</button>
                        <button onClick={() => setIsFollowingModalOpen(true)}><b>{stats.following}</b> seguindo</button>
                    </div>
                    {user?.bio && <p className="text-sm font-medium whitespace-pre-wrap max-w-md">{user.bio}</p>}
                </div>
            </header>

            {showContent ? (
                <div className="grid grid-cols-3 gap-2 border-t dark:border-zinc-800 pt-4">
                    {posts.map(p => (
                        <div key={p.id} onClick={() => setSelectedPost(p)} className="aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-3xl overflow-hidden cursor-pointer">
                            <img src={p?.imageUrl || p?.media?.[0]?.url} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="border-t dark:border-zinc-800 pt-20 text-center flex flex-col items-center gap-4 opacity-50">
                    <div className="w-20 h-20 rounded-full border-4 border-zinc-300 flex items-center justify-center">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h3 className="font-black text-xl uppercase tracking-tighter">{t('profile.privateAccountMessage')}</h3>
                    <p className="text-sm font-medium">{t('profile.privateAccountSuggestion')}</p>
                </div>
            )}

            {selectedPost && (
                <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center p-0 md:p-10" onClick={() => setSelectedPost(null)}>
                    <div className="w-full max-w-xl h-full overflow-y-auto no-scrollbar pt-10" onClick={e => e.stopPropagation()}>
                        <Post post={selectedPost} onPostDeleted={() => {}} />
                    </div>
                </div>
            )}

            <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} user={user} onUpdate={async () => {}} isSubmitting={false} />
            <AdminDashboardModal isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} />
            <FollowersModal isOpen={isFollowersModalOpen} onClose={() => setIsFollowersModalOpen(false)} userId={userId} mode="followers" />
            <FollowersModal isOpen={isFollowingModalOpen} onClose={() => setIsFollowingModalOpen(false)} userId={userId} mode="following" />
        </div>
    );
};

export default UserProfile;
