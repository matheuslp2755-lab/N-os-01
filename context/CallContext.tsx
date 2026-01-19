import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, doc, addDoc, collection, onSnapshot, updateDoc, getDoc, serverTimestamp, query, where, limit } from '../firebase';

const servers = {
  iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
  iceCandidatePoolSize: 10,
};

type CallStatus = 'idle' | 'ringing' | 'ringing-outgoing' | 'ringing-incoming' | 'connected' | 'ended' | 'declined';

interface UserInfo { id: string; username: string; avatar: string; }
interface ActiveCall { callId: string; caller: UserInfo; receiver: UserInfo; status: CallStatus; isVideo: boolean; }

interface CallContextType {
    activeCall: ActiveCall | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    startCall: (receiver: UserInfo, isVideo?: boolean) => Promise<void>;
    answerCall: () => Promise<void>;
    hangUp: () => Promise<void>;
    declineCall: () => Promise<void>;
    switchCamera: () => Promise<void>;
    isVideoEnabled: boolean;
    toggleVideo: () => void;
    isAudioEnabled: boolean;
    toggleAudio: () => void;
    callTimeoutReached: boolean;
    resetCallState: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [callTimeoutReached, setCallTimeoutReached] = useState(false);
    const [callStartTime, setCallStartTime] = useState<number | null>(null);
    
    const pc = useRef<RTCPeerConnection | null>(null);
    const signalingUnsub = useRef<(() => void) | null>(null);
    const candidatesUnsub = useRef<(() => void) | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const stopStream = (stream: MediaStream | null) => {
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                stream.removeTrack(track);
            });
        }
    };

    const resetCallState = useCallback(() => {
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }
        if (signalingUnsub.current) {
            signalingUnsub.current();
            signalingUnsub.current = null;
        }
        if (candidatesUnsub.current) {
            candidatesUnsub.current();
            candidatesUnsub.current = null;
        }
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        
        stopStream(localStream);
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
        setFacingMode('user');
        setIsVideoEnabled(true);
        setIsAudioEnabled(true);
        setCallTimeoutReached(false);
        setCallStartTime(null);
    }, [localStream]);

    // Listener Global para Chamadas Recebidas
    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const q = query(
            collection(db, 'calls'),
            where('receiverId', '==', currentUser.uid),
            where('status', '==', 'ringing'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty && !activeCall) {
                const callDoc = snapshot.docs[0];
                const data = callDoc.data();
                setActiveCall({
                    callId: callDoc.id,
                    caller: { id: data.callerId, username: data.callerUsername, avatar: data.callerAvatar },
                    receiver: { id: data.receiverId, username: data.receiverUsername, avatar: data.receiverAvatar },
                    status: 'ringing-incoming',
                    isVideo: data.type === 'video'
                });
            }
        });

        return () => unsub();
    }, [activeCall]);

    // Lógica de monitoramento do status da chamada atual
    useEffect(() => {
        if (!activeCall?.callId) return;

        const callRef = doc(db, 'calls', activeCall.callId);
        const unsubscribe = onSnapshot(callRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            if (data.status === 'ended' || data.status === 'declined') {
                resetCallState();
                return;
            }

            if (data.status === 'connected' && activeCall.status === 'ringing-outgoing' && data.answer && pc.current && !pc.current.currentRemoteDescription) {
                if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
                await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
                setCallStartTime(Date.now());
            }
        });

        signalingUnsub.current = unsubscribe;
        return () => unsubscribe();
    }, [activeCall?.callId, activeCall?.status, resetCallState]);

    const startCall = async (receiver: UserInfo, isVideo: boolean = false) => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        resetCallState();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: isVideo ? { facingMode: 'user' } : false 
            });
            setLocalStream(stream);
            setIsVideoEnabled(isVideo);

            pc.current = new RTCPeerConnection(servers);
            stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));
            pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);

            const callDocRef = await addDoc(collection(db, 'calls'), {
                callerId: currentUser.uid,
                callerUsername: currentUser.displayName,
                callerAvatar: currentUser.photoURL,
                receiverId: receiver.id,
                receiverUsername: receiver.username,
                receiverAvatar: receiver.avatar,
                status: 'ringing',
                type: isVideo ? 'video' : 'audio',
                timestamp: serverTimestamp()
            });

            pc.current.onicecandidate = (e) => {
                if (e.candidate) addDoc(collection(db, 'calls', callDocRef.id, 'callerCandidates'), e.candidate.toJSON());
            };

            const offer = await pc.current.createOffer();
            await pc.current.setLocalDescription(offer);
            await updateDoc(callDocRef, { offer: { sdp: offer.sdp, type: offer.type } });

            setActiveCall({
                callId: callDocRef.id,
                caller: { id: currentUser.uid, username: currentUser.displayName || '', avatar: currentUser.photoURL || '' },
                receiver,
                status: 'ringing-outgoing',
                isVideo
            });

            // Timeout de 30 segundos se ninguém atender
            timeoutRef.current = window.setTimeout(async () => {
                await updateDoc(callDocRef, { status: 'ended' });
                setCallTimeoutReached(true);
            }, 30000);

        } catch (err) {
            console.error(err);
            resetCallState();
        }
    };

    const answerCall = async () => {
        if (!activeCall) return;
        try {
            const callRef = doc(db, 'calls', activeCall.callId);
            const callSnap = await getDoc(callRef);
            const data = callSnap.data();
            if (!data) return;

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: activeCall.isVideo ? { facingMode: 'user' } : false 
            });
            setLocalStream(stream);

            pc.current = new RTCPeerConnection(servers);
            stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));
            pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);

            pc.current.onicecandidate = (e) => {
                if (e.candidate) addDoc(collection(db, 'calls', activeCall.callId, 'receiverCandidates'), e.candidate.toJSON());
            };

            // Escutar candidatos do outro lado
            const candidatesRef = collection(db, 'calls', activeCall.callId, 'callerCandidates');
            onSnapshot(candidatesRef, (snap) => {
                snap.docChanges().forEach((change) => {
                    if (change.type === 'added' && pc.current?.remoteDescription) {
                        pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                    }
                });
            });

            await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);

            await updateDoc(callRef, {
                answer: { sdp: answer.sdp, type: answer.type },
                status: 'connected'
            });

            setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
            setCallStartTime(Date.now());
        } catch (err) {
            console.error(err);
            resetCallState();
        }
    };

    const declineCall = async () => {
        if (activeCall?.callId) {
            await updateDoc(doc(db, 'calls', activeCall.callId), { status: 'declined' });
        }
        resetCallState();
    };

    const hangUp = async () => {
        if (activeCall?.callId) {
            await updateDoc(doc(db, 'calls', activeCall.callId), { status: 'ended' });
        }
        resetCallState();
    };

    const toggleVideo = () => {
        if (localStream?.getVideoTracks()[0]) {
            localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
            setIsVideoEnabled(localStream.getVideoTracks()[0].enabled);
        }
    };

    const toggleAudio = () => {
        if (localStream?.getAudioTracks()[0]) {
            localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
            setIsAudioEnabled(localStream.getAudioTracks()[0].enabled);
        }
    };

    const switchCamera = async () => {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        try {
            await videoTrack.applyConstraints({ facingMode: newMode });
            setFacingMode(newMode);
        } catch (e) { console.warn(e); }
    };

    return (
        <CallContext.Provider value={{ 
            activeCall, localStream, remoteStream, startCall, answerCall, hangUp, declineCall, 
            switchCamera, isVideoEnabled, toggleVideo, isAudioEnabled, toggleAudio,
            callTimeoutReached, resetCallState
        }}>
            {children}
        </CallContext.Provider>
    );
};

export const useCall = () => {
    const context = useContext(CallContext);
    if (!context) throw new Error('useCall must be used within a CallProvider');
    return context;
};