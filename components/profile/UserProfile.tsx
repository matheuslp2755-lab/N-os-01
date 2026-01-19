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
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    
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
                const requestSnap = await getDoc(doc(db, 'users', currentUser.uid, 'sentFollowRequests', userId));
                setIsRequested(requestSnap.exists());
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

    const handleUpdateProfile = async (updatedData: any) => {
        if (!currentUser) return;
        setIsSubmittingEdit(true);
        try {
            let avatarUrl = user.avatar;
            if (updatedData.avatarFile) {
                const fileRef = storageRef(storage, `avatars/${currentUser.uid}/${Date.now()}.jpg`);
                await uploadBytes(fileRef, updatedData.avatarFile);
                avatarUrl = await getDownloadURL(fileRef);
            }

            const userRef = doc(db, 'users', currentUser.uid);
            const updates: any = {
                username: updatedData.username,
                username_lowercase: updatedData.username.toLowerCase(),
                nickname: updatedData.nickname,
                bio: updatedData.bio,
                avatar: avatarUrl,
                isPrivate: updatedData.isPrivate,
                profileMusic: updatedData.profileMusic,
                currentVibe: updatedData.currentVibe
            };

            if (updatedData.username !== user.username) {
                updates.lastUsernameChange = serverTimestamp();
            }
            if (updatedData.nickname !== (user.nickname || '')) {
                updates.lastNicknameChange = serverTimestamp();
            }

            await updateDoc(userRef, updates);
            await updateProfile(currentUser, { 
                displayName: updatedData.username, 
                photoURL: avatarUrl 
            });

            setIsEditModalOpen(false);
        } catch (err) {
            console.error("Update Error:", err);
            alert("Erro ao salvar alterações.");
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const handleToggleRadarVisibility = async () => {
        if (!currentUser || !isOwner) return;
        const currentVisibility = user?.appearOnRadar !== false;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
                appearOnRadar: !currentVisibility
            });
            setIsOptionsMenuOpen(false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleFollow = async () => {
        if (!currentUser || !user) return;
        const batch = writeBatch(db);
        if (isFollowing) {
            batch.delete(doc(db, 'users', currentUser.uid, 'following', userId));
            batch.delete(doc(db, 'users', userId, 'followers', currentUser.uid));
            await batch.commit();
            setIsFollowing(false);
        } else {
            const myFollowing = doc(db, 'users', currentUser.uid, 'following', userId);
            const theirFollowers = doc(db, 'users', userId, 'followers', currentUser.uid);
            batch.set(myFollowing, { username: user?.username || 'User', avatar: user?.avatar || '', timestamp: serverTimestamp() });
            batch.set(theirFollowers, { username: currentUser.displayName || 'User', avatar: currentUser.photoURL || '', timestamp: serverTimestamp() });
            await batch.commit();
            setIsFollowing(true);
        }
    };

    const handleDeletePermanentAccount = async () => {
        if (!currentUser || isDeletingAccount) return;
        if (!window.confirm("ATENÇÃO: Esta ação é irreversível. Todos os seus posts, mensagens e dados serão apagados permanentemente. Deseja continuar?")) return;

        setIsDeletingAccount(true);
        try {
            const batch = writeBatch(db);
            const userPosts = await getDocs(query(collection(db, 'posts'), where('userId', '==', currentUser.uid)));
            userPosts.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, 'users', currentUser.uid));
            await batch.commit();
            await signOut(auth);
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir conta.");
            setIsDeletingAccount(false);
        }
    };

    const handleAdminToggleVerify = async () => {
        if (!isAdmin || isAdminActionLoading) return;
        setIsAdminActionLoading(true);
        try {
            await updateDoc(doc(db, 'users', userId), {
                isVerified: !user?.isVerified
            });
            setIsOptionsMenuOpen(false);
        } catch (e) { console.error(e); } finally { setIsAdminActionLoading(false); }
    };

    const handleAdminBanUser = async () => {
        if (!isAdmin || isAdminActionLoading) return;
        if (isOwner) { alert("Você não pode banir a si mesmo."); return; }
        if (!window.confirm(`SOU O DONO: Deseja banir permanentemente o usuário @${user.username}?`)) return;
        
        setIsAdminActionLoading(true);
        try {
            await addDoc(collection(db, 'banned_users_log'), {
                userId,
                username: user.username,
                email: user.email,
                bannedBy: currentUser?.email,
                timestamp: serverTimestamp()
            });

            const batch = writeBatch(db);
            const userPosts = await getDocs(query(collection(db, 'posts'), where('userId', '==', userId)));
            userPosts.forEach(p => batch.delete(p.ref));
            
            batch.update(doc(db, 'users', userId), {
                isBanned: true,
                banTimestamp: serverTimestamp(),
                username: `BANIDO_${user.username}`,
                username_lowercase: `banido_${user.username.toLowerCase()}`
            });

            await batch.commit();
            alert(`O usuário @${user.username} foi banido com sucesso.`);
            setIsOptionsMenuOpen(false);
        } catch (e) { 
            console.error(e); 
            alert("Erro ao executar banimento.");
        } finally { 
            setIsAdminActionLoading(false); 
        }
    };

    const handleReportProfile = async () => {
        if (!currentUser) return;
        const reason = window.prompt("Por que você está denunciando este perfil? (Conteúdo inapropriado, Spam, etc.)");
        if (!reason) return;

        try {
            await addDoc(collection(db, 'reports'), {
                reporterId: currentUser.uid,
                reporterUsername: currentUser.displayName,
                targetUserId: userId,
                targetUsername: user?.username,
                reason,
                type: 'profile',
                timestamp: serverTimestamp(),
                status: 'pending'
            });
            alert("Denúncia enviada com sucesso. Nossa equipe analisará em breve.");
            setIsOptionsMenuOpen(false);
        } catch (e) {
            console.error(e);
            alert("Erro ao enviar denúncia.");
        }
    };

    const handleSignOut = () => {
        signOut(auth);
    };

    if (!user) return <div className="p-8 text-center">{t('messages.loading')}</div>;

    const radarEnabled = user?.appearOnRadar !== false;

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
                                    <button onClick={() => setIsBeamOpen(true)} className="p-2 rounded-xl bg-sky-500 text-white shadow-lg shadow-sky-500/20 active:scale-95 transition-all" title="Néos Beam">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </button>
                                    <div className="relative" ref={optionsMenuRef}>
                                        <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700">
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                        </button>
                                        {isOptionsMenuOpen && (
                                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                                                <button onClick={handleToggleRadarVisibility} className="w-full text-left px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3">
                                                    <div className={`w-3 h-3 rounded-full ${radarEnabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                    {radarEnabled ? 'Aparecer no radar: Ativado' : 'Aparecer no radar: Desativado'}
                                                </button>
                                                
                                                {isAdmin && (
                                                    <>
                                                        <button 
                                                            onClick={handleAdminToggleVerify} 
                                                            className="w-full text-left px-4 py-3 text-sm text-sky-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3 border-t dark:border-zinc-800"
                                                        >
                                                            <VerifiedBadge className="w-4 h-4" />
                                                            {user?.isVerified ? "Remover Verificado" : "Dar Verificado"}
                                                        </button>
                                                        <button 
                                                            onClick={() => setIsAdminDashboardOpen(true)} 
                                                            className="w-full text-left px-4 py-3 text-sm text-indigo-500 font-black hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3 border-t dark:border-zinc-800"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                                            Painel de Controle Néos
                                                        </button>
                                                    </>
                                                )}

                                                <button onClick={handleSignOut} className="w-full text-left px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth={2.5}/></svg>
                                                    {t('profile.logout')}
                                                </button>
                                                <button onClick={handleDeletePermanentAccount} disabled={isDeletingAccount} className="w-full text-left px-4 py-3 text-sm text-red-500 font-black hover:bg-red-50 dark:hover:bg-red-950/20 border-t dark:border-zinc-800 flex items-center gap-3 mt-1">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    Excluir conta Néos permanente
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button onClick={handleFollow} className={`!w-auto ${isFollowing || isRequested ? '!bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white' : ''}`}>
                                        {isFollowing ? t('header.following') : isRequested ? t('header.requested') : t('header.follow')}
                                    </Button>
                                    <Button onClick={() => onStartMessage({ id: userId, ...user })} className="!w-auto !bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white">{t('profile.message')}</Button>
                                    
                                    <div className="relative" ref={optionsMenuRef}>
                                        <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700">
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                        </button>
                                        {isOptionsMenuOpen && (
                                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-950 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                                                {isAdmin && (
                                                    <>
                                                        <button 
                                                            onClick={handleAdminToggleVerify} 
                                                            disabled={isAdminActionLoading}
                                                            className="w-full text-left px-4 py-3 text-sm text-sky-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3"
                                                        >
                                                            <VerifiedBadge className="w-4 h-4" />
                                                            {user?.isVerified ? "Remover Verificado" : "Dar Verificado"}
                                                        </button>
                                                        <button 
                                                            onClick={handleAdminBanUser} 
                                                            disabled={isAdminActionLoading}
                                                            className="w-full text-left px-4 py-3 text-sm text-red-500 font-black hover:bg-red-50 dark:hover:bg-red-950/20 border-t dark:border-zinc-800 flex items-center gap-3"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                                            Banir Usuário Néos
                                                        </button>
                                                    </>
                                                )}
                                                <button onClick={handleReportProfile} className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-3 border-t dark:border-zinc-800">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                    Denunciar Perfil
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-6 justify-center sm:justify-start text-sm mb-4">
                        <p><b>{stats.posts}</b> {t('profile.posts')}</p>
                        <button onClick={() => setIsFollowersModalOpen(true)} className="hover:underline"><b>{stats.followers}</b> {t('profile.followers')}</button>
                        <button onClick={() => setIsFollowingModalOpen(true)} className="hover:underline"><b>{stats.following}</b> {t('profile.followingCount')}</button>
                    </div>
                    {user?.bio && <p className="text-sm font-medium whitespace-pre-wrap max-w-md">{user.bio}</p>}
                </div>
            </header>

            <div className="grid grid-cols-3 gap-2 border-t dark:border-zinc-800 pt-4">
                {posts.map(p => (
                    <div key={p.id} onClick={() => setSelectedPost(p)} className="aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-3xl overflow-hidden cursor-pointer">
                        <img src={p?.imageUrl || p?.media?.[0]?.url} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                    </div>
                ))}
            </div>

            {selectedPost && (
                <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center p-0 md:p-10" onClick={() => setSelectedPost(null)}>
                    <div className="w-full max-w-xl h-full overflow-y-auto no-scrollbar pt-10" onClick={e => e.stopPropagation()}>
                        <Post post={selectedPost} onPostDeleted={(id) => { setSelectedPost(null); setPosts(prev => prev.filter(p => p.id !== id)); }} />
                    </div>
                </div>
            )}

            <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} user={user || {}} onUpdate={handleUpdateProfile} isSubmitting={isSubmittingEdit} />
            <AdminDashboardModal isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} />
            <FollowersModal isOpen={isFollowersModalOpen} onClose={() => setIsFollowersModalOpen(false)} userId={userId} mode="followers" />
            <FollowersModal isOpen={isFollowingModalOpen} onClose={() => setIsFollowingModalOpen(false)} userId={userId} mode="following" />
            <VibeBeamModal isOpen={isBeamOpen} onClose={() => setIsBeamOpen(false)} />
        </div>
    );
};

export default UserProfile;