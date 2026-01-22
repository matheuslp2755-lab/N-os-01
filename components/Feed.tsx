
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
import { auth, db, collection, query, onSnapshot, orderBy, doc, getDoc, limit, deleteDoc } from '../firebase';
import { useLanguage } from '../context/LanguageContext';

const Feed: React.FC = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'feed' | 'vibes' | 'profile'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [usersWithPulses, setUsersWithPulses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  const [selectedPostToForward, setSelectedPostToForward] = useState<any>(null);
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (viewMode === 'feed' && !viewingProfileId) {
      setLoading(true);
      const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, (snap) => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    }
  }, [viewMode, viewingProfileId]);

  useEffect(() => {
    const q = query(collection(db, 'pulses'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, async (snap) => {
        const pulsesMap = new Map<string, any[]>();
        snap.docs.forEach(d => {
            const data = d.data();
            if (data.authorId) {
                if (!pulsesMap.has(data.authorId)) pulsesMap.set(data.authorId, []);
                pulsesMap.get(data.authorId)?.push({ id: d.id, ...data });
            }
        });
        const groupedArray: any[] = [];
        for (const [authorId, pulses] of pulsesMap.entries()) {
            const userSnap = await getDoc(doc(db, 'users', authorId));
            if (userSnap.exists()) {
                groupedArray.push({ author: { id: authorId, ...userSnap.data() }, pulses });
            }
        }
        setUsersWithPulses(groupedArray);
    });
  }, []);

  const handleSelectUser = (id: string) => {
    setViewingProfileId(id);
    setViewMode('profile');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 border-r dark:border-zinc-800 bg-white dark:bg-black p-6 z-40">
        <h1 onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className="text-5xl font-black italic cursor-pointer mb-12">Néos</h1>
        <nav className="flex flex-col gap-4">
            <button onClick={() => { setViewMode('feed'); setViewingProfileId(null); }} className={`p-3 rounded-2xl text-left font-bold ${viewMode === 'feed' && !viewingProfileId ? 'bg-zinc-100 dark:bg-zinc-900' : ''}`}>Início</button>
            <button onClick={() => setIsParadiseOpen(true)} className="p-3 rounded-2xl text-left font-bold text-sky-500">Câmera Paradise</button>
        </nav>
      </div>

      <Header onSelectUser={handleSelectUser} onGoHome={() => { setViewMode('feed'); setViewingProfileId(null); }} onOpenMessages={() => setIsMessagesOpen(true)} onOpenBrowser={() => setIsBrowserOpen(true)} />

      <main className={`lg:pl-64 pt-16 ${viewMode === 'vibes' ? 'h-screen' : ''}`}>
        {viewMode === 'vibes' ? <VibeFeed /> : 
         viewMode === 'profile' || viewingProfileId ? (
           <UserProfile userId={viewingProfileId || currentUser?.uid || ''} onStartMessage={(u) => { setTargetUserForMessages(u); setIsMessagesOpen(true); }} />
         ) : (
          <div className="container mx-auto max-w-lg py-8 px-4 pb-24">
            <PulseBar usersWithPulses={usersWithPulses} onViewPulses={id => {
                const group = usersWithPulses.find(g => g.author.id === id);
                if (group) setViewingPulseGroup(group);
            }} />
            <WeatherBanner />
            {loading ? <div className="py-20 text-center">Carregando...</div> : (
                <div className="flex flex-col gap-6">
                    {posts.map(p => <Post key={p.id} post={p} onPostDeleted={(id) => deleteDoc(doc(db, 'posts', id))} />)}
                </div>
            )}
          </div>
        )}
      </main>

      <div className="lg:hidden"><BottomNav currentView={viewingProfileId ? 'profile' : viewMode} onChangeView={v => { setViewMode(v); setViewingProfileId(null); }} onCreateClick={() => setIsMenuOpen(true)} /></div>

      <CreateMenuModal isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onSelect={(type) => {
          if (type === 'post') setIsGalleryOpen(true);
          if (type === 'pulse') setIsCreatePulseOpen(true);
          if (type === 'paradise') setIsParadiseOpen(true);
      }} />
      <ParadiseCameraModal isOpen={isParadiseOpen} onClose={() => setIsParadiseOpen(false)} />
      <CreatePulseModal isOpen={isCreatePulseOpen} onClose={() => setIsCreatePulseOpen(false)} onPulseCreated={() => {}} />
      <GalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} onImagesSelected={(imgs) => { setSelectedMedia(imgs); setIsGalleryOpen(false); setIsCreatePostOpen(true); }} />
      <CreatePostModal isOpen={isCreatePostOpen} onClose={() => setIsCreatePostOpen(false)} onPostCreated={() => setIsCreatePostOpen(false)} initialImages={selectedMedia} />
      <PulseViewerModal isOpen={!!viewingPulseGroup} pulses={viewingPulseGroup?.pulses || []} authorInfo={viewingPulseGroup?.author} initialPulseIndex={0} onClose={() => setViewingPulseGroup(null)} onDelete={() => {}} onViewProfile={handleSelectUser} />
    </div>
  );
};

export default Feed;
