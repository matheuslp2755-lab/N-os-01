
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, updateDoc, onSnapshot, query, where, writeBatch, addDoc, storage, storageRef, uploadBytes, getDownloadURL } from '../../firebase';
import { signOut, updateProfile } from 'firebase/auth';
import Button from '../common/Button';
import EditProfileModal from './EditProfileModal';
import FollowersModal from './FollowersModal';
import OnlineIndicator from '../common/OnlineIndicator';
import { useLanguage } from '../../context/LanguageContext';
import Post from '../feed/Post';
import VibeBeamModal from '../feed/VibeBeamModal';
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
    const [isBeamOpen, setIsBeamOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
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

            if (currentUser) {
                const followSnap = await getDoc(doc(db, 'users', currentUser.uid, 'following', userId));
                setIsFollowing(followSnap.exists());
            }

            const postsQ = query(collection(db, 'posts'), where('userId', '==', userId));
            unsubscribePosts = onSnapshot(postsQ, (snap) => {
                setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
                setStats(prev => ({ ...prev, posts: snap.size }));
            });

            const fers = await getDocs(collection(db, 'users', userId, 'followers'));
            const fing = await getDocs(collection(db, 'users', userId, 'following'));
            setStats(prev => ({ ...prev, followers: fers.size, following: fing.size }));
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
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userId, currentUser]);

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

    const handleSendSystemAlert = async (isGlobal: boolean) => {
        if (!isAdmin || isAdminActionLoading) return;
        const message = window.prompt(isGlobal ? "MENSAGEM PARA TODOS OS USUÁRIOS (Feed):" : `MENSAGEM PARA @${user.username} (Feed):`);
        if (!message || !message.trim()) return;

        setIsAdminActionLoading(true);
        try {
            if (isGlobal) {
                const usersSnap = await getDocs(collection(db, 'users'));
                const batch = writeBatch(db);
                usersSnap.docs.forEach(uDoc => {
                    const alertRef = doc(collection(db, 'notifications_in_app'));
                    batch.set(alertRef, {
                        recipientId: uDoc.id,
                        title: "Aviso da Néos",
                        body: message,
                        type: 'system',
                        read: false,
                        timestamp: serverTimestamp()
                    });
                });
                await batch.commit();
            } else {
                await addDoc(collection(db, 'notifications_in_app'), {
                    recipientId: userId,
                    title: "Mensagem do Admin",
                    body: message,
                    type: 'system',
                    read: false,
                    timestamp: serverTimestamp()
                });
            }
            setIsOptionsMenuOpen(false);
        } catch (e) { console.error(e); } finally { setIsAdminActionLoading(false); }
    };

    if (!user) return <div className="p-8 text-center">{t('messages.loading')}</div>;

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
                                                    <>
                                                        <button onClick={() => handleSendSystemAlert(true)} className="w-full text-left px-4 py-3 text-sm text-indigo-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b dark:border-zinc-800">Alerta Global</button>
                                                        <button onClick={() => setIsAdminDashboardOpen(true)} className="w-full text-left px-4 py-3 text-sm text-sky-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">Painel Néos</button>
                                                    </>
                                                )}
                                                <button onClick={() => signOut(auth)} className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">{t('profile.logout')}</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button className="!w-auto">Seguir</Button>
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
                                                        <button onClick={() => handleSendSystemAlert(false)} className="w-full text-left px-4 py-3 text-sm text-indigo-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b dark:border-zinc-800">Enviar Alerta</button>
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

            <div className="grid grid-cols-3 gap-2 border-t dark:border-zinc-800 pt-4">
                {posts.map(p => (
                    <div key={p.id} onClick={() => setSelectedPost(p)} className="aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-3xl overflow-hidden cursor-pointer">
                        <img src={p?.imageUrl || p?.media?.[0]?.url} className="w-full h-full object-cover" />
                    </div>
                ))}
            </div>

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
