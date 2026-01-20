
import React, { useState, useEffect, StrictMode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, updateDoc, serverTimestamp } from './firebase';
import Login from './components/Login';
import SignUp from './context/SignUp';
import Feed from './components/Feed';
import { LanguageProvider } from './context/LanguageContext';
import { CallProvider } from './context/CallContext';
import CallUI from './components/call/CallUI';

// Fixed TypeScript errors by declaring OneSignalDeferred on the window object
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // Sincronizar usuário logado com OneSignal External ID
      if (currentUser) {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal: any) {
          await OneSignal.login(currentUser.uid);
          console.log("Néos: Usuário sincronizado com OneSignal:", currentUser.uid);
        });
      } else {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal: any) {
          await OneSignal.logout();
        });
      }
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