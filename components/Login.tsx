
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import TextInput from './common/TextInput';
import Button from './common/Button';
import { useLanguage } from '../context/LanguageContext';

const AppLogo: React.FC = () => {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col items-center mb-12">
            <h1 className="text-7xl font-black italic bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-500 text-transparent bg-clip-text tracking-tighter drop-shadow-[0_10px_20px_rgba(168,85,247,0.4)] animate-float">
                {t('login.title')}
            </h1>
            <div className="h-1.5 w-12 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full mt-2 opacity-50"></div>
        </div>
    )
};

interface LoginProps {
  onSwitchMode: () => void;
}

const Login: React.FC<LoginProps> = ({ onSwitchMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const { t } = useLanguage();

  const isFormValid = email.includes('@') && password.trim().length >= 6;

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError(t('login.error'));
      } else if (err.code === 'auth/too-many-requests') {
        setError("Muitas tentativas. Tente novamente mais tarde.");
      } else {
        setError(t('login.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError('');
    setResetSuccess('');
    try {
        await sendPasswordResetEmail(auth, resetEmail);
        setResetSuccess("Link enviado! Verifique seu e-mail.");
    } catch (err: any) {
        setResetError("E-mail não encontrado ou erro no servidor.");
    } finally {
        setResetLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-6 animate-fade-in">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 rounded-[3.5rem] p-10 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] relative overflow-hidden group">
            {/* Elemento decorativo de fundo */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full group-hover:bg-purple-500/20 transition-colors duration-1000"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full group-hover:bg-blue-500/20 transition-colors duration-1000"></div>

            {mode === 'login' ? (
                <>
                    <AppLogo />
                    <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 relative z-10">
                        <TextInput
                            id="email"
                            type="email"
                            label={t('login.emailLabel')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="!rounded-2xl !bg-white/50 dark:!bg-zinc-900/50 border-none shadow-inner"
                        />
                        <TextInput
                            id="password"
                            type="password"
                            label={t('login.passwordLabel')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="!rounded-2xl !bg-white/50 dark:!bg-zinc-900/50 border-none shadow-inner"
                        />
                        {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center animate-shake">{error}</p>}
                        <Button type="submit" disabled={!isFormValid || loading} className="mt-4 !py-4 !rounded-2xl !font-black !uppercase !tracking-[0.2em] !bg-gradient-to-r !from-indigo-600 !to-purple-600 !shadow-xl !shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all">
                            {loading ? t('login.loggingInButton') : t('login.loginButton')}
                        </Button>
                    </form>

                    <div className="mt-8 text-center relative z-10">
                        <button
                            onClick={() => setMode('reset')}
                            className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors"
                        >
                            {t('login.forgotPassword')}
                        </button>
                    </div>
                </>
            ) : (
                <div className="animate-slide-up">
                    <h2 className="text-2xl font-black mb-2 text-center">{t('resetPassword.title')}</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs text-center mb-8 font-medium px-4">{t('resetPassword.instructions')}</p>
                    
                    {resetSuccess ? (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-green-500 text-xs font-bold text-center">
                            {resetSuccess}
                        </div>
                    ) : (
                        <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
                            <TextInput
                                id="reset-email"
                                type="email"
                                label={t('resetPassword.emailLabel')}
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                className="!rounded-2xl"
                            />
                            {resetError && <p className="text-red-500 text-[10px] font-black text-center">{resetError}</p>}
                            <Button type="submit" disabled={!resetEmail.includes('@') || resetLoading} className="!py-4 !rounded-2xl !font-black !uppercase">
                                {resetLoading ? "Aguarde..." : "Enviar Link"}
                            </Button>
                        </form>
                    )}
                    <button onClick={() => setMode('login')} className="w-full mt-6 text-[10px] font-black uppercase tracking-widest text-zinc-400">{t('resetPassword.backToLogin')}</button>
                </div>
            )}
        </div>
        
        <div className="mt-8 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-white/20 dark:border-zinc-800/50 rounded-[2.5rem] p-6 text-center animate-slide-up">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {t('login.noAccount')}{' '}
            <button
              onClick={onSwitchMode}
              className="font-black text-indigo-500 hover:text-indigo-600 ml-1 uppercase text-xs tracking-wider"
            >
              {t('login.signUpLink')}
            </button>
          </p>
        </div>

        <style>{`
            @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
            .animate-float { animation: float 6s ease-in-out infinite; }
            @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
            .animate-shake { animation: shake 0.3s ease-in-out; }
        `}</style>
    </div>
  );
};

export default Login;
