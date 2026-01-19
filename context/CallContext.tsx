import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { auth, db, doc, addDoc, collection, onSnapshot, updateDoc, getDoc, serverTimestamp } from '../firebase';

const servers = {
  iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
  iceCandidatePoolSize: 10,
};

type CallStatus = 'idle' | 'ringing-outgoing' | 'ringing-incoming' | 'connected' | 'ended' | 'declined';

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
    setIncomingCall: (callData: any) => void;
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

    const logCallToChat = async (call: ActiveCall, durationSeconds: number) => {
        const conversationId = [call.caller.id, call.receiver.id].sort().join('_');
        const durationFormatted = durationSeconds < 60 
            ? `${durationSeconds}s` 
            : `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
        
        const label = call.isVideo ? 'Vídeo' : 'Voz';
        const msgText = `Chamada de ${label} encerrada • ${durationFormatted}`;

        try {
            await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
                senderId: 'system_call_log',
                text: msgText,
                timestamp: serverTimestamp(),
                type: 'call_log',
                isVideo: call.isVideo,
                duration: durationSeconds
            });
            await updateDoc(doc(db, 'conversations', conversationId), {
                lastMessage: { text: `📞 ${msgText}`, senderId: 'system', timestamp: serverTimestamp() },
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error("Erro ao logar chamada:", e); }
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
        
        if (callStartTime && activeCall && activeCall.status === 'connected') {
            const duration = Math.floor((Date.now() - callStartTime) / 1000);
            logCallToChat(activeCall, duration);
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
    }, [localStream, callStartTime, activeCall]);

    useEffect(() => {
        if (activeCall?.status === 'ringing-outgoing') {
            setCallTimeoutReached(false);
            timeoutRef.current = window.setTimeout(async () => {
                if (activeCall?.status === 'ringing-outgoing') {
                    setCallTimeoutReached(true);
                    if (activeCall.callId) {
                        await updateDoc(doc(db, 'calls', activeCall.callId), { status: 'ended' });
                    }
                    if (pc.current) {
                        pc.current.close();
                        pc.current = null;
                    }
                    stopStream(localStream);
                    setLocalStream(null);
                }
            }, 15000);
        }
        return () => {
            if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        };
    }, [activeCall?.status, activeCall?.callId, localStream]);

    useEffect(() => {
        if (!activeCall?.callId) return;

        const callRef = doc(db, 'calls', activeCall.callId);
        const unsubscribe = onSnapshot(callRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            if (data.status === 'ended' || data.status === 'declined') {
                if (!callTimeoutReached) resetCallState();
                return;
            }

            if (data.status === 'connected' && !callStartTime) {
                setCallStartTime(Date.now());
            }

            if (data.answer && pc.current && !pc.current.currentRemoteDescription) {
                if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
                const answerDescription = new RTCSessionDescription(data.answer);
                await pc.current.setRemoteDescription(answerDescription);
                setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
            }
        });

        signalingUnsub.current = unsubscribe;
        return () => unsubscribe();
    }, [activeCall?.callId, resetCallState, callTimeoutReached, callStartTime]);

    useEffect(() => {
        if (!activeCall?.callId || !pc.current) return;

        const currentUser = auth.currentUser;
        const collectionName = activeCall.caller.id === currentUser?.uid ? 'receiverCandidates' : 'callerCandidates';
        const candidatesRef = collection(db, 'calls', activeCall.callId, collectionName);

        const unsubscribe = onSnapshot(candidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (pc.current && pc.current.remoteDescription) {
                        pc.current.addIceCandidate(new RTCIceCandidate(data)).catch(e => console.error("ICE error", e));
                    }
                }
            });
        });

        candidatesUnsub.current = unsubscribe;
        return () => unsubscribe();
    }, [activeCall?.callId, activeCall?.status]);

    const switchCamera = async () => {
        if (!localStream || !activeCall?.isVideo) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        try {
            await videoTrack.applyConstraints({ facingMode: newMode });
            setFacingMode(newMode);
        } catch (e) {
            const newStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: newMode }, 
                audio: isAudioEnabled 
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            if (pc.current) {
                const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            videoTrack.stop();
            localStream.removeTrack(videoTrack);
            localStream.addTrack(newVideoTrack);
            setFacingMode(newMode);
        }
    };

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

    const hangUp = async () => {
        if (activeCall?.callId) {
            await updateDoc(doc(db, 'calls', activeCall.callId), { status: 'ended' });
        }
        resetCallState();
    };

    const declineCall = async () => {
        if (activeCall?.callId) {
            await updateDoc(doc(db, 'calls', activeCall.callId), { status: 'declined' });
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

    return (
        <CallContext.Provider value={{ 
            activeCall, localStream, remoteStream, startCall, answerCall, hangUp, declineCall, 
            setIncomingCall: setActiveCall, switchCamera, isVideoEnabled, toggleVideo, isAudioEnabled, toggleAudio,
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