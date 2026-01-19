import React, { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, addDoc } from '../../firebase';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';

interface AdminDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [tab, setTab] = useState<'banned' | 'reports'>('reports');
    const [bannedUsers, setBannedUsers] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);
        // Listener para usuários banidos
        const qBanned = query(collection(db, 'users'), where('isBanned', '==', true));
        const unsubBanned = onSnapshot(qBanned, (snap) => {
            setBannedUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Listener para denúncias pendentes
        const qReports = query(collection(db, 'reports'), where('status', '==', 'pending'));
        const unsubReports = onSnapshot(qReports, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => {
            unsubBanned();
            unsubReports();
        };
    }, [isOpen]);

    const handleUnban = async (userId: string, originalUsername: string) => {
        if (!window.confirm(`Deseja restaurar o acesso do usuário @${originalUsername}?`)) return;
        try {
            await updateDoc(doc(db, 'users', userId), {
                isBanned: false,
                username: originalUsername.replace('BANIDO_', ''),
                username_lowercase: originalUsername.replace('BANIDO_', '').toLowerCase()
            });
        } catch (e) { console.error(e); }
    };

    const handleActionOnReport = async (report: any, action: 'dismiss' | 'ban_user' | 'delete_post') => {
        const batch = writeBatch(db);
        
        try {
            if (action === 'dismiss') {
                batch.update(doc(db, 'reports', report.id), { status: 'dismissed', resolvedAt: serverTimestamp() });
            } 
            else if (action === 'ban_user') {
                if (!window.confirm(`Banir permanentemente o usuário @${report.targetUsername}?`)) return;
                
                // Marca usuário como banido
                batch.update(doc(db, 'users', report.targetUserId), {
                    isBanned: true,
                    banTimestamp: serverTimestamp(),
                    username: `BANIDO_${report.targetUsername}`
                });
                
                // Marca denúncia como resolvida
                batch.update(doc(db, 'reports', report.id), { status: 'resolved_with_ban', resolvedAt: serverTimestamp() });
            }
            else if (action === 'delete_post') {
                if (!window.confirm("Excluir esta publicação permanentemente?")) return;
                
                // Deleta o post
                batch.delete(doc(db, 'posts', report.targetPostId));
                
                // Marca denúncia como resolvida
                batch.update(doc(db, 'reports', report.id), { status: 'resolved_with_deletion', resolvedAt: serverTimestamp() });
            }

            await batch.commit();
        } catch (e) {
            console.error(e);
            alert("Erro ao processar ação administrativa.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-950 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col h-[85vh] border dark:border-zinc-800" onClick={e => e.stopPropagation()}>
                <header className="p-8 border-b dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/20">
                    <div>
                        <h2 className="text-2xl font-black italic text-indigo-500 tracking-tighter">Néos Admin Console</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Dono: Matheuslp2755@gmail.com</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 text-4xl font-thin hover:text-indigo-500 transition-colors">&times;</button>
                </header>

                <div className="flex border-b dark:border-zinc-800 bg-white dark:bg-black p-2 gap-2">
                    <button 
                        onClick={() => setTab('reports')}
                        className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${tab === 'reports' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                    >
                        Denúncias Ativas
                        {reports.length > 0 && <span className="bg-white text-red-500 px-1.5 py-0.5 rounded-md text-[8px]">{reports.length}</span>}
                    </button>
                    <button 
                        onClick={() => setTab('banned')}
                        className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'banned' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                    >
                        Lista de Banidos ({bannedUsers.length})
                    </button>
                </div>

                <main className="flex-grow overflow-y-auto p-6 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Carregando dados da central...</p>
                        </div>
                    ) : tab === 'banned' ? (
                        <div className="space-y-4">
                            {bannedUsers.length === 0 ? (
                                <div className="text-center py-20 opacity-30">
                                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth={1}/></svg>
                                    <p className="text-xs font-bold uppercase tracking-widest">Nenhum banimento efetuado.</p>
                                </div>
                            ) : (
                                bannedUsers.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-5 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] border dark:border-zinc-800 animate-slide-up">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img src={user.avatar} className="w-14 h-14 rounded-full object-cover grayscale opacity-50" />
                                                <div className="absolute inset-0 border-2 border-red-500/50 rounded-full"></div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black dark:text-white">{user.username}</p>
                                                <p className="text-[10px] text-zinc-500 font-bold uppercase">{user.email}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleUnban(user.id, user.username)}
                                            className="px-6 py-2.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white text-[9px] font-black uppercase rounded-xl hover:bg-green-500 hover:text-white transition-all active:scale-95"
                                        >
                                            Restaurar
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {reports.length === 0 ? (
                                <div className="text-center py-20 opacity-30">
                                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth={1}/></svg>
                                    <p className="text-xs font-bold uppercase tracking-widest">Tudo limpo! Nenhuma denúncia.</p>
                                </div>
                            ) : (
                                reports.map(report => (
                                    <div key={report.id} className="p-6 bg-red-50/50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/30 rounded-[2.5rem] animate-slide-up">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black uppercase bg-red-600 text-white px-3 py-1 rounded-full w-fit mb-2 tracking-widest">Alerta de {report.type === 'post' ? 'Conteúdo' : 'Usuário'}</span>
                                                <p className="text-sm font-black dark:text-white">Alvo: <span className="text-red-500">@{report.targetUsername}</span></p>
                                                <p className="text-[10px] text-zinc-500 font-bold uppercase">Denunciante: @{report.reporterUsername}</p>
                                            </div>
                                            <p className="text-[8px] text-zinc-400 font-black font-mono">ID: {report.id.toUpperCase()}</p>
                                        </div>
                                        
                                        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl mb-6 border dark:border-zinc-800 shadow-inner">
                                            <p className="text-xs text-zinc-600 dark:text-zinc-300 italic font-medium leading-relaxed">
                                                "{report.reason}"
                                            </p>
                                        </div>

                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleActionOnReport(report, 'dismiss')}
                                                className="flex-1 py-3 bg-zinc-200 dark:bg-zinc-800 text-[9px] font-black uppercase rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                                            >
                                                Ignorar
                                            </button>
                                            {report.type === 'post' && (
                                                <button 
                                                    onClick={() => handleActionOnReport(report, 'delete_post')}
                                                    className="flex-1 py-3 bg-orange-500 text-white text-[9px] font-black uppercase rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                                                >
                                                    Excluir Post
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleActionOnReport(report, 'ban_user')}
                                                className="flex-1 py-3 bg-red-600 text-white text-[9px] font-black uppercase rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
                                            >
                                                Banir Usuário
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </main>

                <footer className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t dark:border-zinc-800">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.3em] text-center">Néos Administration Protocol v2.5</p>
                </footer>
            </div>
        </div>
    );
};

export default AdminDashboardModal;