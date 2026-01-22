
import React, { useState, useEffect } from 'react';
import { db, doc, setDoc, onSnapshot, serverTimestamp } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import { GoogleGenAI } from "@google/genai";
import Button from '../common/Button';

interface NeosCreatorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const NeosCreatorModal: React.FC<NeosCreatorModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [config, setConfig] = useState<any>({
        appName: 'Néos',
        themeColor: '#6366f1',
        enableVibes: true,
        enablePulses: true,
        enableBeam: true,
        enableParadise: true,
        maintenanceMode: false
    });
    const [aiInstruction, setAiInstruction] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isThinking, setIsThinking] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const unsub = onSnapshot(doc(db, 'system', 'config'), (snap) => {
            if (snap.exists()) setConfig(snap.data());
        });
        return () => unsub();
    }, [isOpen]);

    const handleSave = async (newConfig = config) => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'system', 'config'), {
                ...newConfig,
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAIUpdate = async () => {
        if (!aiInstruction.trim()) return;
        setIsThinking(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `A rede social atual tem estas configs: ${JSON.stringify(config)}. 
                O dono quer fazer o seguinte: "${aiInstruction}". 
                Retorne APENAS um JSON atualizado seguindo o mesmo esquema, sem texto extra.`,
                config: { responseMimeType: "application/json" }
            });
            
            const updatedConfig = JSON.parse(response.text);
            setConfig(updatedConfig);
            await handleSave(updatedConfig);
            setAiInstruction('');
            alert("Rede social atualizada pela IA!");
        } catch (e) {
            alert("Erro ao processar comando AI.");
        } finally {
            setIsThinking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-[1100] flex items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-[3rem] overflow-hidden shadow-2xl flex flex-col border dark:border-zinc-800" onClick={e => e.stopPropagation()}>
                
                <header className="p-8 border-b dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/40">
                    <div>
                        <h2 className="text-3xl font-black italic text-sky-500 tracking-tighter">Néos Creator</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Controle Total do Sistema</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 text-4xl font-thin hover:text-sky-500 transition-colors">&times;</button>
                </header>

                <main className="flex-grow overflow-y-auto p-8 space-y-10 no-scrollbar">
                    {/* SEÇÃO AI CORE */}
                    <section className="bg-gradient-to-br from-sky-500/5 to-indigo-500/5 p-6 rounded-[2rem] border border-sky-500/20">
                        <h3 className="text-xs font-black uppercase tracking-widest text-sky-500 mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            AI System Command
                        </h3>
                        <div className="space-y-3">
                            <textarea 
                                value={aiInstruction}
                                onChange={e => setAiInstruction(e.target.value)}
                                placeholder="Ex: 'Mude o nome da rede para Vibe Pro e desative o módulo de Beam'..."
                                className="w-full bg-white dark:bg-zinc-900 border-none rounded-2xl p-4 text-sm font-medium shadow-inner min-h-[100px] resize-none"
                            />
                            <Button 
                                onClick={handleAIUpdate} 
                                disabled={isThinking || !aiInstruction.trim()}
                                className="!bg-sky-500 !py-4 !rounded-2xl !font-black !uppercase !tracking-widest shadow-xl"
                            >
                                {isThinking ? 'Processando Mudanças...' : 'Atualizar Funções via IA'}
                            </Button>
                        </div>
                    </section>

                    {/* SEÇÃO TOGGLES DE FUNÇÕES */}
                    <section className="space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 px-2">Gerenciar Módulos</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                { id: 'enableVibes', label: 'Módulo Vibes (Reels)', color: 'bg-zinc-900' },
                                { id: 'enablePulses', label: 'Módulo Pulses (Stories)', color: 'bg-red-500' },
                                { id: 'enableBeam', label: 'Módulo Beam (Transfer)', color: 'bg-sky-400' },
                                { id: 'enableParadise', label: 'Câmera do Paraíso', color: 'bg-indigo-600' },
                                { id: 'maintenanceMode', label: 'Modo Manutenção', color: 'bg-orange-500' },
                            ].map(opt => (
                                <div key={opt.id} className="flex items-center justify-between p-5 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border dark:border-zinc-800">
                                    <span className="font-bold text-sm">{opt.label}</span>
                                    <button 
                                        onClick={() => handleSave({ ...config, [opt.id]: !config[opt.id] })}
                                        className={`w-12 h-6 rounded-full transition-all relative ${config[opt.id] ? opt.color : 'bg-zinc-300 dark:bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config[opt.id] ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* SEÇÃO VISUAL */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 px-2">Identidade Visual</h3>
                        <div className="flex flex-col gap-4">
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border dark:border-zinc-800">
                                <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Nome do App</label>
                                <input 
                                    type="text" 
                                    value={config.appName} 
                                    onChange={e => setConfig({...config, appName: e.target.value})}
                                    onBlur={() => handleSave()}
                                    className="bg-transparent font-black text-xl outline-none w-full"
                                />
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t dark:border-zinc-800 flex justify-center">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.4em]">Propriedade de Matheuslp2755@gmail.com</p>
                </footer>
            </div>
        </div>
    );
};

export default NeosCreatorModal;
