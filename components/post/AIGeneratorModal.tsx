
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';

interface AIGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImageGenerated: (file: File, preview: string) => void;
}

type AspectRatio = "1:1" | "9:16" | "3:4" | "16:9";
type ImageSize = "1K" | "2K" | "4K";

const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({ isOpen, onClose, onImageGenerated }) => {
    const { t } = useLanguage();
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
    const [generatedFile, setGeneratedFile] = useState<File | null>(null);
    const [error, setError] = useState('');
    const [hasKey, setHasKey] = useState(false);

    // Configurações Pro
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
    const [imageSize, setImageSize] = useState<ImageSize>("1K");

    useEffect(() => {
        if (isOpen) {
            checkApiKey();
        }
    }, [isOpen]);

    const checkApiKey = async () => {
        if (window.aistudio) {
            const selected = await window.aistudio.hasSelectedApiKey();
            setHasKey(selected);
        }
    };

    const handleSelectKey = async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            setHasKey(true);
        }
    };

    const handleGenerate = async () => {
        const queryPrompt = String(prompt).trim();
        if (!queryPrompt || isGenerating) return;

        setIsGenerating(true);
        setError('');
        setGeneratedPreview(null);
        setGeneratedFile(null);

        try {
            // Nova instância para garantir a chave mais recente do process.env
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Refinamento do prompt. Importante: enviamos apenas strings simples
            const enhancedPrompt = `High quality, cinematic photography, highly detailed, ${queryPrompt}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: enhancedPrompt,
                config: {
                    imageConfig: { 
                        aspectRatio, 
                        imageSize 
                    }
                }
            });

            let foundImage = false;
            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64Data = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        const imageUrl = `data:${mimeType};base64,${base64Data}`;
                        
                        const res = await fetch(imageUrl);
                        const blob = await res.blob();
                        const file = new File([blob], `vibe-pro-${Date.now()}.png`, { type: mimeType });

                        setGeneratedPreview(imageUrl);
                        setGeneratedFile(file);
                        foundImage = true;
                        break;
                    }
                }
            }

            if (!foundImage) setError(t('aiGenerator.error'));

        } catch (err: any) {
            console.error("AI Pro Generation Error:", err);
            if (err.message?.includes("Requested entity was not found")) {
                setHasKey(false);
                setError(t('aiGenerator.connectKey'));
            } else {
                setError(t('aiGenerator.error'));
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirm = () => {
        if (generatedFile && generatedPreview) {
            onImageGenerated(generatedFile, generatedPreview);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-0 md:p-6 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] md:rounded-[3rem] overflow-hidden shadow-2xl flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
                
                <div className="flex-grow bg-zinc-100 dark:bg-zinc-900 relative flex items-center justify-center overflow-hidden border-r dark:border-zinc-800">
                    {isGenerating ? (
                        <div className="flex flex-col items-center gap-6 text-center p-10">
                            <div className="relative w-24 h-24">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] animate-spin-slow opacity-20"></div>
                                <div className="absolute inset-2 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-[1.5rem] animate-pulse"></div>
                            </div>
                            <p className="text-sm font-black text-zinc-500 uppercase tracking-[0.3em] animate-pulse">{t('aiGenerator.generating')}</p>
                        </div>
                    ) : generatedPreview ? (
                        <img src={generatedPreview} className="w-full h-full object-contain animate-fade-in" alt="AI Generated" />
                    ) : (
                        <div className="text-center p-12 opacity-20 group">
                            <svg className="w-32 h-32 mx-auto mb-6 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" strokeWidth={1}/></svg>
                            <p className="font-black text-lg uppercase tracking-widest">Vibe AI Pro Studio</p>
                        </div>
                    )}
                    <button onClick={onClose} className="absolute top-6 right-6 md:hidden text-zinc-400 text-3xl">&times;</button>
                </div>

                <div className="w-full md:w-[380px] p-8 flex flex-col bg-white dark:bg-zinc-950">
                    <header className="hidden md:flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-black italic bg-gradient-to-r from-indigo-500 to-pink-500 text-transparent bg-clip-text">
                            {t('aiGenerator.title')}
                        </h2>
                        <button onClick={onClose} className="text-zinc-400 text-3xl font-light hover:text-zinc-600 transition-colors">&times;</button>
                    </header>

                    {!hasKey ? (
                        <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6">
                            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] border border-dashed dark:border-zinc-800">
                                <svg className="w-12 h-12 mx-auto mb-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeWidth={2}/></svg>
                                <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">{t('aiGenerator.keyRequired')}</p>
                                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-500 font-black uppercase tracking-widest mt-2 block hover:underline">
                                    {t('aiGenerator.billingInfo')}
                                </a>
                            </div>
                            <Button onClick={handleSelectKey} className="!py-4 !rounded-2xl !font-black !uppercase !tracking-widest shadow-xl">
                                {t('aiGenerator.connectKey')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex-grow space-y-8 flex flex-col">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">{t('aiGenerator.promptLabel')}</label>
                                <textarea 
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border-none rounded-[1.5rem] p-5 text-sm font-medium focus:ring-2 ring-indigo-500/20 min-h-[120px] resize-none shadow-inner"
                                    placeholder={t('aiGenerator.promptPlaceholder')}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    disabled={isGenerating}
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">{t('aiGenerator.ratio')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["1:1", "9:16", "3:4"] as AspectRatio[]).map(r => (
                                        <button 
                                            key={r}
                                            onClick={() => setAspectRatio(r)}
                                            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter border transition-all ${aspectRatio === r ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black dark:border-white shadow-lg' : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-400'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">{t('aiGenerator.quality')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["1K", "2K"] as ImageSize[]).map(s => (
                                        <button 
                                            key={s}
                                            onClick={() => setImageSize(s)}
                                            className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${imageSize === s ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg' : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-400'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-auto pt-6 space-y-3">
                                {generatedPreview ? (
                                    <Button 
                                        onClick={handleConfirm}
                                        className="!bg-gradient-to-r !from-green-500 !to-emerald-600 !py-5 !rounded-[1.5rem] !font-black !uppercase !tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                        {t('aiGenerator.useImage')}
                                    </Button>
                                ) : (
                                    <Button 
                                        onClick={handleGenerate} 
                                        disabled={isGenerating || !prompt.trim()}
                                        className={`!py-5 !rounded-[1.5rem] !font-black !uppercase !tracking-[0.2em] transition-all ${isGenerating ? 'opacity-50' : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95'}`}
                                    >
                                        {isGenerating ? t('aiGenerator.generating') : t('aiGenerator.generate')}
                                    </Button>
                                )}
                                {error && <p className="text-red-500 text-[9px] font-black text-center uppercase tracking-widest animate-shake px-4">{error}</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                .animate-spin-slow { animation: spin 8s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
                .animate-shake { animation: shake 0.3s ease-in-out; }
            `}</style>
        </div>
    );
};

export default AIGeneratorModal;
