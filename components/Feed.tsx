
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
import VibeBeamModal from './feed/VibeBeamModal';
import ForwardModal from './messages/ForwardModal';
// Added 'where' to imports from '../firebase'
import { auth, db, collection, query, where, onSnapshot, orderBy, doc, getDoc, limit, deleteDoc, updateDoc, serverTimestamp } from '../firebase';
import { useLanguage } from '../context/LanguageContext';

const Feed: React.FC = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'feed' | 'vibes' | 'profile'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [usersWithPulses, setUsersWithPulses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  
  // ALERTA GLOBAL SISTEMA
  const [globalAlert, setGlobalAlert] = useState<{message: string, id: string} | null>(null);
  const [alertProgress, setAlertProgress] = useState(100);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isCreatePulseOpen, setIsCreatePulseOpen] = useState(false);
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isParadiseOpen, setIsParadiseOpen] = useState(false);
  const [isBeamOpen, setIsBeamOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  
  const [viewingPulseGroup, setViewingPulseGroup] = useState<any | null>(null);
  const [targetUserForMessages, setTargetUserForMessages] = useState<any>(null);
  const [targetConversationId, setTargetConversationId] = useState<string | null>(null);
  const [selectedPostToForward, setSelectedPostToForward] = useState<any>(null);
  
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  // Listener Alerta Global da Néos
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system', 'global_alert'), (snap) => {
        const data = snap.data();
        if (data && data.message && !dismissedAlerts.includes(data.id)) {
            setGlobalAlert({ message: data.message, id: data.id });
            setAlertProgress(100);
        }
    });
    return () => unsub();
  }, [dismissedAlerts]);

  // Timer para Alerta Global (15 segundos)
  useEffect(() => {
    if (globalAlert) {
        const duration = 15000;
        const interval = 100;
        const step = (interval / duration) * 100;
        
        const timer = setInterval(() => {
            setAlertProgress(prev => {
                if (prev <= 0) {
                    clearInterval(timer);
                    setGlobalAlert(null);
                    return 0;
                }
                return prev - step;
            });
        }, interval);
        return () => clearInterval(timer);
    }
  }, [globalAlert]);

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
      const q = query(collection(db, 'pulses'), orderBy('createdAt', 'desc'), limit(50));
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

  const handleMenuSelect = (type: 'post' | 'pulse' | 'vibe' | 'paradise' | 'beam') => {
    switch (type) {
        case 'post': setIsGalleryOpen(true); break;
        case 'pulse': setIsCreatePulseOpen(true); break;
        case 'vibe': setIsCreateVibeOpen(true); break;
        case 'paradise': setIsParadiseOpen(true); break;
        case 'beam': setIsBeamOpen(true); break;
    }
  };

  const handleForwardPost = (post: any) => {
      setSelectedPostToForward(post);
      setIsForwardOpen(true);
  };

  const closeAlert = () => {
      if (globalAlert) setDismissedAlerts(prev => [...prev, globalAlert.id]);
      setGlobalAlert(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* BANNER ALERTA GLOBAL TEMPORÁRIO */}
      {globalAlert && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1000] w-[95%] max-w-lg animate-slide-down">
              <div className="bg-indigo-600 text-white p-5 rounded-[2rem] shadow-2xl relative overflow-hidden ring-4 ring-indigo-500/20">
                  <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                      </div>
                      <div className="flex-grow">
                          <h4 className="font-black text-[10px] uppercase tracking-widest mb-0.5 opacity-70">Aviso da Néos</h4>
                          <p className="text-sm font-bold leading-tight">{globalAlert.message}</p>
                      </div>
                      <button onClick={closeAlert} className="p-2 -mr-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                  {/* Progress Bar */}
                  <div className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-100 ease-linear" style={{ width: `${alertProgress}%` }}></div>
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
            <button onClick={() => setIsParadiseOpen(true)} className="flex items-center gap-4 p-3 rounded-2xl text-sky-500 font-bold hover:bg-sky-50 dark:hover:bg-sky-950/20 transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                <span>Câmera do Paraíso</span>
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
                    <Post key={p.id} post={p} onPostDeleted={(id) => deleteDoc(doc(db, 'posts', id))} onForward={handleForwardPost} />
                )) : !loading && <div className="text-center py-20 text-zinc-500 font-bold uppercase text-xs tracking-widest">{t('feed.empty')}</div>}
            </div>
          </div>
        )}
      </main>

      <div className="lg:hidden"><BottomNav currentView={viewingProfileId ? 'profile' : viewMode} onChangeView={v => { setViewMode(v); setViewingProfileId(null); }} onCreateClick={() => setIsMenuOpen(true)} /></div>

      <CreateMenuModal isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onSelect={handleMenuSelect as any} />
      <MessagesModal isOpen={isMessagesOpen} onClose={() => setIsMessagesOpen(false)} initialTargetUser={targetUserForMessages} initialConversationId={targetConversationId} />
      {viewingPulseGroup && (
          <PulseViewerModal 
            isOpen={!!viewingPulseGroup} 
            pulses={viewingPulseGroup.pulses} 
            authorInfo={viewingPulseGroup.author} 
            initialPulseIndex={0} 
            onClose={() => setViewingPulseGroup(null)} 
            onDelete={() => {}} 
            onViewProfile={handleSelectUser}
          />
      )}
      
      <GalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} onImagesSelected={(imgs) => { setSelectedMedia(imgs); setIsGalleryOpen(false); setIsCreatePostOpen(true); }} />
      <CreatePostModal 
        isOpen={isCreatePostOpen} 
        onClose={() => setIsCreatePostOpen(false)} 
        onPostCreated={() => setIsCreatePostOpen(false)} 
        initialImages={selectedMedia} 
      />
      
      <CreatePulseModal isOpen={isCreatePulseOpen} onClose={() => setIsCreatePulseOpen(false)} onPulseCreated={() => setIsCreatePulseOpen(false)} />
      <CreateVibeModal isOpen={isCreateVibeOpen} onClose={() => setIsCreateVibeOpen(false)} onVibeCreated={() => setIsCreateVibeOpen(false)} />
      {isBrowserOpen && <VibeBrowser onClose={() => setIsBrowserOpen(false)} />}
      <ParadiseCameraModal isOpen={isParadiseOpen} onClose={() => setIsParadiseOpen(false)} />
      <VibeBeamModal isOpen={isBeamOpen} onClose={() => setIsBeamOpen(false)} />
      <ForwardModal isOpen={isForwardOpen} onClose={() => setIsForwardOpen(false)} post={selectedPostToForward} />

      <style>{`
        @keyframes slide-down { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-slide-down { animation: slide-down 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default Feed;
