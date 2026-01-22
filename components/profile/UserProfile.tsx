
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, getDoc, collection, deleteDoc, serverTimestamp, updateDoc, onSnapshot, query, where, writeBatch, addDoc, setDoc, storage, storageRef, uploadBytes, getDownloadURL } from '../../firebase';
import { signOut } from 'firebase/auth';
import Button from '../common/Button';
import EditProfileModal from './EditProfileModal';
import FollowersModal from './FollowersModal';
import OnlineIndicator from '../common/OnlineIndicator';
import { useLanguage } from '../../context/LanguageContext';
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
    const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
    const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
    
    const currentUser = auth.currentUser;
    const isOwner = currentUser?.uid === userId;
    const isAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOptionsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const userRef = doc(db, 'users', userId);
        const unsub = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const userData = doc.data();
                setUser(userData);
                const lastSeen = userData.lastSeen;
                const isUserOnline = lastSeen && (Date.now() / 1000 - lastSeen.seconds) < 120;
                setIsOnline(!!isUserOnline);
            }
        });
        return () => unsub();
    }, [userId]);

    // FIX: Listeners para estatísticas reais
    useEffect(() => {
        const postsQ = query(collection(db, 'posts'), where('userId', '==', userId));
        const unsubPosts = onSnapshot(postsQ, (snap) => {
            setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
            setStats(prev => ({ ...prev, posts: snap.size }));
        });

        const followersQ = collection(db, 'users', userId, 'followers');
        const unsubFollowers = onSnapshot(followersQ, (snap) => {
            setStats(prev => ({ ...prev, followers: snap.size }));
        });

        const followingQ = collection(db, 'users', userId, 'following');
        const unsubFollowing = onSnapshot(followingQ, (snap) => {
            setStats(prev => ({ ...prev, following: snap.size }));
        });

        return () => { unsubPosts(); unsubFollowers(); unsubFollowing(); };
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
            };
            await updateDoc(doc(db, 'users', userId), payload);
            setIsEditModalOpen(false);
        } catch (e) { alert("Erro ao salvar."); } finally { setIsSubmitting(false); }
    };

    const handleFollow = async () => {
        if (!currentUser || !user) return;
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', currentUser.uid, 'following', userId), { username: user.username, avatar: user.avatar, timestamp: serverTimestamp() });
        batch.set(doc(db, 'users', userId, 'followers', currentUser.uid), { username: currentUser.displayName, avatar: currentUser.photoURL, timestamp: serverTimestamp() });
        await batch.commit();
    };

    if (!user) return <div className="p-8 text-center">Carregando perfil...</div>;

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <header className="flex flex-col sm:flex-row items-center gap-8 mb-8 relative">
                <div className="relative w-32 h-32 flex-shrink-0 p-1 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500">
                    <div className="w-full h-full rounded-full p-1 bg-white dark:bg-black">
                        <img src={user?.avatar} className="w-full h-full rounded-full object-cover" alt="Avatar" />
                    </div>
                    {isOnline && <OnlineIndicator />}
                </div>
                
                <div className="flex-grow text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                        <h2 className="text-2xl font-black flex items-center tracking-tight">
                            {user?.username}
                            {user?.isVerified && <VerifiedBadge className="w-5 h-5 ml-1" />}
                        </h2>
                        
                        <div className="flex items-center gap-2">
                            {isOwner ? (
                                <Button onClick={() => setIsEditModalOpen(true)} className="!w-auto !bg-zinc-100 dark:!bg-zinc-800 !text-black dark:!text-white !px-6 !py-2 !rounded-xl !font-bold">Editar Perfil</Button>
                            ) : (
                                <>
                                    <Button onClick={handleFollow} className="!w-auto !px-8 !py-2 !rounded-xl">Seguir</Button>
                                    <Button onClick={() => onStartMessage(user)} className="!w-auto !bg-zinc-100 dark:!bg-zinc-800 !text-black dark:!text-white !px-6 !py-2 !rounded-xl">Mensagem</Button>
                                </>
                            )}
                            
                            <div className="relative" ref={menuRef}>
                                <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border dark:border-zinc-700 hover:bg-zinc-200 transition-colors">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                </button>
                                {isOptionsMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] py-2 overflow-hidden animate-slide-up">
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => { setIsAdminDashboardOpen(true); setIsOptionsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold flex items-center gap-3">Painel Néos</button>
                                                <button onClick={async () => { await updateDoc(doc(db, 'users', userId), { isVerified: !user.isVerified }); setIsOptionsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-sky-500">{user.isVerified ? 'Remover Verificado' : 'Dar Verificado'}</button>
                                            </>
                                        )}
                                        {isOwner && <button onClick={() => signOut(auth)} className="w-full text-left px-4 py-3 text-sm text-red-500 font-bold">Sair da Conta</button>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-6 justify-center sm:justify-start text-sm mb-4 font-bold uppercase tracking-tighter">
                        <p><span className="text-lg">{stats.posts}</span> publicações</p>
                        <button onClick={() => setIsFollowersModalOpen(true)} className="hover:text-sky-500 transition-colors"><span className="text-lg">{stats.followers}</span> seguidores</button>
                        <button onClick={() => setIsFollowingModalOpen(true)} className="hover:text-sky-500 transition-colors"><span className="text-lg">{stats.following}</span> seguindo</button>
                    </div>
                    <p className="text-sm font-medium leading-relaxed max-w-md mx-auto sm:mx-0">{user.bio}</p>
                </div>
            </header>

            <div className="grid grid-cols-3 gap-1 border-t dark:border-zinc-800 pt-6">
                {posts.map(p => (
                    <div key={p.id} className="aspect-square bg-zinc-100 dark:bg-zinc-900 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                        <img src={p?.imageUrl} className="w-full h-full object-cover" alt="Post" />
                    </div>
                ))}
            </div>

            <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} user={user} onUpdate={handleUpdateProfile} isSubmitting={isSubmitting} />
            <AdminDashboardModal isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} />
            <FollowersModal isOpen={isFollowersModalOpen} onClose={() => setIsFollowersModalOpen(false)} userId={userId} mode="followers" />
            <FollowersModal isOpen={isFollowingModalOpen} onClose={() => setIsFollowingModalOpen(false)} userId={userId} mode="following" />
        </div>
    );
};

export default UserProfile;
