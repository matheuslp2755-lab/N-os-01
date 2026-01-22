
import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, collection, onSnapshot, query, where, writeBatch, serverTimestamp, updateDoc } from '../../firebase';
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
    <svg className={`${className} text-sky-500 fill-current inline-block ml-1`} viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
);

const ADMIN_EMAIL = "Matheuslp2755@gmail.com";

const UserProfile: React.FC<UserProfileProps> = ({ userId, onStartMessage }) => {
    const [user, setUser] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
    const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
    const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
    const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
    const [followMode, setFollowMode] = useState<'followers' | 'following'>('followers');

    const currentUser = auth.currentUser;
    const isOwner = currentUser?.uid === userId;
    const isSystemAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubUser = onSnapshot(doc(db, 'users', userId), (snap) => {
            if (snap.exists()) setUser(snap.data());
        });
        
        const postsQ = query(collection(db, 'posts'), where('userId', '==', userId));
        const unsubPosts = onSnapshot(postsQ, (snap) => {
            setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setStats(prev => ({ ...prev, posts: snap.size }));
        });

        const unsubFollowers = onSnapshot(collection(db, 'users', userId, 'followers'), (snap) => {
            setStats(prev => ({ ...prev, followers: snap.size }));
        });

        const unsubFollowing = onSnapshot(collection(db, 'users', userId, 'following'), (snap) => {
            setStats(prev => ({ ...prev, following: snap.size }));
        });

        return () => { unsubUser(); unsubPosts(); unsubFollowers(); unsubFollowing(); };
    }, [userId]);

    const handleFollow = async () => {
        if (!currentUser || !user) return;
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', currentUser.uid, 'following', userId), { username: user.username, avatar: user.avatar, timestamp: serverTimestamp() });
        batch.set(doc(db, 'users', userId, 'followers', currentUser.uid), { username: currentUser.displayName, avatar: currentUser.photoURL, timestamp: serverTimestamp() });
        await batch.commit();
    };

    if (!user) return <div className="p-8 text-center text-zinc-500">Carregando...</div>;

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-8">
            <header className="flex flex-col sm:flex-row items-center gap-8 mb-12">
                <div className="relative w-32 h-32 flex-shrink-0 p-1 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500">
                    <img src={user.avatar} className="w-full h-full rounded-full object-cover border-4 border-white dark:border-black" />
                </div>
                
                <div className="flex-grow text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                        <h2 className="text-2xl font-black flex items-center">
                            {user.username}
                            {user.isVerified && <VerifiedBadge className="w-5 h-5 ml-1" />}
                        </h2>
                        <div className="flex gap-2">
                            {isOwner ? (
                                <Button onClick={() => setIsEditModalOpen(true)} className="!w-auto !bg-zinc-100 dark:!bg-zinc-800 !text-black dark:!text-white !px-6 !rounded-xl !font-bold">Editar Perfil</Button>
                            ) : (
                                <Button onClick={handleFollow} className="!w-auto !px-8 !rounded-xl">Seguir</Button>
                            )}
                            <div className="relative" ref={menuRef}>
                                <button onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)} className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border dark:border-zinc-700">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>
                                </button>
                                {isOptionsMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl shadow-2xl z-50 py-2">
                                        {isSystemAdmin && (
                                            <>
                                                <button onClick={() => { setIsAdminDashboardOpen(true); setIsOptionsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-bold">Central de Denúncias</button>
                                                <button onClick={async () => { await updateDoc(doc(db, 'users', userId), { isVerified: !user.isVerified }); setIsOptionsMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-bold text-sky-500">Alternar Verificado</button>
                                            </>
                                        )}
                                        {isOwner && <button onClick={() => signOut(auth)} className="w-full text-left px-4 py-3 text-sm text-red-500 font-bold">Sair</button>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-8 justify-center sm:justify-start text-sm font-bold uppercase tracking-tighter">
                        <p><span>{stats.posts}</span> publicações</p>
                        <button onClick={() => { setFollowMode('followers'); setIsFollowersModalOpen(true); }} className="hover:text-sky-500 transition-colors"><span>{stats.followers}</span> seguidores</button>
                        <button onClick={() => { setFollowMode('following'); setIsFollowingModalOpen(true); }} className="hover:text-sky-500 transition-colors"><span>{stats.following}</span> seguindo</button>
                    </div>
                    <p className="mt-4 text-zinc-500 font-medium">{user.bio}</p>
                </div>
            </header>

            <div className="grid grid-cols-3 gap-1 border-t dark:border-zinc-800 pt-8">
                {posts.map(p => (
                    <div key={p.id} className="aspect-square bg-zinc-100 dark:bg-zinc-900 overflow-hidden cursor-pointer">
                        <img src={p.imageUrl} className="w-full h-full object-cover" />
                    </div>
                ))}
            </div>

            <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} user={user} onUpdate={async (data) => {}} isSubmitting={false} />
            <AdminDashboardModal isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} />
            <FollowersModal isOpen={isFollowersModalOpen || isFollowingModalOpen} onClose={() => { setIsFollowersModalOpen(false); setIsFollowingModalOpen(false); }} userId={userId} mode={followMode} />
        </div>
    );
};

export default UserProfile;
