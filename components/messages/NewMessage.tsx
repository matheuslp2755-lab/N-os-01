
import React, { useState, useEffect } from 'react';
import { auth, db, collection, query, where, getDocs, limit, doc, addDoc, serverTimestamp, setDoc } from '../../firebase';
import OnlineIndicator from '../common/OnlineIndicator';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import TextInput from '../common/TextInput';

type UserSearchResult = {
    id: string;
    username: string;
    avatar: string;
    lastSeen?: { seconds: number; nanoseconds: number };
    isAnonymous?: boolean;
};

interface NewMessageProps {
    onSelectUser: (user: any) => void;
    onBack: () => void;
}

const NewMessage: React.FC<NewMessageProps> = ({ onSelectUser, onBack }) => {
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Grupo
    const [isGroupMode, setIsGroupMode] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setSearchResults([]);
            return;
        }

        const debouncedSearch = setTimeout(async () => {
            setIsSearching(true);
            const term = searchQuery.toLowerCase();
            const q = query(
                collection(db, 'users'),
                where('username_lowercase', '>=', term),
                where('username_lowercase', '<=', term + '\uf8ff'),
                limit(10)
            );
            
            try {
                const snap = await getDocs(q);
                const users = snap.docs
                    .map(doc => ({ id: doc.id, ...(doc.data() as Omit<UserSearchResult, 'id'>) }))
                    .filter(user => user.id !== auth.currentUser?.uid);
                setSearchResults(users);
            } catch (error) { console.error(error); } finally { setIsSearching(false); }
        }, 300);

        return () => clearTimeout(debouncedSearch);
    }, [searchQuery]);

    const handleToggleUser = (user: UserSearchResult) => {
        if (selectedUsers.find(u => u.id === user.id)) {
            setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
        } else if (selectedUsers.length < 14) { // 14 + eu = 15
            setSelectedUsers(prev => [...prev, user]);
        }
    };

    const handleCreateGroup = async () => {
        if (!auth.currentUser || selectedUsers.length < 2 || !groupName.trim()) return;
        setIsCreating(true);
        try {
            const currentUserId = auth.currentUser.uid;
            const participants = [currentUserId, ...selectedUsers.map(u => u.id)];
            
            const participantInfo: any = {
                [currentUserId]: {
                    username: auth.currentUser.displayName,
                    avatar: auth.currentUser.photoURL
                }
            };
            selectedUsers.forEach(u => {
                participantInfo[u.id] = { username: u.username, avatar: u.avatar };
            });

            const newConversationRef = await addDoc(collection(db, 'conversations'), {
                participants,
                participantInfo,
                type: 'group',
                name: groupName.trim(),
                timestamp: serverTimestamp(),
                createdAt: serverTimestamp(),
                lastMessage: {
                    text: `Grupo "${groupName.trim()}" criado`,
                    senderId: 'system',
                    timestamp: serverTimestamp()
                }
            });

            onSelectUser({ id: newConversationRef.id }); // Passamos o ID da nova conversa de grupo
        } catch (e) { console.error(e); } finally { setIsCreating(false); }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-black animate-slide-right">
            <header className="flex items-center justify-between p-4 border-b dark:border-zinc-800">
                <button onClick={onBack} className="text-zinc-500 font-bold">{t('messages.back')}</button>
                <h2 className="text-lg font-black">{isGroupMode ? t('messages.createGroup') : t('messages.newMessageTitle')}</h2>
                <div className="w-10"></div>
            </header>

            <div className="p-4 flex flex-col gap-4 border-b dark:border-zinc-800">
                <button 
                    onClick={() => { setIsGroupMode(!isGroupMode); setSelectedUsers([]); }}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isGroupMode ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/10' : 'border-zinc-100 dark:border-zinc-800'}`}
                >
                    <div className={`p-2 rounded-full ${isGroupMode ? 'bg-sky-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <span className="font-bold text-sm">{t('messages.createGroup')}</span>
                </button>

                {isGroupMode && (
                    <div className="space-y-3 animate-fade-in">
                        <TextInput id="grp-name" label={t('messages.groupName')} value={groupName} onChange={e => setGroupName(e.target.value)} />
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">{t('messages.groupLimit')} ({selectedUsers.length + 1}/15)</p>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
                            {selectedUsers.map(u => (
                                <div key={u.id} className="relative shrink-0" onClick={() => handleToggleUser(u)}>
                                    <img src={u.avatar} className="w-12 h-12 rounded-full border-2 border-sky-500 p-0.5 object-cover" />
                                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-bold">X</div>
                                </div>
                            ))}
                        </div>
                        {selectedUsers.length >= 2 && groupName.trim() && (
                            <Button onClick={handleCreateGroup} disabled={isCreating} className="!rounded-full">{isCreating ? '...' : t('messages.createGroup')}</Button>
                        )}
                    </div>
                )}

                <div className="relative">
                    <input
                        type="text"
                        placeholder={t('messages.searchUsers')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-zinc-100 dark:bg-zinc-900 border-none rounded-2xl py-3 pl-10 pr-4 w-full text-sm focus:ring-2 ring-sky-500/20"
                    />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
            </div>

            <main className="flex-grow overflow-y-auto">
                {isSearching ? <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div></div> : searchResults.map(user => (
                    <div 
                        key={user.id} 
                        onClick={() => isGroupMode ? handleToggleUser(user) : onSelectUser(user)} 
                        className="flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer border-b dark:border-zinc-900 transition-colors"
                    >
                        <div className="relative">
                            <img src={user.avatar} className="w-12 h-12 rounded-full object-cover" />
                            {selectedUsers.find(u => u.id === user.id) && (
                                <div className="absolute -bottom-1 -right-1 bg-sky-500 rounded-full p-1 border-2 border-white dark:border-black">
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
                                </div>
                            )}
                        </div>
                        <span className="font-bold text-sm flex-grow">{user.username}</span>
                    </div>
                ))}
            </main>
        </div>
    );
};

export default NewMessage;
