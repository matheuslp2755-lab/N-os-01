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
import VibeBeamModal from './feed/VibeBeamModal';
import WeatherBanner from './feed/WeatherBanner';
import ParadiseCameraModal from './feed/ParadiseCameraModal';
import { auth, db, collection, query, onSnapshot, orderBy, getDocs, where, doc, getDoc, limit, deleteDoc, updateDoc, increment, serverTimestamp } from '../firebase';
import { useLanguage } from '../context/LanguageContext';

const Feed: React.FC = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'feed' | 'vibes' | 'profile'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [usersWithPulses, setUsersWithPulses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPushBanner, setShowPushBanner] = useState(false);
  
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isCreatePulseOpen, setIsCreatePulseOpen] = useState(false);
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isParadiseOpen, setIsParadiseOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isBeamOpen, setIsBeamOpen] = useState(false);
  
  const [viewingPulseGroup, setViewingPulseGroup] = useState<any | null>(null);
  const [targetUserForMessages, setTargetUserForMessages] = useState<any>(null);
  const [targetConversationId, setTargetConversationId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  // Lógica OneSignal v16 Pro
  useEffect(() => {
    const checkPushPermission = () => {
      (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
      (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
        const permission = await OneSignal.Notifications.permission;
        if (permission !== 'granted') {
          setShowPushBanner(true);
        } else {
            if (currentUser) await OneSignal.login(currentUser.uid);
        }
      });
    };
    checkPushPermission();
  }, [currentUser]);

  const handleEnablePush = async () => {
    (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        console.log("Néos: Ativando fluxo de Push...");
        await OneSignal.Notifications.requestPermission();
        
        setTimeout(async () => {
          const pushUser = await OneSignal.User;
          const pushId = pushUser?.pushSubscription?.id;
          
          if (pushId && currentUser) {
            await updateDoc(doc(db, 'users', currentUser.uid), {
              oneSignalPlayerId: pushId,
              pushEnabled: true,
              lastPushSync: serverTimestamp()
            });
            setShowPushBanner(false);
            console.log("Néos: Notificações ativadas e ID salvo:", pushId);
          }
        }, 2000);
      } catch (err) {
        console.error("Erro ao configurar Push:", err);
      }
    });
  };

  useEffect(() => {
    if (viewMode === 'feed' && !viewingProfileId) {
      setLoading(true);
      try {
        const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snap) => {
          const fetchedPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          const visiblePosts = fetchedPosts.filter(p => {
              if (p.viewLimit && p.viewerCounts && currentUser) {
                const myViews = p.viewerCounts[currentUser.uid] || 0;
                if (myViews >= p.viewLimit && p.userId !== currentUser.uid) return false;
              }
              if (!p.isFriendOnly) return true;
              if (p.userId === currentUser?.uid) return true;
              return p.closeFriendsIds?.includes(currentUser?.uid);
          });

          if (currentUser) {
            visiblePosts.forEach(p => {
              if (p.viewLimit && p.userId !== currentUser.uid) {
                const postRef = doc(db, 'posts', p.id);
                updateDoc(postRef, {
                  [`viewerCounts.${currentUser.uid}`]: increment(1)
                });
              }
            });
          }

          setPosts(visiblePosts);
          setLoading(false);
        }, (err) => {
          console.error("Posts fetch error", err);
          setLoading(false);
        });
        return () => unsubscribe();
      } catch(e) { 
        console.error(e);
        setLoading(false); 
      }
    }
  }, [viewMode, viewingProfileId, currentUser?.uid]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchPulses = async () => {
      try {
        const followingRef = collection(db, 'users', currentUser.uid, 'following');
        const followingSnap = await getDocs(followingRef);
        const targetIds = [currentUser.uid, ...followingSnap.docs.map(d => d.id)];

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const q = query(collection(db, 'pulses'), where('createdAt', '>=', twentyFourHoursAgo), orderBy('createdAt', 'desc'));
        
        return onSnapshot(q, async (snap) => {
            const pulseList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const filteredPulses = pulseList.filter((p: any) => targetIds.includes(p.authorId));
            
            const grouped = new Map();
            for (const pulse of filteredPulses as any[]) {
                if (!grouped.has(pulse.authorId)) {
                    const authorSnap = await getDoc(doc(db, 'users', pulse.authorId));
                    if (authorSnap.exists()) {
                        grouped.set(pulse.authorId, { author: { id: pulse.authorId, ...authorSnap.data() }, pulses: [] });
                    }
                }
                if (grouped.has(pulse.authorId)) grouped.get(pulse.authorId).pulses.push(pulse);
            }
            setUsersWithPulses(Array.from(grouped.values()));
        }, (err) => console.warn("Pulse snapshot error", err));
      } catch(e) { console.warn("Pulses group error", e); }
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

  const handleDeletePulse = async (pulse: any) => {
    if (window.confirm("Deseja excluir permanentemente este Pulse?")) {
      try {
        await deleteDoc(doc(db, 'pulses', pulse.id));
        setViewingPulseGroup(null);
      } catch (err) {
        console.error("Erro ao deletar pulse:", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 border-r dark:border-zinc-800 bg-white dark:bg-black p-6 z-40">
        <div className="mb-10 pt-6">
            <h1 onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className="text-6xl font-black italic cursor-pointer bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 text-transparent bg-clip-text tracking-tighter transition-all hover:scale-105 active:scale-95">Néos</h1>
        </div>
        <nav className="flex flex-col gap-4">
            <button onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className={`flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all ${viewMode === 'feed' && !viewingProfileId ? 'font-bold bg-zinc-50 dark:bg-zinc-900' : ''}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M3 12l2-2m0 0l7-7 7-7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <span>{t('header.home')}</span>
            </button>

            <div className="bg-zinc-50 dark:bg-zinc-900/40 p-2 rounded-[2rem] border dark:border-zinc-800 space-y-1 my-2">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-3 py-1">Conexão Local</p>
                <div className="flex flex-col gap-1">
                    <button onClick={() => setIsBeamOpen(true)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-all text-sky-500 font-bold group">
                        <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span className="text-xs uppercase tracking-tighter">Néos Beam (Foto)</span>
                    </button>
                    <button onClick={() => setIsBrowserOpen(true)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all text-indigo-500 font-bold group">
                        <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10 10 0 0114.142 0M2.828 9.172a15 15 0 0121.214 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span className="text-xs uppercase tracking-tighter">Radar Perto</span>
                    </button>
                </div>
            </div>

            <button onClick={() => setViewMode('vibes')} className={`flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all ${viewMode === 'vibes' ? 'font-bold bg-zinc-50 dark:bg-zinc-900' : ''}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{t('header.vibes')}</span>
            </button>
            <button onClick={() => setIsMessagesOpen(true)} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg><span>{t('header.messages')}</span></button>
            <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m8-8H4" /></svg><span>{t('header.create')}</span></button>
            <button onClick={() => handleSelectUser(currentUser?.uid || '')} className={`flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all ${viewMode === 'profile' && viewingProfileId === currentUser?.uid ? 'font-bold bg-zinc-50 dark:bg-zinc-900' : ''}`}><img src={currentUser?.photoURL || 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Fdefault-avatar.png?alt=media'} className="w-6 h-6 rounded-full object-cover border dark:border-zinc-700" /><span>{t('header.profile')}</span></button>
        </nav>
      </div>
      
      <div className={`${viewMode === 'vibes' ? 'hidden' : 'block'} lg:hidden`}>
        <Header onSelectUser={handleSelectUser} onGoHome={() => { setViewMode('feed'); setViewingProfileId(null); }} onOpenMessages={() => setIsMessagesOpen(true)} onOpenBrowser={() => setIsBrowserOpen(true)} />
      </div>

      <main className={`transition-all duration-300 ${viewMode === 'vibes' ? 'lg:pl-64 h-[calc(100dvh-4rem)] lg:h-auto' : 'lg:pl-64 lg:pr-4 pt-16 lg:pt-8'}`}>
        {viewMode === 'vibes' ? <VibeFeed /> : 
         viewMode === 'profile' || viewingProfileId ? (
           <div className="container mx-auto max-w-4xl py-4"><UserProfile userId={viewingProfileId || currentUser?.uid || ''} onStartMessage={(u) => { setTargetUserForMessages(u); setIsMessagesOpen(true); }} onSelectUser={handleSelectUser} /></div>
         ) : (
          <div className="container mx-auto max-w-lg py-4 pb-24 px-4">
            {showPushBanner && (
              <div className="mb-6 p-5 bg-sky-600 rounded-[2.5rem] text-white flex items-center justify-between shadow-lg shadow-sky-500/20 animate-bounce-subtle">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-full">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  </div>
                  <p className="text-xs font-black uppercase tracking-tight">Ativar Notificações Néos</p>
                </div>
                <button onClick={handleEnablePush} className="bg-white text-sky-700 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">Ativar</button>
              </div>
            )}

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
      <VibeBeamModal isOpen={isBeamOpen} onClose={() => setIsBeamOpen(false)} onSelectUser={handleSelectUser} />
      {viewingPulseGroup && viewingPulseGroup.author && (
        <PulseViewerModal 
          isOpen={!!viewingPulseGroup} 
          pulses={viewingPulseGroup.pulses || []} 
          authorInfo={viewingPulseGroup.author || { id: '', username: 'User', avatar: '' }} 
          initialPulseIndex={0} 
          onClose={() => setViewingPulseGroup(null)} 
          onDelete={handleDeletePulse} 
        />
      )}
      <GalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} onImagesSelected={imgs => { setSelectedMedia(imgs); setIsGalleryOpen(false); setIsCreatePostOpen(true); }} />
      <CreatePostModal isOpen={isCreatePostOpen} onClose={() => setIsCreatePostOpen(false)} onPostCreated={() => setIsCreatePostOpen(false)} initialImages={selectedMedia} />
      <CreatePulseModal isOpen={isCreatePulseOpen} onClose={() => setIsCreatePulseOpen(false)} onPulseCreated={() => setIsCreatePulseOpen(false)} />
      <CreateVibeModal isOpen={isCreateVibeOpen} onClose={() => setIsCreateVibeOpen(false)} onVibeCreated={() => setIsCreateVibeOpen(false)} />
      <ParadiseCameraModal isOpen={isParadiseOpen} onClose={() => setIsParadiseOpen(false)} />
      <MessagesModal isOpen={isMessagesOpen} onClose={() => setIsMessagesOpen(false)} initialTargetUser={targetUserForMessages} initialConversationId={targetConversationId} />
      {isBrowserOpen && <VibeBrowser onClose={() => setIsBrowserOpen(false)} />}
    </div>
  );
};

export default Feed;