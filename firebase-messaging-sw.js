// firebase-messaging-sw.js
// File này phải nằm ở root của site (hoặc public/ nếu bạn serve từ đó)

importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

// Config Firebase của bạn (copy từ firebaseConfig trong index.html)
const firebaseConfig = {
  apiKey: "AIzaSyC-nAzmkTAsC9fBwvEHVbMtksKiySFZzBU",
  authDomain: "luvrlymc-680ff.firebaseapp.com",
  projectId: "luvrlymc-680ff",
  storageBucket: "luvrlymc-680ff.firebasestorage.app",
  messagingSenderId: "379519293934",
  appId: "1:379519293934:web:f3ce41100c4d27576096ff",
  measurementId: "G-KJWLHY9ZLF"
};

// Khởi tạo Firebase trong service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Xử lý thông báo khi background (tab/site không mở)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Lấy title và body từ payload (do server gửi)
  const notificationTitle = payload.notification?.title || 'LuvrlyGPT';
  const notificationOptions = {
    body: payload.notification?.body || 'Có thông báo mới!',
    icon: '/favicon.ico',      // thay bằng icon thật của site nếu có
    badge: '/badge.png',       // optional: badge nhỏ góc icon
    data: {
      url: 'https://luvrlymc.onrender.com'  // link mở khi click thông báo
    }
  };

  // Hiển thị thông báo
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Khi user click vào thông báo → mở trang web
self.addEventListener('notificationclick', (event) => {
  event.notification.close();  // đóng thông báo

  // Mở trang chính (hoặc link cụ thể nếu bạn gửi trong data)
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || 'https://luvrlymc.onrender.com')
  );
});
