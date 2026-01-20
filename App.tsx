import React, { useState, useEffect, StrictMode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, updateDoc, serverTimestamp, messaging, getToken, setDoc } from './firebase';
import Login from './components/Login';
import SignUp from './context/SignUp';
import Feed from './components/Feed';
import { LanguageProvider } from './context/LanguageContext';
import { CallProvider } from './context/CallContext';
import CallUI from './components/call/CallUI';

const VAPID_KEY = "lSw8bku7Z9y7-520kNooBcOJl2OGYWRnjnYcj23kZaI";

const AppContent: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [authPage, setAuthPage] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (!user || !messaging) return;

    const setupNotifications = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // Registro explícito do service worker para o FCM
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          
          const token = await getToken(messaging, { 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
          });

          if (token) {
            console.log("Néos FCM: Token capturado:", token);
            
            // Gerar ID único para este navegador/dispositivo
            const deviceId = btoa(navigator.userAgent).substring(0, 32); 
            const tokenRef = doc(db, 'users', user.uid, 'fcm_tokens', deviceId);
            
            await setDoc(tokenRef, {
              token: token,
              platform: 'web',
              lastUpdated: serverTimestamp(),
              userAgent: navigator.userAgent
            });

            await updateDoc(doc(db, 'users', user.uid), {
              pushEnabled: true,
              lastTokenSync: serverTimestamp()
            });
          }
        }
      } catch (err) {
        console.error("Néos FCM Error:", err);
      }
    };

    setupNotifications();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return (
    <div className="bg-black min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-sky-500"></div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      {authPage === 'login' ? (
        <Login onSwitchMode={() => setAuthPage('signup')} />
      ) : (
        <SignUp onSwitchMode={() => setAuthPage('login')} />
      )}
    </div>
  );

  return <Feed />;
};

const App: React.FC = () => (
  <StrictMode>
    <LanguageProvider>
      <CallProvider>
        <AppContent />
        <CallUI />
      </CallProvider>
    </LanguageProvider>
  </StrictMode>
);

export default App;