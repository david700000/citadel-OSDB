// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBp7ksDAsSDIAW55QKg3hPuo-zkbm8ZZuQ",
  authDomain: "citadel-notis.firebaseapp.com",
  projectId: "citadel-notis",
  storageBucket: "citadel-notis.firebasestorage.app",
  messagingSenderId: "633075996029",
  appId: "1:633075996029:web:a93cb3bf72d1bf05dd2814"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Do NOT call self.registration.showNotification here because the backend 
  // sends a `notification` payload, which Firebase automatically handles!
});
