import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
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
        setError("Mínimo 12 anos para participar.");
        return;
    }

    setLoading(true);
    setError('');
    try {
      const available = await checkUsernameAvailable(username);
      if (!available) {
        setError("Usuário já existe.");
        setLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Gerar Avatar padrão
      const initial = username.charAt(0).toUpperCase();
      const colors = ['#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
      const color = colors[initial.charCodeAt(0) % colors.length];
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><rect width="100%" height="100%" fill="${color}" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="80" fill="#ffffff">${initial}</text></svg>`;
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      const avatarRef = storageRef(storage, `avatars/${user.uid}/avatar.svg`);
      await uploadBytes(avatarRef, svgBlob);
      const avatarUrl = await getDownloadURL(avatarRef);

      await updateProfile(user, { displayName: username, photoURL: avatarUrl });
      
      // Criar documento no Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        username, 
        username_lowercase: username.toLowerCase(), 
        email, 
        avatar: avatarUrl,
        age: ageNum, 
        bio: '', 
        isPrivate: false, 
        createdAt: serverTimestamp(), 
        lastSeen: serverTimestamp(),
        isAnonymous: false,
        appearOnRadar: true,
        isVerified: false
      });

      // O login automático do Firebase cuidará do redirecionamento
    } catch (err: any) {
      console.error("SignUp Error:", err);
      setError(err.code === 'auth/email-already-in-use' ? "E-mail já cadastrado." : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-6 animate-fade-in">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 rounded-[3.5rem] p-10 md:p-12 shadow-2xl relative overflow-hidden">
            <h1 className="text-5xl font-black italic text-center mb-2 bg-gradient-to-r from-indigo-500 to-pink-500 text-transparent bg-clip-text">Néos</h1>
            <h2 className="text-zinc-500 dark:text-zinc-400 font-bold text-center mb-10 text-xs uppercase tracking-widest">
                Crie sua conta agora
            </h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
                <TextInput id="email" type="email" label="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="!rounded-2xl" />
                <TextInput id="username" type="text" label="Usuário" value={username} onChange={e => setUsername(e.target.value)} className="!rounded-2xl" />
                <TextInput id="password" type="password" label="Senha (6+ dígitos)" value={password} onChange={e => setPassword(e.target.value)} className="!rounded-2xl" />
                <TextInput id="age" type="number" label="Idade" value={age} onChange={e => setAge(e.target.value)} className="!rounded-2xl" />
                
                {error && <p className="text-red-500 text-[10px] font-black text-center uppercase tracking-widest">{error}</p>}
                
                <Button type="submit" disabled={!isFormValid || loading} className="mt-4 !py-4 !rounded-2xl !font-black !uppercase !bg-gradient-to-r !from-indigo-600 !to-purple-600 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">
                    {loading ? "Criando..." : "Criar Conta"}
                </Button>
            </form>
        </div>
        
        <div className="mt-8 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-white/20 dark:border-zinc-800/50 rounded-[2.5rem] p-6 text-center">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Já tem uma conta?{' '}
                <button onClick={onSwitchMode} className="font-black text-indigo-500 hover:text-indigo-600 ml-1 uppercase text-xs tracking-wider">
                    Entrar
                </button>
            </p>
        </div>
    </div>
  );
};

export default SignUp;