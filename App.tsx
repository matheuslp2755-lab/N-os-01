import React, { useState, useEffect, StrictMode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, updateDoc, serverTimestamp, messaging, getToken, setDoc, collection } from './firebase';
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
          const token = await getToken(messaging, { vapidKey: VAPID_KEY });
          if (token) {
            console.log("Néos FCM: Token gerado com sucesso.");
            
            // Salvar token na subcoleção de dispositivos para suportar múltiplos aparelhos
            const deviceId = btoa(navigator.userAgent).substring(0, 32); // ID simplificado do dispositivo
            const tokenRef = doc(db, 'users', user.uid, 'fcm_tokens', deviceId);
            
            await setDoc(tokenRef, {
              token: token,
              platform: 'web',
              lastUpdated: serverTimestamp(),
              userAgent: navigator.userAgent
            });

            // Atualizar status global do usuário
            await updateDoc(doc(db, 'users', user.uid), {
              notificationsEnabled: true,
              lastTokenSync: serverTimestamp()
            });
          }
        }
      } catch (err) {
        console.error("Néos FCM Error:", err);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Néos SW: Service Worker registrado:', registration.scope);
          setupNotifications();
        })
        .catch((err) => {
          console.error('Néos SW: Erro ao registrar:', err);
        });
    }
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