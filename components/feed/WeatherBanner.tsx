import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface WeatherData {
    temp: number;
    code: number;
    isDay: boolean;
    city: string;
    region: string;
}

const WeatherBanner: React.FC = () => {
    const { t } = useLanguage();
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords;
                    
                    // 1. Busca Clima Real (Open-Meteo)
                    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`);
                    if (!weatherRes.ok) throw new Error("Weather API failed");
                    const weatherData = await weatherRes.json();

                    // 2. Busca Nome da Localização Real (Nominatim com Fallback)
                    let city = "Sua Localização";
                    let region = "";
                    
                    try {
                        // Nominatim exige User-Agent amigável ou identificável em produção, enviando headers simples
                        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`, {
                            headers: { 'Accept-Language': 'pt-BR' }
                        });
                        if (geoRes.ok) {
                            const geoData = await geoRes.json();
                            if (geoData.address) {
                                city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.suburb || "Sua Localização";
                                region = geoData.address.state || geoData.address.country || "";
                            }
                        }
                    } catch (e) {
                        console.warn("Geocoding fetch failed, using fallback name");
                    }

                    if (weatherData.current_weather) {
                        setWeather({
                            temp: Math.round(weatherData.current_weather.temperature),
                            code: weatherData.current_weather.weathercode,
                            isDay: weatherData.current_weather.is_day === 1,
                            city: city,
                            region: region
                        });
                    }
                } catch (e) {
                    // Silenciamos erro de fetch para não poluir o log se for apenas rede instável
                    console.debug("Context fetch error:", e);
                } finally {
                    setLoading(false);
                }
            }, () => setLoading(false), { 
                enableHighAccuracy: false, // Menos agressivo para evitar timeout
                timeout: 10000,
                maximumAge: 60000 
            });
        } else {
            setLoading(false);
        }
    }, []);

    if (loading || !weather) return null;

    /**
     * WMO Weather interpretation codes:
     * 0: Céu limpo (Sol)
     * 1, 2, 3: Nublado
     * 45, 48: Nevoeiro
     * 51-99: Chuva / Neve / Tempestade
     */
    const isRain = weather.code >= 51; 
    const isClear = weather.code === 0;
    const isCloudy = weather.code >= 1 && weather.code <= 3;

    return (
        <div className={`relative w-full mb-6 p-6 rounded-[2.5rem] overflow-hidden shadow-2xl border transition-all duration-1000 ${
            isRain 
                ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-indigo-500/30' 
                : isClear 
                    ? 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 border-white/20' 
                    : 'bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border-zinc-700'
        }`}>
            {/* Efeito de Chuva Ativo se for detectado precipitação */}
            {isRain && (
                <div className="absolute inset-0 pointer-events-none opacity-40">
                    {Array.from({ length: 30 }).map((_, i) => (
                        <div 
                            key={i} 
                            className="absolute bg-sky-200/50 w-[1.5px] h-14 animate-rain-drop"
                            style={{ 
                                left: `${Math.random() * 100}%`, 
                                top: '-60px',
                                animationDelay: `${Math.random() * 2}s`,
                                animationDuration: `${0.3 + Math.random() * 0.4}s`
                            }}
                        />
                    ))}
                </div>
            )}

            {isClear && (
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-[60px] rounded-full animate-pulse"></div>
            )}

            <div className="relative z-10 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">
                        {isRain ? 'Atmosfera Chuvosa' : isClear ? 'Céu Aberto' : 'Tempo Nublado'}
                    </span>
                    <h2 className="text-2xl font-black text-white italic tracking-tighter">
                        {isRain ? 'Chovendo no Néos 🌧️' : isClear ? 'Sol no Néos ☀️' : 'Nublado no Néos ☁️'}
                    </h2>
                    
                    <div className="mt-2 flex flex-col">
                        <div className="flex items-baseline gap-1">
                            <p className="text-5xl font-black text-white tracking-tighter">
                                {weather.temp}°
                            </p>
                            <span className="text-xl font-bold text-white/60 uppercase">C</span>
                        </div>
                        <p className="text-xs font-bold text-white/90 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-sky-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            {weather.city}{weather.region ? `, ${weather.region}` : ''}
                        </p>
                    </div>
                </div>
                
                <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-24 h-24 bg-white/10 backdrop-blur-2xl rounded-[2.5rem] border border-white/20 shadow-inner relative">
                        <span className="text-5xl animate-bounce-subtle relative z-10">
                            {isRain ? '⛈️' : isClear ? '🌞' : '🌥️'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/50">Clima Local Sincronizado</span>
                </div>
                <span className="text-[9px] font-bold text-white/30 italic uppercase">Néos Weather Real-Time</span>
            </div>

            <style>{`
                @keyframes rain-drop {
                    to { transform: translateY(300px); opacity: 0; }
                }
                .animate-rain-drop {
                    animation: rain-drop linear infinite;
                }
                @keyframes bounce-subtle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-bounce-subtle {
                    animation: bounce-subtle 4s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};

export default WeatherBanner;