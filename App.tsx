import React, { useState, useEffect, StrictMode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, updateDoc, serverTimestamp } from './firebase';
import Login from './components/Login';
import SignUp from './context/SignUp';
import Feed from './components/Feed';
import { LanguageProvider } from './context/LanguageContext';
import { CallProvider } from './context/CallContext';
import CallUI from './components/call/CallUI';

declare global {
  interface Window {
    OneSignalDeferred: any[];
  }
}

const AppContent: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [authPage, setAuthPage] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (!user) return;

    // Sincronização de Identidade OneSignal <-> Firebase
    const syncOneSignalIdentity = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          console.log("Néos Push: Vinculando usuário ao OneSignal...", user.uid);
          
          // Vincula este dispositivo ao UID do Firebase (External ID)
          await OneSignal.login(user.uid);
          
          // Garante que o usuário está inscrito se deu permissão
          if (Notification.permission === 'granted') {
            await OneSignal.User.PushSubscription.optIn();
          }

          // Salva o ID de subscrição no Firestore para monitoramento técnico
          const subscriptionId = OneSignal.User.PushSubscription.id;
          if (subscriptionId) {
            await updateDoc(doc(db, 'users', user.uid), {
              oneSignalSubscriptionId: subscriptionId,
              pushEnabled: true,
              lastPushSync: serverTimestamp()
            });
          }
        } catch (err) {
          console.error("Néos Push Sync Error:", err);
        }
      });
    };

    // Executa a sincronização após o login
    const timer = setTimeout(syncOneSignalIdentity, 2000);
    return () => clearTimeout(timer);
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