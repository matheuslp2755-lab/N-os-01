import React, { useState, useEffect } from 'react';
import { auth, db, collection, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import TextInput from '../common/TextInput';
import Button from '../common/Button';

interface ForwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: any;
    onShareToPulse?: (post: any) => void;
}

const ForwardModal: React.FC<ForwardModalProps> = ({ isOpen, onClose, post }) => {
    const { t } = useLanguage();
    const [following, setFollowing] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [sendingTo, setSendingTo] = useState<string[]>([]);
    const [isSharingToPulse, setIsSharingToPulse] = useState(false);
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const fetchFollowing = async () => {
            setLoading(true);
            try {
                const followingRef = collection(db, 'users', currentUser.uid, 'following');
                const snap = await getDocs(followingRef);
                const followingData = await Promise.all(snap.docs.map(async d => {
                    const userSnap = await getDoc(doc(db, 'users', d.id));
                    return { id: d.id, ...userSnap.data() };
                }));
                setFollowing(followingData);
            } catch (error) { console.error(error); } finally { setLoading(false); }
        };
        fetchFollowing();
    }, [isOpen, currentUser]);

    const handleForward = async (targetUser: any) => {
        if (!currentUser || !post || sendingTo.includes(targetUser.id)) return;
        const conversationId = [currentUser.uid, targetUser.id].sort().join('_');
        const conversationRef = doc(db, 'conversations', conversationId);
        try {
            const convSnap = await getDoc(conversationRef);
            if (!convSnap.exists()) {
                await setDoc(conversationRef, {
                    participants: [currentUser.uid, targetUser.id],
                    participantInfo: {
                        [currentUser.uid]: { username: currentUser.displayName, avatar: currentUser.photoURL },
                        [targetUser.id]: { username: targetUser.username, avatar: targetUser.avatar }
                    },
                    timestamp: serverTimestamp()
                });
            }
            await addDoc(collection(conversationRef, 'messages'), {
                senderId: currentUser.uid, 
                text: "", 
                timestamp: serverTimestamp(), 
                mediaType: 'forwarded_post',
                forwardedPostData: {
                    postId: post.id,
                    imageUrl: post.imageUrl || (post.media && post.media[0].url),
                    originalPosterUsername: post.username,
                    originalPosterAvatar: post.userAvatar,
                    caption: post.caption
                }
            });
            await updateDoc(conversationRef, {
                lastMessage: { text: `↪️ ${t('messages.forwardedPost')}`, senderId: currentUser.uid, timestamp: serverTimestamp(), mediaType: 'forwarded_post' },
                timestamp: serverTimestamp()
            });
            setSendingTo(prev => [...prev, targetUser.id]);
        } catch (error) { console.error(error); }
    };

    const handleShareToPulse = async () => {
        if (!currentUser || !post || isSharingToPulse) return;
        setIsSharingToPulse(true);
        try {
            await addDoc(collection(db, 'pulses'), {
                authorId: currentUser.uid,
                mediaUrl: post.imageUrl || (post.media && post.media[0].url),
                createdAt: serverTimestamp(),
                caption: `Repostado de @${post.username}`,
                isRepost: true,
                originalAuthorId: post.userId,
                originalPostId: post.id
            });
            alert("Publicação compartilhada no seu Pulse!");
            onClose();
        } catch (e) {
            console.error(e);
            alert("Erro ao compartilhar.");
        } finally {
            setIsSharingToPulse(false);
        }
    };

    if (!isOpen) return null;
    const filteredUsers = following.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b dark:border-zinc-800 text-center relative">
                    <div className="w-12 h-1.5 bg-zinc-200 dark:border-zinc-800 rounded-full mx-auto mb-4 sm:hidden"></div>
                    <h3 className="font-black text-sm uppercase tracking-widest">{t('forwardModal.title')}</h3>
                    <button onClick={onClose} className="absolute right-6 top-6 text-zinc-400 hover:text-zinc-600 transition-colors text-2xl font-light">&times;</button>
                </header>
                
                <div className="p-4 flex flex-col gap-4">
                    <button 
                        onClick={handleShareToPulse}
                        disabled={isSharingToPulse}
                        className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border border-sky-500/20 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                            {isSharingToPulse ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m8-8H4" /></svg>
                            )}
                        </div>
                        <div className="text-left">
                            <p className="font-black text-xs uppercase tracking-widest text-sky-600 dark:text-sky-400">{t('header.createPulse')}</p>
                            <p className="text-[10px] font-bold text-zinc-500">Compartilhe na sua história</p>
                        </div>
                    </button>

                    <TextInput 
                        id="forward-search" 
                        label={t('forwardModal.search')} 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        className="!rounded-2xl !bg-zinc-100 dark:!bg-zinc-900 border-none"
                    />
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar">
                    {loading ? (
                        <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div></div>
                    ) : filteredUsers.length === 0 ? (
                        <p className="text-center text-zinc-500 font-bold text-xs py-10 opacity-50 uppercase tracking-widest">{t('forwardModal.noResults')}</p>
                    ) : (
                        filteredUsers.map(user => (
                            <div key={user.id} className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-2xl transition-all group">
                                <div className="flex items-center gap-3">
                                    <img src={user.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-transparent group-hover:border-sky-500/30 transition-all" />
                                    <span className="font-bold text-sm">{user.username}</span>
                                </div>
                                <Button 
                                    onClick={() => handleForward(user)} 
                                    disabled={sendingTo.includes(user.id)}
                                    className={`!w-auto !py-2 !px-5 !text-[10px] !font-black !uppercase !tracking-widest !rounded-xl ${sendingTo.includes(user.id) ? '!bg-zinc-100 !text-zinc-400 dark:!bg-zinc-800' : ''}`}
                                >
                                    {sendingTo.includes(user.id) ? t('forwardModal.sent') : t('forwardModal.send')}
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForwardModal;