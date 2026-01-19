import React, { useState, useEffect, useRef } from 'react';
import { auth, db, doc, serverTimestamp, collection, query, where, onSnapshot, setDoc, deleteDoc, storage, storageRef, uploadBytes, getDownloadURL, addDoc, updateDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';

interface VibeBeamModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectUser?: (userId: string) => void;
}

const VibeBeamModal: React.FC<VibeBeamModalProps> = ({ isOpen, onClose, onSelectUser }) => {
    const { t } = useLanguage();
    const [status, setStatus] = useState<'off' | 'searching' | 'beaming' | 'success'>('off');
    const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
    const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pulseInterval = useRef<number | null>(null);
    const currentUser = auth.currentUser;

    const cleanup = async () => {
        if (pulseInterval.current) {
            window.clearInterval(pulseInterval.current);
            pulseInterval.current = null;
        }
        if (currentUser) {
            try {
                await deleteDoc(doc(db, 'active_beams', currentUser.uid));
            } catch (e) {}
        }
        setNearbyUsers([]);
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setStatus('off');
        setIsSending(false);
    };

    useEffect(() => {
        if (!isOpen) cleanup();
    }, [isOpen]);

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
        
        const updatePresence = () => {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const beamData = {
                    userId: currentUser.uid,
                    username: currentUser.displayName,
                    avatar: currentUser.photoURL,
                    // Usamos uma precisão de 2 casas decimais (~1km) para agrupar usuários no mesmo local
                    lat: Number(pos.coords.latitude.toFixed(2)), 
                    lng: Number(pos.coords.longitude.toFixed(2)),
                    lastPulse: Date.now()
                };

                // Atualizar no banco de Beams
                await setDoc(doc(db, 'active_beams', currentUser.uid), beamData);
                
                // Também atualiza a localização geral do usuário para o Radar Perto normal
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                    lastSeen: serverTimestamp()
                });

                listenForNearby(beamData);
            }, (err) => {
                console.error("GPS Beam Error", err);
                alert("Por favor, ative a localização para que o Beam encontre seus amigos.");
                setStatus('off');
            }, { enableHighAccuracy: true });
        };

        updatePresence();
        pulseInterval.current = window.setInterval(updatePresence, 5000);
    };

    const listenForNearby = (myData: any) => {
        const q = query(
            collection(db, 'active_beams'),
            where('lat', '==', myData.lat),
            where('lng', '==', myData.lng)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const now = Date.now();
            const found = snapshot.docs
                .map(d => d.data())
                .filter(u => u.userId !== currentUser?.uid && (now - u.lastPulse < 20000)); // Usuários ativos nos últimos 20s
            setNearbyUsers(found);
        });
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
                text: "✨ Foto enviada via Néos Beam (Por Aproximação)",
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
            console.error("Beam Transfer Error", e);
            setStatus('off');
        } finally {
            setIsSending(false);
        }
    };

    const handleExternalShare = async () => {
        if (!selectedPhoto || isSending) return;
        setIsSending(true);
        try {
            const path = `beams_external/${currentUser?.uid || 'anon'}/${Date.now()}_${selectedPhoto.name}`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, selectedPhoto);
            const url = await getDownloadURL(ref);

            if (navigator.share) {
                await navigator.share({
                    title: 'Foto via Néos Beam',
                    text: 'Te enviei uma foto por aproximação!',
                    url: url
                });
                setStatus('success');
                setTimeout(onClose, 2000);
            } else {
                await navigator.clipboard.writeText(url);
                alert("Link da foto copiado para enviar!");
                setStatus('success');
                setTimeout(onClose, 2000);
            }
        } catch (e) {
            console.error("External share error", e);
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] bg-zinc-950 flex flex-col items-center justify-center p-6 animate-fade-in overflow-hidden">
            <button onClick={onClose} className="absolute top-8 right-8 text-white/20 text-4xl font-thin hover:text-white transition-colors z-[700]">&times;</button>

            <div className="w-full max-w-sm flex flex-col items-center text-center gap-8">
                
                {status === 'off' && (
                    <div className="space-y-10 animate-slide-up w-full">
                        <div className="relative group mx-auto">
                            <div className="absolute inset-0 bg-sky-500/20 rounded-[3.5rem] blur-3xl animate-pulse"></div>
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
                        </div>
                        
                        <div className="space-y-2">
                            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Néos Beam</h2>
                            <p className="text-zinc-500 text-sm px-6 leading-relaxed font-medium">Selecione uma foto e ative o radar para encontrar quem está ao seu redor.</p>
                        </div>

                        <Button 
                            onClick={startRadar}
                            disabled={!selectedPhoto}
                            className="!py-6 !rounded-[2.5rem] !bg-white !text-black !font-black !uppercase !tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-50"
                        >
                            Ativar Radar Beam
                        </Button>
                    </div>
                )}

                {status === 'searching' && (
                    <div className="w-full space-y-8 animate-fade-in">
                        <div className="relative w-48 h-48 mx-auto">
                            <div className="absolute inset-0 border border-sky-500/30 rounded-full animate-ping"></div>
                            <div className="absolute inset-0 border border-sky-500/10 rounded-full animate-pulse scale-150"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-sky-400 to-indigo-500 z-10">
                                    <img src={currentUser?.photoURL || ''} className="w-full h-full rounded-full border-4 border-black object-cover" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-white font-black text-lg uppercase tracking-tighter">Quem está por perto?</h3>
                            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Detectando frequências...</p>
                            
                            <div className="flex flex-col gap-3 max-h-[35vh] overflow-y-auto no-scrollbar py-2">
                                {nearbyUsers.length > 0 ? nearbyUsers.map(user => (
                                    <div
                                        key={user.userId}
                                        onClick={() => handleSendToUser(user)}
                                        className="flex items-center gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] hover:bg-zinc-800 transition-all text-left shadow-xl group cursor-pointer"
                                    >
                                        <div className="relative">
                                            <img src={user.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-sky-500 shadow-md" />
                                            <div className="absolute bottom-0 right-0 bg-green-500 w-3 h-3 rounded-full border-2 border-zinc-900"></div>
                                        </div>
                                        <div className="flex-grow">
                                            <p className="text-white font-bold text-sm">@{user.username}</p>
                                            <p className="text-[10px] text-sky-500 font-black uppercase tracking-widest">Enviar foto agora</p>
                                        </div>
                                        <svg className="w-6 h-6 text-zinc-600 group-hover:text-sky-500 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth={2}/></svg>
                                    </div>
                                )) : (
                                    <div className="py-10 opacity-30">
                                        <p className="text-white text-[10px] font-black uppercase tracking-widest">Nenhum sinal detectado...</p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-zinc-900">
                                <button
                                    onClick={handleExternalShare}
                                    className="w-full py-5 rounded-[2rem] bg-zinc-100 text-black font-black uppercase text-xs tracking-widest shadow-xl hover:bg-white transition-all active:scale-95"
                                >
                                    Compartilhar Link Público
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'beaming' && (
                    <div className="space-y-10 animate-fade-in text-center">
                        <div className="w-40 h-40 bg-sky-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(14,165,233,0.5)]">
                            <svg className="w-20 h-20 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-widest">Beam em progresso...</h3>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-10 animate-slide-up text-center">
                        <div className="w-40 h-40 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                            <svg className="w-20 h-20 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Concluído!</h3>
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