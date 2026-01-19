
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface WelcomeAnimationProps {
  onAnimationEnd: () => void;
  weather?: 'rain' | 'sun' | 'clear' | null;
}

const WelcomeAnimation: React.FC<WelcomeAnimationProps> = ({ onAnimationEnd, weather }) => {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('visible'), 100);
    const exitTimer = setTimeout(() => setPhase('exiting'), 4200);
    const totalTimer = setTimeout(() => onAnimationEnd(), 5000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [onAnimationEnd]);

  const getWeatherMessage = () => {
    if (weather === 'rain') return "Sinta a garoa no Néos 🌧️";
    if (weather === 'sun') return "Aproveite o brilho do sol no Néos ☀️";
    return t('welcome.title');
  };

  return (
    <div className={`fixed inset-0 z-[1100] flex items-center justify-center overflow-hidden transition-all duration-1000 ${phase === 'exiting' ? 'opacity-0 scale-110' : 'opacity-100'} ${weather === 'rain' ? 'bg-slate-950/90' : 'bg-black'}`}>
      {/* Fundo Contextual */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 bg-gradient-to-br transition-colors duration-1000 ${weather === 'rain' ? 'from-blue-900/40 via-black to-slate-900' : 'from-indigo-900 via-black to-purple-900'} opacity-60 animate-pulse`}></div>
        
        {/* Efeitos de Clima na Entrada */}
        {weather === 'rain' && (
          <div className="absolute inset-0 pointer-events-none opacity-40">
             {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="drop" style={{ left: `${Math.random()*100}%`, animationDelay: `${Math.random()*2}s`, width: '1px', height: '100px', background: 'white', position: 'absolute', top: '-150px', animation: 'fall 0.8s linear infinite' }} />
             ))}
          </div>
        )}

        {/* Nebulosa */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px] animate-nebula ${weather === 'sun' ? 'bg-amber-500/20' : 'bg-sky-500/20'}`}></div>
      </div>

      {/* Conteúdo Central */}
      <div className={`relative z-10 flex flex-col items-center transition-all duration-[2000ms] ease-out ${phase === 'entering' ? 'opacity-0 scale-50 blur-xl' : 'opacity-100 scale-100 blur-0'}`}>
        <h1 className="text-7xl md:text-9xl font-black italic bg-gradient-to-b from-white via-white to-sky-400 text-transparent bg-clip-text tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.4)] animate-vibe-float">
          {t('login.title')}
        </h1>
        <div className={`mt-6 overflow-hidden transition-all duration-1000 delay-500 ${phase === 'visible' ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
          <p className="text-white font-black uppercase tracking-[0.4em] text-xs md:text-sm text-center px-6">
            {getWeatherMessage()}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes nebula {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 0.2; }
          50% { transform: translate(-55%, -45%) scale(1.2) rotate(180deg); opacity: 0.4; }
        }
        @keyframes vibe-float {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          50% { transform: translateY(-20px) scale(1.05); filter: brightness(1.3); }
        }
        @keyframes fall { to { transform: translateY(120vh); } }
        .animate-nebula { animation: nebula 10s infinite linear; }
        .animate-vibe-float { animation: vibe-float 4s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default WelcomeAnimation;
