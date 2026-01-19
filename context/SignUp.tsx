import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth, db, setDoc, doc, storage, storageRef, uploadBytes, getDownloadURL, serverTimestamp, collection, query, where, getDocs, limit } from '../firebase';
import TextInput from '../components/common/TextInput';
import Button from '../components/common/Button';
import { useLanguage } from './LanguageContext';

const SignUp: React.FC<{ onSwitchMode: () => void }> = ({ onSwitchMode }) => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const { t } = useLanguage();

  const isFormValid = email.includes('@') && username.trim() !== '' && password.trim().length >= 6 && age !== '';

  const checkUsernameAvailable = async (name: string) => {
    const q = query(collection(db, 'users'), where('username_lowercase', '==', name.toLowerCase()), limit(1));
    const snap = await getDocs(q);
    return snap.empty;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 12) {
        setError("Desculpe, você deve ter pelo menos 12 anos para criar uma conta no Néos.");
        return;
    }

    setLoading(true);
    setError('');
    try {
      // 1. Verificar se username já existe
      const available = await checkUsernameAvailable(username);
      if (!available) {
        setError("Este nome de usuário já está em uso. Escolha outro.");
        setLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(user);
      localStorage.removeItem(`hasSeenWelcome_Vibe_${user.uid}`);

      const initial = username.charAt(0).toUpperCase();
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b'];
      const color = colors[initial.charCodeAt(0) % colors.length];
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><rect width="100%" height="100%" fill="${color}" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="75" fill="#ffffff">${initial}</text></svg>`;
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      const avatarRef = storageRef(storage, `avatars/${user.uid}/avatar.svg`);
      await uploadBytes(avatarRef, svgBlob);
      const avatarUrl = await getDownloadURL(avatarRef);

      await updateProfile(user, { displayName: username, photoURL: avatarUrl });
      await setDoc(doc(db, 'users', user.uid), {
        username, 
        username_lowercase: username.toLowerCase(), 
        email, 
        avatar: avatarUrl,
        age: ageNum, 
        bio: '', 
        isPrivate: false, 
        createdAt: serverTimestamp(), 
        lastSeen: serverTimestamp(),
        language: 'pt-BR', 
        isAnonymous: false,
      });

      setVerificationSent(true);
    } catch (err: any) {
      setError(err.code === 'auth/email-already-in-use' ? t('signup.emailInUseError') : t('signup.genericError'));
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="w-full max-w-md px-6 animate-fade-in">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 rounded-[3.5rem] p-10 md:p-12 shadow-2xl text-center">
          <div className="w-20 h-20 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-4 uppercase italic tracking-tighter">Verifique seu E-mail</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-8 leading-relaxed">
            Enviamos um link de confirmação para <b>{email}</b>.<br/> 
            Por favor, clique no link para ativar sua conta no Néos.
          </p>
          <Button onClick={() => window.location.reload()} className="!py-4 !rounded-2xl !font-black !uppercase shadow-xl">
            Já verifiquei meu e-mail
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md px-6 animate-fade-in">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 rounded-[3.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden group">
            <h1 className="text-5xl font-black italic text-center mb-2 bg-gradient-to-r from-indigo-500 to-pink-500 text-transparent bg-clip-text">Néos</h1>
            <h2 className="text-zinc-500 dark:text-zinc-400 font-bold text-center mb-10 text-xs uppercase tracking-widest">
                {t('signup.subtitle')}
            </h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
                <TextInput id="email" type="email" label={t('signup.emailLabel')} value={email} onChange={e => setEmail(e.target.value)} className="!rounded-2xl" />
                <TextInput id="username" type="text" label={t('signup.usernameLabel')} value={username} onChange={e => setUsername(e.target.value)} className="!rounded-2xl" />
                <TextInput id="password" type="password" label={t('signup.passwordLabel')} value={password} onChange={e => setPassword(e.target.value)} className="!rounded-2xl" />
                <TextInput id="age" type="number" label="Qual sua idade?" value={age} onChange={e => setAge(e.target.value)} className="!rounded-2xl" />
                
                {error && <p className="text-red-500 text-[10px] font-black text-center uppercase tracking-widest">{error}</p>}
                
                <Button type="submit" disabled={!isFormValid || loading} className="mt-4 !py-4 !rounded-2xl !font-black !uppercase !bg-gradient-to-r !from-pink-600 !to-rose-600 shadow-xl shadow-pink-500/20 active:scale-95 transition-all">
                    {loading ? t('signup.signingUpButton') : t('signup.signUpButton')}
                </Button>
            </form>
        </div>
        
        <div className="mt-8 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-white/20 dark:border-zinc-800/50 rounded-[2.5rem] p-6 text-center">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {t('signup.haveAccount')}{' '}
                <button onClick={onSwitchMode} className="font-black text-indigo-500 hover:text-indigo-600 ml-1 uppercase text-xs tracking-wider">
                    {t('signup.logInLink')}
                </button>
            </p>
        </div>
    </div>
  );
};

export default SignUp;