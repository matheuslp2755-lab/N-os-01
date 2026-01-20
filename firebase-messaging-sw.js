importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBscsAkO_yJYfVVtCBh3rNF8Cm51_HLW54",
  authDomain: "teste-rede-fcb99.firebaseapp.com",
  databaseURL: "https://teste-rede-fcb99-default-rtdb.firebaseio.com",
  projectId: "teste-rede-fcb99",
  storageBucket: "teste-rede-fcb99.firebasestorage.app",
  messagingSenderId: "1006477304115",
  appId: "1:1006477304115:web:79deabb2a1e97951df5e46"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em background: ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico' // Ajuste para o caminho do seu ícone
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});