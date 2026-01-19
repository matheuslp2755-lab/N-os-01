
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log("Néos: Iniciando aplicação...");

// REGISTRO DE SERVICE WORKER REMOVIDO MANUALMENTE
// O OneSignal SDK cuidará do registro do OneSignalSDKWorker.js automaticamente.

const container = document.getElementById('root');

if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
    console.log("Néos: Renderização enviada.");
  } catch (error) {
    console.error("ERRO CRÍTICO NO BOOT:", error);
    container.innerHTML = `
      <div style="padding:40px; text-align:center; color:white; font-family:sans-serif; background:#000; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <h1 style="color:#0ea5e9; margin-bottom:10px;">Ops! Néos encontrou um erro.</h1>
        <p style="opacity:0.7;">Ocorreu um erro inesperado ao carregar a interface.</p>
        <button onclick="window.location.reload()" style="background:#0ea5e9; color:white; border:none; padding:12px 24px; border-radius:12px; cursor:pointer; margin-top:20px; font-weight:bold;">
          Recarregar Néos
        </button>
      </div>
    `;
  }
}

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('ResizeObserver')) {
    e.stopImmediatePropagation();
  }
});
