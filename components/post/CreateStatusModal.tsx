
import React, { useState, useEffect } from 'react';
import { auth, db, addDoc, collection, serverTimestamp } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';

interface CreateStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
}

const BG_GRADIENTS = [
  "from-zinc-900 to-black",
  "from-purple-600 to-blue-500",
  "from-pink-500 to-rose-500",
  "from-amber-400 to-orange-600",
  "from-emerald-500 to-teal-700",
  "from-indigo-500 to-purple-800",
  "from-slate-700 to-slate-900"
];

const FONTS = [
  { id: 'classic', family: 'sans-serif' },
  { id: 'modern', family: 'serif' },
  { id: 'neon', family: 'cursive' },
  { id: 'strong', family: 'Impact, sans-serif' }
];

const CreateStatusModal: React.FC<CreateStatusModalProps> = ({ isOpen, onClose, onPostCreated }) => {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [bgIndex, setBgIndex] = useState(0);
  const [fontIndex, setFontIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setText('');
      setBgIndex(0);
      setFontIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        userId: auth.currentUser?.uid,
        username: auth.currentUser?.displayName,
        userAvatar: auth.currentUser?.photoURL,
        type: 'status',
        text: text.trim(),
        bgColor: BG_GRADIENTS[bgIndex],
        font: FONTS[fontIndex].id,
        likes: [],
        timestamp: serverTimestamp(),
      });
      onPostCreated();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col md:p-10" onClick={onClose}>
      <div 
        className="w-full h-full max-w-lg mx-auto bg-white dark:bg-zinc-950 md:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex-grow relative flex flex-col items-center justify-center p-8 bg-gradient-to-br ${BG_GRADIENTS[bgIndex]} transition-all duration-500`}>
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
            <button onClick={onClose} className="text-white text-3xl font-light">&times;</button>
            <Button onClick={handleShare} disabled={submitting || !text.trim()} className="!w-auto !bg-white !text-black !rounded-full !px-6 !py-1 font-bold">
              {submitting ? t('createStatus.sharing') : t('createStatus.share')}
            </Button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('createStatus.placeholder')}
            className={`w-full bg-transparent text-white text-center text-3xl font-bold outline-none resize-none leading-tight placeholder:text-white/50`}
            style={{ fontFamily: FONTS[fontIndex].family }}
          />
        </div>
        <div className="p-6 bg-white dark:bg-zinc-900 border-t dark:border-zinc-800 space-y-6">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('createStatus.background')}</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {BG_GRADIENTS.map((grad, i) => (
                <button key={i} onClick={() => setBgIndex(i)} className={`w-10 h-10 rounded-full shrink-0 bg-gradient-to-br ${grad} border-2 ${bgIndex === i ? 'border-sky-500 scale-110' : 'border-transparent'} transition-all`} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('createStatus.font')}</p>
            <div className="flex gap-2">
              {FONTS.map((f, i) => (
                <button key={i} onClick={() => setFontIndex(i)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${fontIndex === i ? 'bg-sky-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                  {f.id.charAt(0).toUpperCase() + f.id.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateStatusModal;
