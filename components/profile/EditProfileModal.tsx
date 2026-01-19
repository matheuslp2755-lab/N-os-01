import React, { useState, useEffect, useRef } from 'react';
import Button from '../common/Button';
import TextInput from '../common/TextInput';
import TextAreaInput from '../common/TextAreaInput';
import { useLanguage } from '../../context/LanguageContext';
import AddMusicModal from '../post/AddMusicModal';
import AvatarEditorModal from './AvatarEditorModal';
import heic2any from 'heic2any';
import { db, collection, query, where, getDocs, limit } from '../../firebase';

type MusicInfo = {
  nome: string;
  artista: string;
  capa: string;
  preview: string;
  startTime?: number;
};

type VibeType = 'joy' | 'anger' | 'sloth' | null;

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    username: string;
    avatar: string;
    bio?: string;
    nickname?: string;
    currentVibe?: VibeType;
    isPrivate?: boolean;
    profileMusic?: MusicInfo;
    lastUsernameChange?: { seconds: number };
    lastNicknameChange?: { seconds: number };
  };
  onUpdate: (updatedData: { 
    username: string; 
    nickname: string;
    bio: string; 
    avatarFile: File | Blob | null; 
    avatarPreview: string | null; 
    isPrivate: boolean; 
    profileMusic: MusicInfo | null;
    currentVibe: VibeType;
  }) => Promise<void>;
  isSubmitting: boolean;
}

const VIBE_OPTIONS = [
    { id: 'joy', label: 'vibeJoy', emoji: '☀️', color: 'bg-yellow-400' },
    { id: 'anger', label: 'vibeAnger', emoji: '🔥', color: 'bg-red-600' },
    { id: 'sloth', label: 'vibeSloth', emoji: '💤', color: 'bg-indigo-400' },
];

const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, user, onUpdate, isSubmitting }) => {
  const [username, setUsername] = useState(user.username);
  const [nickname, setNickname] = useState(user.nickname || '');
  const [bio, setBio] = useState(user.bio || '');
  const [currentVibe, setCurrentVibe] = useState<VibeType>(user.currentVibe || null);
  const [isPrivate, setIsPrivate] = useState(user.isPrivate || false);
  const [avatarFile, setAvatarFile] = useState<File | Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileMusic, setProfileMusic] = useState<MusicInfo | null>(user.profileMusic || null);
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [tempImageSource, setTempImageSource] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);

  const [error, setError] = useState('');
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setUsername(user.username);
      setNickname(user.nickname || '');
      setBio(user.bio || '');
      setCurrentVibe(user.currentVibe || null);
      setIsPrivate(user.isPrivate || false);
      setAvatarFile(null);
      setAvatarPreview(null);
      setProfileMusic(user.profileMusic || null);
      setError('');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const canChangeUsername = () => {
    if (!user.lastUsernameChange) return true;
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    return (Date.now() - user.lastUsernameChange.seconds * 1000) > thirtyDaysInMs;
  };

  const checkUsernameAvailable = async (name: string) => {
    if (name.toLowerCase() === user.username.toLowerCase()) return true;
    const q = query(collection(db, 'users'), where('username_lowercase', '==', name.toLowerCase()), limit(1));
    const snap = await getDocs(q);
    return snap.empty;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsProcessingAvatar(true);
      setError('');

      try {
          let sourceFile: File | Blob = file;
          if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
              const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
              sourceFile = Array.isArray(converted) ? converted[0] : converted;
          }

          const reader = new FileReader();
          reader.onload = (ev) => {
              setTempImageSource(ev.target?.result as string);
              setIsEditorOpen(true);
              setIsProcessingAvatar(false);
          };
          reader.readAsDataURL(sourceFile);
      } catch (err) {
          console.error(err);
          setError("Erro ao carregar foto.");
          setIsProcessingAvatar(false);
      }
    }
  };

  const handleSaveEditor = (processedBlob: Blob, previewUrl: string) => {
      setAvatarFile(processedBlob);
      setAvatarPreview(previewUrl);
      setIsEditorOpen(false);
      setTempImageSource(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username !== user.username) {
        if (!canChangeUsername()) {
            setError(t('editProfile.usernameCooldown'));
            return;
        }
        const available = await checkUsernameAvailable(username);
        if (!available) {
            setError("Este nome de usuário já está em uso.");
            return;
        }
    }

    try {
        await onUpdate({ username, nickname, bio, avatarFile, avatarPreview, isPrivate, profileMusic, currentVibe });
    } catch (err) {
        console.error(err);
        setError(t('editProfile.updateError'));
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto" onClick={onClose}>
        <div className="bg-white dark:bg-black rounded-lg shadow-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 my-8" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold">{t('editProfile.title')}</h2>
            <button onClick={onClose} className="text-2xl font-light">&times;</button>
          </div>
          <form onSubmit={handleSubmit}>
              <div className="p-6 flex flex-col items-center gap-4">
                  <div className="flex items-center gap-6 w-full">
                      <div className="relative">
                        <img src={avatarPreview || user.avatar} alt="Profile" className={`w-16 h-16 rounded-full object-cover border border-zinc-200 dark:border-zinc-800 ${isProcessingAvatar ? 'opacity-30' : ''}`} />
                        {isProcessingAvatar && <div className="absolute inset-0 flex items-center justify-center"><div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div></div>}
                      </div>
                      <div className="flex flex-col items-start">
                          <span className="font-semibold">{user.username}</span>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 mt-1 bg-transparent border-none p-0 cursor-pointer">{t('editProfile.changePhoto')}</button>
                          <input ref={fileInputRef} type="file" onChange={handleAvatarChange} className="hidden" accept="image/*" />
                      </div>
                  </div>

                  <div className="w-full flex flex-col gap-4 mt-4">
                      <div>
                        <TextInput id="username" label={t('editProfile.usernameLabel')} value={username} onChange={(e) => setUsername(e.target.value)} disabled={!canChangeUsername() && username === user.username} />
                        {!canChangeUsername() && username === user.username && <p className="text-[10px] text-zinc-500 mt-1">{t('editProfile.usernameCooldown')}</p>}
                      </div>
                      <TextInput id="nickname" label={t('editProfile.nicknameLabel')} value={nickname} onChange={(e) => setNickname(e.target.value)} />
                      <TextAreaInput id="bio" label={t('editProfile.bioLabel')} value={bio} onChange={(e) => setBio(e.target.value)} />

                      <div className="w-full">
                          <label className="font-semibold text-xs text-zinc-500 mb-2 block uppercase tracking-wider">{t('editProfile.vibeLabel')}</label>
                          <div className="flex justify-between gap-2">
                              {VIBE_OPTIONS.map(v => (
                                  <button key={v.id} type="button" onClick={() => setCurrentVibe(currentVibe === v.id ? null : v.id as VibeType)} className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition-all ${currentVibe === v.id ? `${v.color} border-zinc-400 dark:border-white text-white scale-105` : 'bg-zinc-50 dark:bg-zinc-900 border-transparent text-zinc-500 opacity-60'}`}>
                                      <span className="text-2xl mb-1">{v.emoji}</span>
                                      <span className="text-[10px] font-bold uppercase">{t(`editProfile.${v.label}`)}</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                       <div className="w-full">
                          <label className="font-semibold text-xs text-zinc-500 mb-1 block uppercase tracking-wider">{t('editProfile.profileMusic')}</label>
                          {profileMusic ? (
                              <div className="flex items-center gap-2 mt-1 text-sm p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800">
                                  <img src={profileMusic.capa} className="w-10 h-10 rounded shadow-sm" alt={profileMusic.nome}/>
                                  <div className="flex-grow overflow-hidden">
                                      <p className="font-semibold truncate text-xs">{profileMusic.nome}</p>
                                      <p className="text-[10px] text-zinc-500 truncate">{profileMusic.artista}</p>
                                  </div>
                                   <button type="button" onClick={() => setProfileMusic(null)} className="text-xs font-bold text-red-500 p-1">X</button>
                              </div>
                          ) : <p className="text-xs text-zinc-500 mt-1">{t('editProfile.noProfileMusic')}</p>}
                          <button type="button" onClick={() => setIsMusicModalOpen(true)} className="text-sm font-semibold text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 mt-2 p-0 bg-transparent border-none">{profileMusic ? t('editProfile.changeMusic') : t('createPost.addMusic')}</button>
                      </div>

                       <div className="flex items-center justify-between w-full mt-2 pt-4 border-t dark:border-zinc-800">
                          <div>
                              <label htmlFor="private-account" className="font-semibold text-sm">{t('editProfile.privateAccount')}</label>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('editProfile.privateAccountInfo')}</p>
                          </div>
                          <label htmlFor="private-account" className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" id="private-account" className="sr-only peer" checked={isPrivate} onChange={() => setIsPrivate(!isPrivate)} />
                              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 dark:peer-focus:ring-sky-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-sky-600"></div>
                          </label>
                      </div>
                  </div>
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col items-end">
                  {error && <p className="text-red-500 text-xs text-center mb-2 w-full font-bold">{error}</p>}
                  <Button type="submit" disabled={isSubmitting || isProcessingAvatar}>
                      {isSubmitting ? t('editProfile.submitting') : t('editProfile.submit')}
                  </Button>
              </div>
          </form>
        </div>
      </div>
      
      <AvatarEditorModal isOpen={isEditorOpen} imageSource={tempImageSource || ''} onClose={() => { setIsEditorOpen(false); setTempImageSource(null); }} onSave={handleSaveEditor} />
      <AddMusicModal isOpen={isMusicModalOpen} onClose={() => setIsMusicModalOpen(false)} postId="" onMusicAdded={(music) => { setProfileMusic(music); setIsMusicModalOpen(false); }} isProfileModal={true} />
    </>
  );
};

export default EditProfileModal;