import React, { useState, useRef, useEffect } from 'react';
import Button from '../common/Button';

interface AvatarEditorModalProps {
    isOpen: boolean;
    imageSource: string;
    onClose: () => void;
    onSave: (processedBlob: Blob, previewUrl: string) => void;
}

const FILTERS = [
    { name: 'Normal', class: '' },
    { name: 'P&B', class: 'grayscale(1)' },
    { name: 'Vivid', class: 'saturate(1.5) contrast(1.1)' },
    { name: 'Retro', class: 'sepia(0.3) brightness(0.9) contrast(1.1)' },
    { name: 'Frio', class: 'hue-rotate(180deg) saturate(0.8)' },
];

const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({ isOpen, imageSource, onClose, onSave }) => {
    const [zoom, setZoom] = useState(1);
    const [filterIndex, setFilterIndex] = useState(0);
    const [overlayText, setOverlayText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (isOpen) {
            setZoom(1);
            setFilterIndex(0);
            setOverlayText('');
        }
    }, [isOpen]);

    const handleProcessImage = async () => {
        setIsProcessing(true);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageSource;

        img.onload = () => {
            const size = 600; // Resolução final do avatar
            canvas.width = size;
            canvas.height = size;

            // Aplica Filtros no Canvas
            ctx.filter = FILTERS[filterIndex].class || 'none';

            // Calcula Zoom e Centralização
            const minDim = Math.min(img.width, img.height);
            const drawSize = minDim / zoom;
            const sx = (img.width - drawSize) / 2;
            const sy = (img.height - drawSize) / 2;

            // Desenha imagem
            ctx.drawImage(img, sx, sy, drawSize, drawSize, 0, 0, size, size);

            // Adiciona Texto Overlay se houver
            if (overlayText.trim()) {
                ctx.filter = 'none'; // Texto não deve ter filtro da imagem
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 4;
                ctx.font = 'bold 40px sans-serif';
                ctx.textAlign = 'center';
                ctx.strokeText(overlayText.toUpperCase(), size / 2, size - 60);
                ctx.fillText(overlayText.toUpperCase(), size / 2, size - 60);
            }

            canvas.toBlob((blob) => {
                if (blob) {
                    const preview = URL.createObjectURL(blob);
                    onSave(blob, preview);
                    setIsProcessing(false);
                }
            }, 'image/jpeg', 0.9);
        };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-black flex flex-col animate-fade-in touch-none">
            <header className="p-6 flex justify-between items-center bg-zinc-950/80 backdrop-blur-md border-b border-white/10">
                <button onClick={onClose} className="text-white text-sm font-bold uppercase tracking-widest">Cancelar</button>
                <h3 className="text-white font-black text-xs uppercase tracking-[0.2em]">Editar Foto</h3>
                <button 
                    onClick={handleProcessImage} 
                    disabled={isProcessing}
                    className="text-sky-500 text-sm font-black uppercase tracking-widest"
                >
                    {isProcessing ? '...' : 'Concluir'}
                </button>
            </header>

            <div className="flex-grow flex flex-col items-center justify-center p-4 gap-8">
                {/* Preview Circular */}
                <div className="relative w-72 h-72 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-zinc-900">
                    <div 
                        className="w-full h-full transition-all duration-200"
                        style={{ 
                            transform: `scale(${zoom})`,
                            filter: FILTERS[filterIndex].class
                        }}
                    >
                        <img src={imageSource} className="w-full h-full object-cover" alt="Original" />
                    </div>
                    {overlayText && (
                        <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
                            <span className="text-white font-black text-xl uppercase tracking-tighter drop-shadow-lg text-center px-4">
                                {overlayText}
                            </span>
                        </div>
                    )}
                </div>

                {/* Controles */}
                <div className="w-full max-w-sm space-y-6">
                    {/* Zoom */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between">
                            Zoom <span>{Math.round(zoom * 100)}%</span>
                        </label>
                        <input 
                            type="range" min="1" max="3" step="0.01" 
                            value={zoom} 
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                        />
                    </div>

                    {/* Texto */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Legenda na Foto</label>
                        <input 
                            type="text" 
                            maxLength={20}
                            placeholder="Adicionar texto..."
                            value={overlayText}
                            onChange={(e) => setOverlayText(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500 transition-colors"
                        />
                    </div>

                    {/* Filtros */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Efeitos</label>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                            {FILTERS.map((f, i) => (
                                <button
                                    key={i}
                                    onClick={() => setFilterIndex(i)}
                                    className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-tighter border transition-all ${filterIndex === i ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default AvatarEditorModal;