import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, serverTimestamp, collection, query, where, getDocs, setDoc, deleteDoc, storage, storageRef, uploadBytes, getDownloadURL, addDoc, updateDoc, limit, onSnapshot } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';

interface VibeBeamModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const VibeBeamModal: React.FC<VibeBeamModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'selection' | 'sending' | 'receiving'>('selection');
    const [status, setStatus] = useState<'idle' | 'searching' | 'beaming' | 'success'>('idle');
    const [nearbyReceivers, setNearbyReceivers] = useState<any[]>([]);
    const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const radarInterval = useRef<number | null>(null);
    const currentUser = auth.currentUser;

    const cleanup = () => {
        if (radarInterval.current) {
            window.clearInterval(radarInterval.current);
            radarInterval.current = null;
        }
        setNearbyReceivers([]);
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setStatus('idle');
        setMode('selection');
        setIsSending(false);
    };

    useEffect(() => {
        if (!isOpen) cleanup();
    }, [isOpen]);

    // Lógica para quem quer RECEBER
    useEffect(() => {
        if (mode === 'receiving' && currentUser) {
            const updatePresence = async () => {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                        beamStatus: 'receiving',
                        location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                        lastSeen: serverTimestamp()
                    });
                });
            };
            updatePresence();
            const interval = setInterval(updatePresence, 10000);
            return () => {
                clearInterval(interval);
                updateDoc(doc(db, 'users', currentUser.uid), { beamStatus: 'idle' });
            };
        }
    }, [mode, currentUser]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedPhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const startRadar = async () => {
        if (!currentUser || !selectedPhoto) return;
        setStatus('searching');
        
        const scanNearby = () => {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const myLat = pos.coords.latitude;
                const myLng = pos.coords.longitude;

                const q = query(
                    collection(db, 'users'), 
                    where('beamStatus', '==', 'receiving'),
                    limit(50)
                );
                
                const snap = await getDocs(q);
                const now = Date.now() / 1000;

                const found = snap.docs
                    .map(d => ({ userId: d.id, ...d.data() } as any))
                    .filter(u => {
                        if (u.userId === currentUser.uid) return false;
                        const isRecent = u.lastSeen && (now - u.lastSeen.seconds) < 60;
                        if (!isRecent) return false;

                        const diffLat = Math.abs(u.location.lat - myLat);
                        const diffLng = Math.abs(u.location.lng - myLng);
                        return diffLat < 0.02 && diffLng < 0.02; // ~2km
                    });

                setNearbyReceivers(found);
            });
        };

        scanNearby();
        radarInterval.current = window.setInterval(scanNearby, 5000);
    };

    const handleSendToUser = async (targetUser: any) => {
        if (!currentUser || !selectedPhoto || isSending) return;
        setIsSending(true);
        setStatus('beaming');

        try {
            const path = `beams/${currentUser.uid}/${Date.now()}_${selectedPhoto.name}`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, selectedPhoto);
            const url = await getDownloadURL(ref);

            const conversationId = [currentUser.uid, targetUser.userId].sort().join('_');
            const conversationRef = doc(db, 'conversations', conversationId);
            
            await addDoc(collection(conversationRef, 'messages'), {
                senderId: currentUser.uid,
                text: "✨ Foto enviada via Néos Beam",
                mediaUrl: url,
                mediaType: 'image',
                timestamp: serverTimestamp()
            });

            await setDoc(conversationRef, {
                participants: [currentUser.uid, targetUser.userId],
                participantInfo: {
                    [currentUser.uid]: { username: currentUser.displayName, avatar: currentUser.photoURL },
                    [targetUser.userId]: { username: targetUser.username, avatar: targetUser.avatar }
                },
                lastMessage: { text: "📷 Foto via Beam", senderId: currentUser.uid, timestamp: serverTimestamp() },
                timestamp: serverTimestamp()
            }, { merge: true });

            setStatus('success');
            setTimeout(onClose, 2000);
        } catch (e) {
            setStatus('idle');
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-zinc-950 flex flex-col items-center justify-center p-6 animate-fade-in overflow-hidden">
            <button onClick={onClose} className="absolute top-8 right-8 text-white/20 text-4xl font-thin hover:text-white transition-colors z-[700]">&times;</button>

            <div className="w-full max-w-sm flex flex-col items-center text-center gap-8">
                
                {mode === 'selection' && (
                    <div className="space-y-12 animate-slide-up w-full">
                        <div className="space-y-2">
                            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Néos Beam</h2>
                            <p className="text-zinc-500 text-sm font-medium">Como você deseja usar o Beam agora?</p>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4">
                            <button 
                                onClick={() => setMode('receiving')}
                                className="group relative p-8 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] hover:border-sky-500 transition-all text-left overflow-hidden"
                            >
                                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <svg className="w-32 h-32 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" strokeWidth={1}/></svg>
                                </div>
                                <h3 className="text-xl font-black text-white uppercase">Receber Foto</h3>
                                <p className="text-zinc-500 text-xs mt-2">Fique visível no radar para pessoas ao seu redor.</p>
                            </button>

                            <button 
                                onClick={() => setMode('sending')}
                                className="group relative p-8 bg-white rounded-[2.5rem] hover:scale-[1.02] transition-all text-left overflow-hidden"
                            >
                                <h3 className="text-xl font-black text-black uppercase">Enviar Foto</h3>
                                <p className="text-zinc-600 text-xs mt-2">Escolha uma foto e busque sinais próximos.</p>
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'receiving' && (
                    <div className="space-y-10 animate-fade-in">
                        <div className="relative w-48 h-48 mx-auto">
                            <div className="absolute inset-0 border-4 border-sky-500/30 rounded-full animate-ping"></div>
                            <div className="absolute inset-4 border-2 border-sky-500/20 rounded-full animate-pulse"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <img src={currentUser?.photoURL || ''} className="w-24 h-24 rounded-full border-4 border-zinc-900 object-cover" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-white uppercase italic">Aguardando Sinal</h3>
                            <p className="text-zinc-500 text-sm">Você está visível no radar de quem está por perto.</p>
                        </div>
                        <button onClick={() => setMode('selection')} className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.3em]">Cancelar Visibilidade</button>
                    </div>
                )}

                {mode === 'sending' && status === 'idle' && (
                    <div className="space-y-10 animate-slide-up w-full">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-56 h-56 bg-zinc-900 rounded-[3.5rem] flex flex-col items-center justify-center mx-auto border border-zinc-800 shadow-2xl cursor-pointer hover:scale-105 transition-all overflow-hidden"
                        >
                            {photoPreview ? (
                                <img src={photoPreview} className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <svg className="w-16 h-16 text-sky-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Escolher Foto</p>
                                </>
                            )}
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handlePhotoSelect} accept="image/*" className="hidden" />
                        <Button 
                            onClick={startRadar}
                            disabled={!selectedPhoto}
                            className="!py-6 !rounded-[2.5rem] !bg-white !text-black !font-black !uppercase shadow-2xl disabled:opacity-50"
                        >
                            Escaneia Arredores
                        </Button>
                        <button onClick={() => setMode('selection')} className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.3em]">Voltar</button>
                    </div>
                )}

                {status === 'searching' && (
                    <div className="w-full space-y-8 animate-fade-in">
                        <div className="relative w-48 h-48 mx-auto">
                            <div className="absolute inset-0 border border-sky-500/30 rounded-full animate-ping"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-sky-400 to-indigo-500 z-10">
                                    <img src={currentUser?.photoURL || ''} className="w-full h-full rounded-full border-4 border-black object-cover" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-white font-black text-lg uppercase tracking-tighter">Sinais Detectados</h3>
                            <div className="flex flex-col gap-3 max-h-[35vh] overflow-y-auto no-scrollbar py-2">
                                {nearbyReceivers.length > 0 ? nearbyReceivers.map(user => (
                                    <div
                                        key={user.userId}
                                        onClick={() => handleSendToUser(user)}
                                        className="flex items-center gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] hover:bg-zinc-800 transition-all text-left shadow-xl group cursor-pointer"
                                    >
                                        <img src={user.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-sky-500 shadow-md" />
                                        <div className="flex-grow">
                                            <p className="text-white font-bold text-sm">@{user.username}</p>
                                            <p className="text-[10px] text-sky-500 font-black uppercase tracking-widest">Toque para enviar</p>
                                        </div>
                                        <svg className="w-6 h-6 text-zinc-600 group-hover:text-sky-500 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth={2}/></svg>
                                    </div>
                                )) : (
                                    <div className="py-10 opacity-30">
                                        <p className="text-white text-[10px] font-black uppercase tracking-widest animate-pulse">Buscando receptores...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {status === 'beaming' && (
                    <div className="space-y-10 animate-fade-in text-center">
                        <div className="w-40 h-40 bg-sky-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(14,165,233,0.5)]">
                            <svg className="w-20 h-20 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-widest">Transmitindo...</h3>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-10 animate-slide-up text-center">
                        <div className="w-40 h-40 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                            <svg className="w-20 h-20 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Enviado com Sucesso!</h3>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                .animate-slide-up { animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default VibeBeamModal;