
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, updateDoc, onSnapshot, query, where, writeBatch, addDoc, setDoc, storage, storageRef, uploadBytes, getDownloadURL } from '../../firebase';
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
    const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
    
    const currentUser = auth.currentUser;
    const isOwner = currentUser?.uid === userId;
    const isAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    
    const optionsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let unsubscribeUser: (() => void) | undefined;
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
        return () => unsubscribeUser?.();
    }, [userId]);

    useEffect(() => {
        const postsQ = query(collection(db, 'posts'), where('userId', '==', userId));
        const unsub = onSnapshot(postsQ, (snap) => {
            setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
            setStats(prev => ({ ...prev, posts: snap.size }));
        });
        return () => unsub();
    }, [userId]);

    const handleUpdateProfile = async (updatedData: any) => {
        if (!currentUser || !isOwner) return;
        setIsSubmitting(true);
        try {
            let avatarUrl = user.avatar;
            if (updatedData.avatarFile) {
                const avatarRef = storageRef(storage, `avatars/${userId}/avatar_${Date.now()}.jpg`);
                await uploadBytes(avatarRef, updatedData.avatarFile);
                avatarUrl = await getDownloadURL(avatarRef);
            }

            const payload: any = {
                username: updatedData.username,
                username_lowercase: updatedData.username.toLowerCase(),
                nickname: updatedData.nickname,
                bio: updatedData.bio,
                avatar: avatarUrl,
                isPrivate: updatedData.isPrivate,
                currentVibe: updatedData.currentVibe,
                profileMusic: updatedData.profileMusic
            };

            await updateDoc(doc(db, 'users', userId), payload);
            setIsEditModalOpen(false);
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar alterações.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFollow = async () => {
        if (!currentUser || !user) return;

        if (isFollowing) {
            const batch = writeBatch(db);
            batch.delete(doc(db, 'users', currentUser.uid, 'following', userId));
            batch.delete(doc(db, 'users', userId, 'followers', currentUser.uid));
            await batch.commit();
            return;
        }

        if (user.isPrivate) {
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', currentUser.uid, 'sentFollowRequests', userId), { username: user.username, avatar: user.avatar, timestamp: serverTimestamp() });
            batch.set(doc(db, 'users', userId, 'followRequests', currentUser.uid), { username: currentUser.displayName, avatar: currentUser.photoURL, timestamp: serverTimestamp() });
            await batch.commit();
        } else {
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', currentUser.uid, 'following', userId), { username: user.username, avatar: user.avatar, timestamp: serverTimestamp() });
            batch.set(doc(db, 'users', userId, 'followers', currentUser.uid), { username: currentUser.displayName, avatar: currentUser.photoURL, timestamp: serverTimestamp() });
            await batch.commit();
        }
    };

    const handleAdminBanUser = async () => {
        if (!isAdmin || isOwner) return;
        const reason = window.prompt("Digite o motivo do banimento para o usuário:");
        if (reason === null) return;

        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'users', userId), {
                isBanned: true,
                banReason: reason,
                username: `BANIDO_${user.username}`,
                username_lowercase: `banido_${user.username.toLowerCase()}`
            });
            
            // Notificação de sistema para o usuário alvo
            await addDoc(collection(db, 'notifications_in_app'), {
                recipientId: userId,
                title: 'Acesso Restrito',
                body: `Sua conta foi suspensa por: ${reason}`,
                type: 'system',
                read: false,
                timestamp: serverTimestamp()
            });

            await batch.commit();
            alert("Usuário banido e notificado.");
            setIsOptionsMenuOpen(false);
        } catch (e) { console.error(e); }
    };

    if (!user) return <div className="p-8 text-center">{t('messages.loading')}</div>;

    const showContent = !user.isPrivate || isFollowing || isOwner;

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <header className="flex flex-col sm:flex-row items-center gap-8 mb-8 relative">
                <div className={`relative w-32 h-32 flex-shrink-0 p-1 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500`}>
                    <div className="w-full h-full rounded-full p-1 bg-white dark:bg-black">
                        <img src={user?.avatar} className="w-full h-full rounded-full object-cover" />
                    </div>
                    {isOnline && <OnlineIndicator />}
                </div>
                <div className="flex-grow text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-4 mb-2">
                        <h2 className="text-2xl font-light flex items-center">
                            {user?.username}
                            {user?.isVerified && <VerifiedBadge className="w-5 h-5 ml-1" />}
                        </h2>
                        <div className="flex gap-2">
                            {isOwner ? (
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => setIsEditModalOpen(true)} className="!w-auto !bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white !font-bold">
                                        Editar Perfil
                                    </Button>
                                    <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700">
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button onClick={handleFollow} className="!w-auto !px-8">Seguir</Button>
                                    <Button onClick={() => onStartMessage(user)} className="!w-auto !bg-zinc-200 dark:!bg-zinc-700 !text-black dark:!text-white">Mensagem</Button>
                                    {isAdmin && (
                                        <button onClick={handleAdminBanUser} className="p-2 bg-red-500 text-white rounded-xl">Banir</button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-6 justify-center sm:justify-start text-sm mb-4 font-medium">
                        <p><b>{stats.posts}</b> publicações</p>
                        <button onClick={() => setIsFollowersModalOpen(true)}><b>{stats.followers}</b> seguidores</button>
                        <button onClick={() => setIsFollowingModalOpen(true)}><b>{stats.following}</b> seguindo</button>
                    </div>
                    <p className="text-sm font-medium">{user.bio}</p>
                </div>
            </header>

            {showContent ? (
                <div className="grid grid-cols-3 gap-2 border-t dark:border-zinc-800 pt-4">
                    {posts.map(p => (
                        <div key={p.id} onClick={() => setSelectedPost(p)} className="aspect-square bg-zinc-100 dark:bg-zinc-900 rounded-3xl overflow-hidden cursor-pointer">
                            <img src={p?.imageUrl} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center p-20 opacity-50">Conta Privada</div>
            )}

            {isEditModalOpen && (
                <EditProfileModal 
                    isOpen={isEditModalOpen} 
                    onClose={() => setIsEditModalOpen(false)} 
                    user={user} 
                    onUpdate={handleUpdateProfile} 
                    isSubmitting={isSubmitting} 
                />
            )}
        </div>
    );
};

export default UserProfile;
