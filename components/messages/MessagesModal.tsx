
import React, { useState, useEffect } from 'react';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import NewMessage from './NewMessage';
import { auth, db, doc, getDoc, setDoc, serverTimestamp, updateDoc, onSnapshot, collection, addDoc, query, where, orderBy, limit, getDocs, deleteDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import TextAreaInput from '../common/TextAreaInput';
import Button from '../common/Button';
import { useTimeAgo } from '../../hooks/useTimeAgo';

interface MessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTargetUser: { id: string, username: string, avatar: string } | null;
  initialConversationId: string | null;
}

type DiaryEntry = {
    id: string;
    userId: string;
    username: string;
    userAvatar: string;
    text: string;
    createdAt: { seconds: number; nanoseconds: number };
};

const XIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const AnonIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm0 10c-3.866 0-7 1.79-7 4v3h14v-3c0-2.21-3.134-4-7-4zm-1.5-6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13.5a6.002 6.002 0 00-4.321 1.832" />
    </svg>
);

const isToday = (timestamp: { seconds: number; nanoseconds: number } | null | undefined) => {
    if (!timestamp) return false;
    const date = new Date(timestamp.seconds * 1000);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
};

const DiaryCarousel: React.FC<{
    diaries: DiaryEntry[],
    myDiary: DiaryEntry | null,
    onViewDiary: (diary: DiaryEntry) => void,
    onAddDiary: () => void,
    loading: boolean
}> = ({ diaries, myDiary, onViewDiary, onAddDiary, loading }) => {
    const { t } = useLanguage();
    const currentUser = auth.currentUser;

    const getTimeRemaining = (timestamp: { seconds: number }) => {
        const expirationTime = timestamp.seconds * 1000 + 24 * 60 * 60 * 1000;
        const remainingMillis = expirationTime - Date.now();
        if (remainingMillis <= 0) return null;
        const hours = Math.floor(remainingMillis / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h`;
        const minutes = Math.floor((remainingMillis % (1000 * 60 * 60)) / (1000 * 60));
        return `${minutes}m`;
    };

    return (
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold mb-3">{t('messages.diariesTitle')}</h3>
            <div className="flex items-start gap-4 overflow-x-auto pb-2 -mb-2 no-scrollbar">
                <div 
                    className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0 group text-center"
                    onClick={myDiary ? () => onViewDiary(myDiary) : onAddDiary}
                >
                    <div className="w-16 h-16 rounded-full p-0.5 bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center relative">
                        <img 
                            src={currentUser?.photoURL || ''} 
                            alt={t('messages.addNote')} 
                            className={`w-full h-full rounded-full object-cover ${myDiary ? '' : 'opacity-50'}`} 
                        />
                         {!myDiary && (
                             <div className="absolute bottom-0 right-0 bg-sky-500 rounded-full p-0.5 border-2 border-white dark:border-black">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                     <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                 </svg>
                             </div>
                         )}
                    </div>
                    <p className="text-[11px] font-medium truncate w-16 mt-1">{t('messages.addNote')}</p>
                </div>

                {loading ? <div className="text-xs text-zinc-400">{t('messages.loading')}</div> : diaries.map(diary => (
                     <div 
                        key={diary.id} 
                        className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0 group text-center"
                        onClick={() => onViewDiary(diary)}
                    >
                        <div className="relative w-16 h-16">
                            <div className="w-full h-full rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500">
                               <div className="bg-white dark:bg-black p-0.5 rounded-full h-full w-full">
                                    <img src={diary.userAvatar} alt={diary.username} className="w-full h-full rounded-full object-cover"/>
                               </div>
                            </div>
                        </div>
                        <p className="text-[11px] font-medium truncate w-16 mt-1">{diary.username}</p>
                        <p className="text-[10px] text-zinc-500">{getTimeRemaining(diary.createdAt)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MessagesModal: React.FC<MessagesModalProps> = ({ isOpen, onClose, initialTargetUser, initialConversationId }) => {
    const { t } = useLanguage();
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'new'>('list');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [myLatestDiary, setMyLatestDiary] = useState<DiaryEntry | null>(null);
    const [newDiaryEntry, setNewDiaryEntry] = useState('');
    const [isPublishingDiary, setIsPublishingDiary] = useState(false);
    const [hasPostedToday, setHasPostedToday] = useState(false);
    const [followedDiaries, setFollowedDiaries] = useState<DiaryEntry[]>([]);
    const [diariesLoading, setDiariesLoading] = useState(true);
    const [viewingDiary, setViewingDiary] = useState<DiaryEntry | null>(null);
    const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
    const [confirmDeleteDiary, setConfirmDeleteDiary] = useState<DiaryEntry | null>(null);

    const currentUser = auth.currentUser;

    useEffect(() => {
        if (!isOpen) {
            setActiveConversationId(null);
            setView('list');
            setNewDiaryEntry('');
            setViewingDiary(null);
            setEditingDiary(null);
            setConfirmDeleteDiary(null);
            return;
        }
        if (initialConversationId) { setActiveConversationId(initialConversationId); return; }
        if (initialTargetUser) { startConversationWithUser(initialTargetUser); } else { setActiveConversationId(null); }
    }, [isOpen, initialTargetUser, initialConversationId]);

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
            if (doc.exists()) setIsAnonymous(doc.data().isAnonymous || false);
        });
        const q = query(collection(db, 'diaries'), where('userId', '==', currentUser.uid));
        const unsubDiary = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestDiary = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DiaryEntry)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
                if (!isToday(latestDiary.createdAt)) { setMyLatestDiary(null); setHasPostedToday(false); } else { setMyLatestDiary(latestDiary); setHasPostedToday(true); }
            } else { setMyLatestDiary(null); setHasPostedToday(false); }
        });
        return () => { unsub(); unsubDiary(); };
    }, [isOpen, currentUser]);
    
    useEffect(() => {
        if (!isOpen || !currentUser) return;
        setDiariesLoading(true);
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const fetchDiaries = async () => {
            const followingRef = collection(db, 'users', currentUser.uid, 'following');
            const followingSnap = await getDocs(followingRef);
            const followingIds = followingSnap.docs.map(doc => doc.id);
            if (followingIds.length === 0) { setFollowedDiaries([]); setDiariesLoading(false); return; }
            const userIdChunks: string[][] = [];
            for (let i = 0; i < followingIds.length; i += 30) userIdChunks.push(followingIds.slice(i, i + 30));
            const allDiaries: DiaryEntry[] = [];
            for (const chunk of userIdChunks) {
                if (chunk.length === 0) continue;
                const diariesQuery = query(collection(db, 'diaries'), where('userId', 'in', chunk));
                const diariesSnap = await getDocs(diariesQuery);
                diariesSnap.forEach(doc => {
                    const diaryData = { id: doc.id, ...doc.data() } as DiaryEntry;
                    if (diaryData.createdAt?.seconds) {
                        const diaryDate = new Date(diaryData.createdAt.seconds * 1000);
                        if (diaryDate > twentyFourHoursAgo) allDiaries.push(diaryData);
                    }
                });
            }
            const latestDiariesMap = new Map<string, DiaryEntry>();
            allDiaries.forEach(diary => {
                const existing = latestDiariesMap.get(diary.userId);
                if (!existing || diary.createdAt.seconds > existing.createdAt.seconds) latestDiariesMap.set(diary.userId, diary);
            });
            setFollowedDiaries(Array.from(latestDiariesMap.values()).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
            setDiariesLoading(false);
        };
        const unsub = onSnapshot(query(collection(db, 'diaries')), () => fetchDiaries().catch(console.error));
        return () => unsub();
    }, [isOpen, currentUser]);

    const startConversationWithUser = async (targetUser: { id: string, username: string, avatar: string }, initialMessage?: string) => {
        if (!auth.currentUser) return;
        const currentUserId = auth.currentUser.uid;
        const targetUserId = targetUser.id;
        const conversationId = [currentUserId, targetUserId].sort().join('_');
        const conversationRef = doc(db, 'conversations', conversationId);
        try {
            const conversationSnap = await getDoc(conversationRef);
            if (!conversationSnap.exists()) {
                await setDoc(conversationRef, {
                    participants: [currentUserId, targetUserId],
                    participantInfo: { [currentUserId]: { username: auth.currentUser.displayName, avatar: auth.currentUser.photoURL }, [targetUserId]: { username: targetUser.username, avatar: targetUser.avatar } },
                    timestamp: serverTimestamp(),
                });
            } else await updateDoc(conversationRef, { timestamp: serverTimestamp() });
            if(initialMessage) {
                await addDoc(collection(conversationRef, 'messages'), { senderId: currentUserId, text: initialMessage, timestamp: serverTimestamp() });
                await updateDoc(conversationRef, { lastMessage: { senderId: currentUserId, text: initialMessage, timestamp: serverTimestamp() } });
            }
            setActiveConversationId(conversationId);
            setView('list');
            setViewingDiary(null);
        } catch (error: any) { console.error("Error ensuring conversation exists:", error); }
    };
    
    if (!isOpen) return null;
    
    const handleToggleAnonymous = async () => {
        if (!auth.currentUser) return;
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { isAnonymous: !isAnonymous });
    };

    const handlePublishDiary = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || newDiaryEntry.trim() === '' || hasPostedToday) return;
        setIsPublishingDiary(true);
        try {
            await addDoc(collection(db, 'diaries'), { userId: currentUser.uid, username: currentUser.displayName, userAvatar: currentUser.photoURL, text: newDiaryEntry.trim(), createdAt: serverTimestamp() });
            setNewDiaryEntry('');
        } catch (error: any) { console.error("Error publishing diary entry: ", error); } finally { setIsPublishingDiary(false); }
    };

    const handleDeleteDiary = async () => {
        if (!confirmDeleteDiary) return;
        try {
            await deleteDoc(doc(db, 'diaries', confirmDeleteDiary.id));
            setConfirmDeleteDiary(null); setViewingDiary(null);
        } catch (error: any) { console.error("Error deleting diary:", error); }
    };

    const renderContent = () => {
        if (activeConversationId) return <ChatWindow conversationId={activeConversationId} onBack={() => setActiveConversationId(null)} isCurrentUserAnonymous={isAnonymous} />;
        if (view === 'new') return <NewMessage onSelectUser={startConversationWithUser} onBack={() => setView('list')} />;
        return (
            <>
                <header className="flex items-center p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <div className="w-1/4 flex justify-start">
                        <button onClick={handleToggleAnonymous} className={`w-8 h-8 p-1.5 rounded-full transition-colors ${isAnonymous ? 'bg-sky-500 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`} title={isAnonymous ? t('messages.anonymousModeOff') : t('messages.anonymousModeOn')}><AnonIcon className="w-full h-full"/></button>
                    </div>
                    <h2 className="w-1/2 text-lg font-black text-center">{t('messages.title')}</h2>
                    <div className="w-1/4 flex justify-end items-center gap-2">
                        <button onClick={() => setView('new')} className="p-1" aria-label={t('messages.newMessage')}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                        <button onClick={onClose} className="p-1" aria-label={t('messages.close')}><XIcon className="w-6 h-6" /></button>
                    </div>
                </header>
                <main className="flex-grow overflow-hidden flex flex-col">
                    <DiaryCarousel diaries={followedDiaries} myDiary={myLatestDiary} onViewDiary={setViewingDiary} onAddDiary={() => {}} loading={diariesLoading} />
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950/30">
                         <form onSubmit={handlePublishDiary} className="flex flex-col gap-3">
                            <TextAreaInput id="diary-entry-modal" label={hasPostedToday ? t('diary.alreadyPosted') : t('diary.placeholder')} value={newDiaryEntry} onChange={(e) => setNewDiaryEntry(e.target.value)} rows={2} disabled={hasPostedToday} className="!bg-white dark:!bg-zinc-900 !rounded-2xl" />
                            {!hasPostedToday && <Button type="submit" disabled={isPublishingDiary || !newDiaryEntry.trim()} className="self-end !w-auto !py-2 !px-6 !rounded-full !font-black !text-xs !uppercase !tracking-widest shadow-xl"> {isPublishingDiary ? t('diary.publishing') : t('diary.publish')} </Button>}
                        </form>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar"><ConversationList onSelectConversation={setActiveConversationId} /></div>
                </main>
            </>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex justify-center items-center p-0 md:p-10" onClick={onClose}>
            <div className="bg-white dark:bg-black rounded-t-3xl md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-full md:h-[90vh] md:max-h-[750px] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>{renderContent()}</div>
            {viewingDiary && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-[110] p-6 animate-fade-in" onClick={() => setViewingDiary(null)}>
                    <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] w-full max-w-sm p-8 text-center shadow-2xl flex flex-col gap-6 relative border dark:border-zinc-800" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewingDiary(null)} className="absolute top-6 right-6 text-zinc-400">&times;</button>
                        <div className="flex items-center gap-3"><img src={viewingDiary.userAvatar} alt={viewingDiary.username} className="w-10 h-10 rounded-full border-2 border-sky-500 p-0.5 object-cover" /><p className="font-black text-sm text-left tracking-tight">{viewingDiary.username}</p></div>
                        <p className="text-2xl font-serif text-center whitespace-pre-wrap flex-grow py-4 leading-relaxed font-bold">{viewingDiary.text}</p>
                        {viewingDiary.userId === currentUser?.uid ? (
                           <div className="flex items-center justify-center gap-3 mt-4">
                                <Button onClick={() => { setEditingDiary(viewingDiary); setViewingDiary(null); }} className="!w-full !bg-zinc-100 dark:!bg-zinc-800 !text-zinc-900 dark:!text-white !rounded-2xl !font-bold !text-xs !uppercase !tracking-widest">Editar</Button>
                                <Button onClick={() => setConfirmDeleteDiary(viewingDiary)} className="!w-full !bg-red-500 hover:!bg-red-600 !rounded-2xl !font-bold !text-xs !uppercase !tracking-widest">Excluir</Button>
                            </div>
                        ) : (
                            <form onSubmit={(e) => {
                                 e.preventDefault();
                                 const replyText = (e.currentTarget.elements.namedItem('reply') as HTMLInputElement).value;
                                 if(replyText.trim()) startConversationWithUser({id: viewingDiary.userId, username: viewingDiary.username, avatar: viewingDiary.userAvatar}, replyText);
                            }} className="mt-4">
                                 <input name="reply" type="text" placeholder={t('messages.replyToNote', { username: viewingDiary.username })} className="w-full bg-zinc-50 dark:bg-zinc-900 border-none rounded-2xl py-3.5 px-6 text-sm font-bold shadow-inner" />
                            </form>
                        )}
                    </div>
                </div>
            )}
            {editingDiary && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[110] p-6 animate-fade-in" onClick={() => setEditingDiary(null)}>
                    <form className="bg-white dark:bg-zinc-950 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl flex flex-col gap-6 border dark:border-zinc-800" 
                        onClick={e => e.stopPropagation()}
                        onSubmit={async (e) => {
                            e.preventDefault(); if (!editingDiary) return;
                            await updateDoc(doc(db, 'diaries', editingDiary.id), { text: editingDiary.text });
                            setEditingDiary(null);
                        }}
                    >
                        <h3 className="text-lg font-black text-center tracking-tight">Editar Nota</h3>
                        <TextAreaInput id="edit-diary" label="Sua nota" value={editingDiary.text} onChange={(e) => setEditingDiary(prev => prev ? ({ ...prev, text: e.target.value }) : null)} className="!bg-zinc-50 dark:!bg-zinc-900 !rounded-2xl" />
                        <div className="flex gap-3"><Button type="button" onClick={() => setEditingDiary(null)} className="!bg-zinc-100 dark:!bg-zinc-800 !text-zinc-900 dark:!text-white !rounded-2xl">{t('common.cancel')}</Button><Button type="submit" className="!rounded-2xl !shadow-xl !shadow-sky-500/10">Salvar</Button></div>
                    </form>
                </div>
            )}
            {confirmDeleteDiary && (
                 <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[120] animate-fade-in">
                    <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-sm text-center border dark:border-zinc-800">
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500"><XIcon className="w-8 h-8" /></div>
                        <h3 className="text-xl font-black mb-2 tracking-tight">Excluir Nota?</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 font-medium"> Tem certeza de que deseja excluir esta nota? Esta ação não pode ser desfeita. </p>
                        <div className="flex flex-col gap-3"><Button onClick={handleDeleteDiary} className="!bg-red-500 hover:!bg-red-600 !rounded-2xl !py-4 !font-black !uppercase !tracking-widest !text-xs">{t('common.delete')}</Button><button onClick={() => setConfirmDeleteDiary(null)} className="py-4 text-sm font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors">{t('common.cancel')}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagesModal;
