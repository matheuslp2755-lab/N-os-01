import React, { useState, useEffect, useRef } from 'react';
import { auth, db, collection, getDocs, doc, setDoc, serverTimestamp, writeBatch, query, where, orderBy, storage, storageRef, uploadBytes, getDownloadURL } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import TextInput from '../common/TextInput';

type ContentItem = {
    id: string;
    type: 'post' | 'pulse' | 'image';
    mediaUrl: string;
    timestamp: any;
    file?: File;
};

interface CreateMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoryCreated: () => void;
  initialContent?: ContentItem;
}

const Spinner: React.FC = () => (
    <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
    </div>
);

const BackArrowIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
);

const CreateMemoryModal: React.FC<CreateMemoryModalProps> = ({ isOpen, onClose, onMemoryCreated, initialContent }) => {
    const { t } = useLanguage();
    const [step, setStep] = useState(1);
    const [allContent, setAllContent] = useState<ContentItem[]>([]);
    const [uploadedItems, setUploadedItems] = useState<ContentItem[]>([]);
    const [selectedContent, setSelectedContent] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [coverUrl, setCoverUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const currentUser = auth.currentUser;
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            // Reset state on close
            setStep(1);
            setAllContent([]);
            setUploadedItems([]);
            setSelectedContent([]);
            setLoading(true);
            setName('');
            setCoverUrl('');
            setIsSubmitting(false);
            return;
        }

        const fetchContent = async () => {
            if (!currentUser) return;
            setLoading(true);
            try {
                const postsQuery = query(collection(db, 'posts'), where('userId', '==', currentUser.uid), orderBy('timestamp', 'desc'));
                const pulsesQuery = query(collection(db, 'pulses'), where('authorId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
                
                const [postsSnap, pulsesSnap] = await Promise.all([getDocs(postsQuery), getDocs(pulsesQuery)]);
                
                const posts: ContentItem[] = postsSnap.docs.map(doc => ({ id: doc.id, type: 'post', mediaUrl: doc.data().imageUrl, timestamp: doc.data().timestamp }));
                const pulses: ContentItem[] = pulsesSnap.docs.map(doc => ({ id: doc.id, type: 'pulse', mediaUrl: doc.data().mediaUrl, timestamp: doc.data().createdAt }));

                const combined = [...posts, ...pulses].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                setAllContent(combined);

                if (initialContent) {
                    setSelectedContent([initialContent]);
                    setCoverUrl(initialContent.mediaUrl);
                    setStep(2);
                }
            } catch (error) {
                console.error("Error fetching content:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
    }, [isOpen, currentUser, initialContent]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const newItems: ContentItem[] = files.map((file: File) => ({
                id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'image',
                mediaUrl: URL.createObjectURL(file),
                timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 },
                file: file
            }));

            setUploadedItems(prev => [...newItems, ...prev]);
            setSelectedContent(prev => [...prev, ...newItems]);
            
            // Auto select first uploaded image as cover if nothing else is selected
            if (selectedContent.length === 0 && newItems.length > 0) {
                setCoverUrl(newItems[0].mediaUrl);
            }
        }
    };

    const handleToggleSelect = (item: ContentItem) => {
        setSelectedContent(prev => {
            if (prev.find(c => c.id === item.id)) {
                return prev.filter(c => c.id !== item.id);
            }
            return [...prev, item];
        });
    };

    const handleNext = () => {
        if (selectedContent.length > 0) {
            // If current coverUrl is not in selected content, default to first selected
            const isCoverSelected = selectedContent.find(c => c.mediaUrl === coverUrl);
            if (!coverUrl || !isCoverSelected) {
                setCoverUrl(selectedContent[0].mediaUrl);
            }
            setStep(2);
        }
    };
    
    const handleCreate = async () => {
        if (!currentUser || !name.trim() || !coverUrl) return;
        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            const memoryRef = doc(collection(db, 'users', currentUser.uid, 'memories'));
            
            // First upload any new files
            const processedItems = await Promise.all(selectedContent.map(async (item) => {
                if (item.type === 'image' && item.file) {
                    const imageRef = storageRef(storage, `memories/${currentUser.uid}/${memoryRef.id}/${Date.now()}_${item.file.name}`);
                    await uploadBytes(imageRef, item.file);
                    const downloadUrl = await getDownloadURL(imageRef);
                    return {
                        ...item,
                        mediaUrl: downloadUrl,
                        // If this item was the cover, we need to update the coverUrl too, 
                        // but we handle coverUrl update separately or just use this logic implicitly
                    };
                }
                return item;
            }));

            // Determine final cover URL (if it was an uploaded file, find its new URL)
            let finalCoverUrl = coverUrl;
            const coverItem = processedItems.find(item => 
                // Match by ID because mediaUrl might have changed for uploads
                selectedContent.find(old => old.mediaUrl === coverUrl)?.id === item.id
            );
            if (coverItem) {
                finalCoverUrl = coverItem.mediaUrl;
            }

            batch.set(memoryRef, {
                name: name.trim(),
                coverUrl: finalCoverUrl,
                createdAt: serverTimestamp(),
            });

            processedItems.forEach(item => {
                const itemRef = doc(collection(db, 'users', currentUser.uid, 'memories', memoryRef.id, 'items'));
                batch.set(itemRef, {
                    contentId: item.id,
                    contentType: item.type,
                    mediaUrl: item.mediaUrl,
                    timestamp: item.timestamp,
                });
            });

            await batch.commit();
            onMemoryCreated();
            onClose();
        } catch (error) {
            console.error("Error creating memory:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[51]" onClick={onClose}>
            <div className="bg-white dark:bg-black rounded-lg shadow-xl w-full max-w-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center flex-shrink-0">
                    <div className="w-20">
                        {step === 2 && <button onClick={() => setStep(1)} className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><BackArrowIcon className="w-6 h-6" /></button>}
                    </div>
                    <h2 className="text-lg font-semibold">{step === 1 ? t('memories.selectContent') : t('memories.title')}</h2>
                    <div className="w-20 text-right">
                        {step === 1 && <Button onClick={handleNext} disabled={selectedContent.length === 0} className="!w-auto !py-0 !px-3 !text-sm">{t('memories.next')}</Button>}
                        {step === 2 && <Button onClick={handleCreate} disabled={!name.trim() || !coverUrl || isSubmitting} className="!w-auto !py-0 !px-3 !text-sm">{isSubmitting ? t('memories.creating') : t('memories.create')}</Button>}
                    </div>
                </div>
                {step === 1 ? (
                    <div className="flex-grow overflow-y-auto p-1">
                        {loading && <Spinner />}
                        {!loading && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative aspect-square cursor-pointer bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        onChange={handleFileSelect} 
                                        style={{ opacity: 0, width: '0.1px', height: '0.1px', position: 'absolute', overflow: 'hidden', zIndex: -1 }}
                                        accept="image/*" 
                                        multiple 
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-xs font-medium">{t('memories.uploadPhoto')}</span>
                                </div>

                                {[...uploadedItems, ...allContent].map(item => {
                                    const isSelected = !!selectedContent.find(c => c.id === item.id);
                                    return (
                                        <div key={item.id} className="relative aspect-square cursor-pointer group" onClick={() => handleToggleSelect(item)}>
                                            {item.type === 'pulse' && (item.mediaUrl.includes('.mp4') || item.mediaUrl.includes('.webm')) ? (
                                                <video src={item.mediaUrl} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-50' : ''}`} />
                                            ) : (
                                                <img src={item.mediaUrl} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-50' : ''}`} alt="" />
                                            )}
                                            
                                            {/* Type Indicator */}
                                            <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5">
                                                {item.type === 'pulse' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                                {item.type === 'image' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                            </div>

                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-6 h-6 bg-sky-500 rounded-full border-2 border-white flex items-center justify-center">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-6 flex flex-col items-center gap-6">
                         <img src={coverUrl} alt="Cover preview" className="w-24 h-24 rounded-full object-cover border-2 border-zinc-300" />
                         <div className="w-full">
                            <TextInput id="memory-name" label={t('memories.memoryName')} value={name} onChange={(e) => setName(e.target.value)} />
                         </div>
                         <div className="w-full">
                            <h3 className="text-sm font-semibold mb-2">{t('memories.selectCover')}</h3>
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
                                {selectedContent.map(item => (
                                    <div key={item.id} className={`relative aspect-square cursor-pointer rounded-md overflow-hidden ${coverUrl === item.mediaUrl ? 'ring-2 ring-sky-500' : ''}`} onClick={() => setCoverUrl(item.mediaUrl)}>
                                        {item.type === 'pulse' && (item.mediaUrl.includes('.mp4') || item.mediaUrl.includes('.webm')) ? (
                                             <video src={item.mediaUrl} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={item.mediaUrl} className="w-full h-full object-cover" alt="" />
                                        )}
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreateMemoryModal;