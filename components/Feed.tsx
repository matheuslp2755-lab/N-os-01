import React, { useState, useEffect } from 'react';
import Header from './common/Header';
import BottomNav from './common/BottomNav';
import UserProfile from './profile/UserProfile';
import Post from './feed/Post';
import CreatePostModal from './post/CreatePostModal';
import CreatePulseModal from './pulse/CreatePulseModal';
import PulseViewerModal from './pulse/PulseViewerModal';
import MessagesModal from './messages/MessagesModal';
import PulseBar from './feed/PulseBar';
import GalleryModal from './feed/gallery/GalleryModal';
import CreateVibeModal from './vibes/CreateVibeModal';
import VibeFeed from './vibes/VibeFeed';
import VibeBrowser from './browser/VibeBrowser';
import CreateMenuModal from './feed/CreateMenuModal';
import WeatherBanner from './feed/WeatherBanner';
import ParadiseCameraModal from './feed/ParadiseCameraModal';
import { auth, db, collection, query, onSnapshot, orderBy, getDocs, where, doc, getDoc, limit, deleteDoc, updateDoc, serverTimestamp } from '../firebase';
import { useLanguage } from '../context/LanguageContext';

const Feed: React.FC = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'feed' | 'vibes' | 'profile'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [usersWithPulses, setUsersWithPulses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  
  const [inAppAlert, setInAppAlert] = useState<{show: boolean, title: string, body: string, type: 'message' | 'system'} | null>(null);
  
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isCreatePulseOpen, setIsCreatePulseOpen] = useState(false);
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isParadiseOpen, setIsParadiseOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  
  const [viewingPulseGroup, setViewingPulseGroup] = useState<any | null>(null);
  const [targetUserForMessages, setTargetUserForMessages] = useState<any>(null);
  const [targetConversationId, setTargetConversationId] = useState<string | null>(null);
  
  // ESTADO PERSISTENTE PARA AS IMAGENS CONVERTIDAS (BLOBS)
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'users', currentUser.uid, 'notifications'), where('read', '==', false), limit(1));
    const unsub = onSnapshot(q, (snap) => setHasUnreadNotifications(!snap.empty));
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (viewMode === 'feed' && !viewingProfileId) {
      setLoading(true);
      const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snap) => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [viewMode, viewingProfileId]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchPulses = async () => {
      const q = query(collection(db, 'pulses'), orderBy('createdAt', 'desc'), limit(20));
      return onSnapshot(q, async (snap) => {
          const grouped = new Map();
          for (const d of snap.docs) {
              const p = d.data();
              if (!grouped.has(p.authorId)) {
                  const u = await getDoc(doc(db, 'users', p.authorId));
                  if (u.exists()) grouped.set(p.authorId, { author: { id: p.authorId, ...u.data() }, pulses: [] });
              }
              if (grouped.has(p.authorId)) grouped.get(p.authorId).pulses.push({id: d.id, ...p});
          }
          setUsersWithPulses(Array.from(grouped.values()));
      });
    };
    fetchPulses();
  }, [currentUser]);

  const handleSelectUser = (id: string) => {
    setViewingProfileId(id);
    setViewMode('profile');
  };

  const handleMenuSelect = (type: 'post' | 'pulse' | 'vibe' | 'paradise') => {
    switch (type) {
        case 'post': setIsGalleryOpen(true); break;
        case 'pulse': setIsCreatePulseOpen(true); break;
        case 'vibe': setIsCreateVibeOpen(true); break;
        case 'paradise': setIsParadiseOpen(true); break;
    }
  };

  // CONFIRMAÇÃO: Salva no estado global e abre o editor com as URLs já convertidas
  const handleImagesConfirmed = (imgs: any[]) => {
      setSelectedMedia([...imgs]);
      setIsGalleryOpen(false);
      // Timeout para garantir que o modal feche antes de abrir o próximo com o novo estado
      setTimeout(() => setIsCreatePostOpen(true), 100);
  };

  const handleCloseCreatePost = () => {
      setIsCreatePostOpen(false);
      // Limpa Blobs da memória apenas quando o post for cancelado ou finalizado
      selectedMedia.forEach(m => {
          if (m.preview && m.preview.startsWith('blob:')) URL.revokeObjectURL(m.preview);
      });
      setSelectedMedia([]);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {inAppAlert && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[2000] w-[95%] max-w-md animate-slide-down">
          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/20 dark:border-zinc-800 p-4 rounded-[2rem] shadow-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" strokeWidth={2}/></svg>
            </div>
            <div className="flex-grow overflow-hidden">
              <p className="text-xs font-black uppercase text-indigo-500 tracking-widest">{inAppAlert.title}</p>
              <p className="text-sm font-bold text-zinc-800 dark:text-white truncate">{inAppAlert.body}</p>
            </div>
            <button onClick={() => setInAppAlert(null)} className="p-2 text-zinc-400">&times;</button>
          </div>
        </div>
      )}

      <div className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 border-r dark:border-zinc-800 bg-white dark:bg-black p-6 z-40">
        <div className="mb-10 pt-6">
            <h1 onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className="text-6xl font-black italic cursor-pointer bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 text-transparent bg-clip-text tracking-tighter">Néos</h1>
        </div>
        <nav className="flex flex-col gap-4">
            <button onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className={`flex items-center gap-4 p-3 rounded-2xl ${viewMode === 'feed' && !viewingProfileId ? 'font-bold bg-zinc-50 dark:bg-zinc-900' : ''}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M3 12l2-2m0 0l7-7 7-7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <span>{t('header.home')}</span>
            </button>
        </nav>
      </div>
      
      <div className={`${viewMode === 'vibes' ? 'hidden' : 'block'} lg:hidden`}>
        <Header 
          onSelectUser={handleSelectUser} 
          onGoHome={() => { setViewMode('feed'); setViewingProfileId(null); }} 
          onOpenMessages={() => setIsMessagesOpen(true)} 
          onOpenBrowser={() => setIsBrowserOpen(true)} 
          hasUnread={hasUnreadNotifications}
        />
      </div>

      <main className={`transition-all duration-300 ${viewMode === 'vibes' ? 'lg:pl-64 h-[calc(100dvh-4rem)] lg:h-auto' : 'lg:pl-64 lg:pr-4 pt-16 lg:pt-8'}`}>
        {viewMode === 'vibes' ? <VibeFeed /> : 
         viewMode === 'profile' || viewingProfileId ? (
           <div className="container mx-auto max-w-4xl py-4"><UserProfile userId={viewingProfileId || currentUser?.uid || ''} onStartMessage={(u) => { setTargetUserForMessages(u); setIsMessagesOpen(true); }} onSelectUser={handleSelectUser} /></div>
         ) : (
          <div className="container mx-auto max-w-lg py-4 pb-24 px-4">
            <PulseBar 
              usersWithPulses={usersWithPulses} 
              onViewPulses={authorId => {
                const group = usersWithPulses.find(g => g?.author?.id === authorId);
                if (group) setViewingPulseGroup(group);
              }} 
            />
            <WeatherBanner />
            {loading && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div></div>}
            <div className="flex flex-col gap-4 mt-4">
                {posts.length > 0 ? posts.map(p => (
                    <Post key={p.id} post={p} onPostDeleted={(id) => deleteDoc(doc(db, 'posts', id))} />
                )) : !loading && <div className="text-center py-20 text-zinc-500 font-bold uppercase text-xs tracking-widest">{t('feed.empty')}</div>}
            </div>
          </div>
        )}
      </main>

      <div className="lg:hidden"><BottomNav currentView={viewingProfileId ? 'profile' : viewMode} onChangeView={v => { setViewMode(v); setViewingProfileId(null); }} onCreateClick={() => setIsMenuOpen(true)} /></div>

      <CreateMenuModal isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onSelect={handleMenuSelect as any} />
      <MessagesModal isOpen={isMessagesOpen} onClose={() => setIsMessagesOpen(false)} initialTargetUser={targetUserForMessages} initialConversationId={targetConversationId} />
      {viewingPulseGroup && <PulseViewerModal isOpen={!!viewingPulseGroup} pulses={viewingPulseGroup.pulses} authorInfo={viewingPulseGroup.author} initialPulseIndex={0} onClose={() => setViewingPulseGroup(null)} onDelete={() => {}} />}
      
      <GalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} onImagesSelected={handleImagesConfirmed} />
      <CreatePostModal 
        isOpen={isCreatePostOpen} 
        onClose={handleCloseCreatePost} 
        onPostCreated={handleCloseCreatePost} 
        initialImages={selectedMedia} 
      />
      
      <CreatePulseModal isOpen={isCreatePulseOpen} onClose={() => setIsCreatePulseOpen(false)} onPulseCreated={() => setIsCreatePulseOpen(false)} />
      <CreateVibeModal isOpen={isCreateVibeOpen} onClose={() => setIsCreateVibeOpen(false)} onVibeCreated={() => setIsCreateVibeOpen(false)} />
      {isBrowserOpen && <VibeBrowser onClose={() => setIsBrowserOpen(false)} />}
      <ParadiseCameraModal isOpen={isParadiseOpen} onClose={() => setIsParadiseOpen(false)} />

      <style>{`
        @keyframes slide-down { from { transform: translate(-50%, -100%); } to { transform: translate(-50%, 0); } }
        .animate-slide-down { animation: slide-down 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default Feed;