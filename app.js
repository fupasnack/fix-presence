// app.js — seluruh logic digabung: Auth, Role Guard, Firestore, Cloudinary, UI, Notifikasi, PWA

// Firebase config (diperbarui)
const firebaseConfig = {
  apiKey: "AIzaSyD6yGAN01Ns7ylc_MiCsQzcSKsIvhsCqzk",
  authDomain: "presensi-byannisakaromi.firebaseapp.com",
  projectId: "presensi-byannisakaromi",
  storageBucket: "presensi-byannisakaromi.firebasestorage.app",
  messagingSenderId: "291177514444",
  appId: "1:291177514444:web:e312b378fa2c8f215ac969",
  measurementId: "G-GXJC2K4ETP"
};

// Cloudinary (diperbarui)
const CLOUD_NAME = "dn2o2vf04";
const UPLOAD_PRESET = "presensi_unsigned";

// UID roles (diperbarui sesuai data baru)
const ADMIN_UIDS = new Set([
  "S14dxz13hdMAVxxiPhTyqYsraCm2", // karomi@fupa.id
  "OXQMUSsnSZRzHkRPQfx7wZDb2PI3"  // annisa@fupa.id
]);
const KARYAWAN_UIDS = new Set([
  "JX6WFtYgrybnJevkoIBuWiLFqsK2", // cabangx@fupa.id
  "UGhVLQv436NBv0Obu3qgYPQpYO33", // cabang1@fupa.id
  "tuH94yTWqmg5hD6keVdK76NP7E53", // cabang2@fupa.id
  "zytQWyHUBuVerfHnHCQWjrhnfIR2", // cabang3@fupa.id
  "ZT7egJfRY5brcXQ7fn3Vx916mbB3", // cabang4@fupa.id
  "45tDCgZJktdOiKJzZvkMMu1vBu72", // cabang5@fupa.id
  "RQLs3tU9EfhRhBcJVz40s6PMMDn1", // cabang6@fupa.id
  "ai8rMfEKknaCPcuf5D8l9bJFXS93", // cabang7@fupa.id
  "4MTWbPMerdVLxnMCpnyChVcbgzX2", // cabang8@fupa.id
  "8yPW5dTZ5JdCpAStrEJwogxdUJ63", // cabang9@fupa.id
  "Z69r3d8OjTcf7NkbJsOyiAgH28P2"  // cabang10@fupa.id
]);

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Util UI
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const toast = (msg) => {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2200);
};

// PWA register SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

// Notifikasi browser (tanpa FCM, pakai Notification API murni)
async function ensureNotificationPermission() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const res = await Notification.requestPermission();
      return res === "granted";
    }
    return false;
  } catch { return false; }
}
function notify(msg) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") new Notification("Presensi FUPA", { body: msg });
}

// Dapatkan server time via Firestore serverTimestamp comparator
async function getServerTime() {
  const docRef = db.collection("_meta").doc("_srv");
  await docRef.set({ t: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const snap = await docRef.get();
  const ts = snap.get("t");
  return ts ? ts.toDate() : new Date(); // fallback
}
function fmtDateTime(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtHM(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function sameYMD(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

// Aturan hari & jam
// - Minggu default non-presensi kecuali dipaksa admin
// - Berangkat: 04:30–05:30
// - Pulang: 10:00–11:00
// - Toleransi terlambat: 30 menit setelah awal window -> status "terlambat" jika upload di <= akhir window + 30
const WINDOW = {
  berangkat: { start: {h:4,m:30}, end:{h:5,m:30} },
  pulang:    { start: {h:10,m:0}, end:{h:11,m:0} }
};
function inWindow(d, jenis, extraLateMin=30) {
  const w = WINDOW[jenis];
  const start = new Date(d); start.setHours(w.start.h, w.start.m, 0, 0);
  const end = new Date(d);   end.setHours(w.end.h,   w.end.m,   0, 0);
  const lateEnd = new Date(end.getTime() + extraLateMin*60000);
  if (d < start) return {allowed:false, status:"dilarang"};
  if (d >= start && d <= end) return {allowed:true, status:"tepat"};
  if (d > end && d <= lateEnd) return {allowed:true, status:"terlambat"};
  return {allowed:false, status:"dilarang"};
}

async function getScheduleOverride(dateYMD) {
  // admin menulis ke _settings/today: { mode: "auto"|"forceOn"|"forceOff", date: "YYYY-MM-DD" }
  const doc = await db.collection("_settings").doc("today").get();
  if (doc.exists) {
    const d = doc.data();
    if (d.date === dateYMD) return d.mode; // mode khusus untuk hari ini
  }
  return "auto";
}

function ymd(d){
  const pad = (n) => n.toString().padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// Role guard - DIPERBAIKI: Sekarang menggunakan data dari Firestore, bukan hanya UID
function redirectByRole(uid, userData, pathIfAdmin, pathIfKaryawan) {
  console.log("Redirect by role:", { uid, userData });
  
  // Cek dari Firestore data pertama
  if (userData && userData.role === "admin") {
    console.log("Redirecting to admin page");
    if (!location.pathname.endsWith(pathIfAdmin)) location.href = pathIfAdmin;
    return;
  }
  
  // Cek dari UID sebagai fallback
  if (ADMIN_UIDS.has(uid)) {
    console.log("Redirecting to admin page (UID fallback)");
    if (!location.pathname.endsWith(pathIfAdmin)) location.href = pathIfAdmin;
  } else if (KARYAWAN_UIDS.has(uid)) {
    console.log("Redirecting to karyawan page (UID fallback)");
    if (!location.pathname.endsWith(pathIfKaryawan)) location.href = pathIfKaryawan;
  } else {
    console.log("Access denied: no valid role");
    auth.signOut();
    toast("Akses ditolak: akun belum diberi peran yang benar.");
  }
}

function guardPage(uid, userData, required) {
  console.log("Guard page check:", { uid, userData, required });
  
  // Cek dari Firestore data pertama
  if (userData) {
    if (required === "admin" && userData.role === "admin") return true;
    if (required === "karyawan" && userData.role === "karyawan") return true;
  }
  
  // Cek dari UID sebagai fallback
  const isAdmin = ADMIN_UIDS.has(uid);
  const isKaryawan = KARYAWAN_UIDS.has(uid);
  
  if (required === "admin" && !isAdmin) { 
    console.log("Access denied: not admin");
    location.href = "index.html"; 
    return false; 
  }
  if (required === "karyawan" && !isKaryawan) { 
    console.log("Access denied: not karyawan");
    location.href = "index.html"; 
    return false; 
  }
  
  return true;
}

// Auto bootstrap koleksi & dokumen penting tanpa setup manual
async function bootstrapCollections(user) {
  console.log("Bootstrapping collections for user:", user.uid);
  
  const up = db.collection("users").doc(user.uid);
  
  try {
    const userDoc = await up.get();
    
    if (userDoc.exists) {
      // Update last login
      await up.set({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      return userDoc.data();
    } else {
      // Buat dokumen user baru
      const userRole = ADMIN_UIDS.has(user.uid) ? "admin" : (KARYAWAN_UIDS.has(user.uid) ? "karyawan" : "unknown");
      
      await up.set({
        email: user.email || "",
        role: userRole,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { role: userRole };
    }
  } catch (error) {
    console.error("Error bootstrapping collections:", error);
    // Kembalikan data minimal berdasarkan UID
    const userRole = ADMIN_UIDS.has(user.uid) ? "admin" : (KARYAWAN_UIDS.has(user.uid) ? "karyawan" : "unknown");
    return { role: userRole };
  }
}

// Auth routing untuk semua halaman - DIPERBAIKI: Sekarang menggunakan data user dari Firestore
auth.onAuthStateChanged(async (user) => {
  console.log("Auth state changed:", user);
  const path = location.pathname.toLowerCase();
  
  if (!user) {
    console.log("No user signed in");
    // Cegah akses langsung
    if (path.endsWith("karyawan.html") || path.endsWith("admin.html")) {
      location.href = "index.html";
    }
    // halaman login tidak butuh apa-apa
    if (path.endsWith("index.html") || path.endsWith("/")) {
      bindLoginPage();
    }
    return;
  }

  try {
    console.log("User signed in:", user.uid);
    const userData = await bootstrapCollections(user);
    
    console.log("User data from Firestore:", userData);

    // Update server time live
    startServerClock("#serverTime");

    // Routing per halaman
    if (path.endsWith("index.html") || path.endsWith("/")) {
      // Setelah login, arahkan sesuai role
      console.log("Redirecting from login page");
      redirectByRole(user.uid, userData, "admin.html", "karyawan.html");
      return;
    }

    if (path.endsWith("karyawan.html")) {
      console.log("Loading karyawan page");
      if (!guardPage(user.uid, userData, "karyawan")) return;
      await ensureNotificationPermission();
      bindKaryawanPage(user, userData);
    }

    if (path.endsWith("admin.html")) {
      console.log("Loading admin page");
      if (!guardPage(user.uid, userData, "admin")) return;
      await ensureNotificationPermission();
      bindAdminPage(user, userData);
    }
  } catch (error) {
    console.error("Error in auth state change:", error);
    toast("Error memuat data pengguna. Silakan coba lagi.");
    // Jika terjadi error, signOut dan redirect ke login
    await auth.signOut();
    location.href = "index.html";
  }
});

// Halaman login - DIPERBAIKI: Menangani error dengan lebih baik
function bindLoginPage() {
  const loginBtn = $("#loginBtn");
  if (!loginBtn) return;
  
  loginBtn.onclick = async () => {
    const email = $("#email").value.trim();
    const pass = $("#password").value.trim();
    
    if (!email || !pass) { 
      toast("Isi email dan kata sandi."); 
      return; 
    }
    
    // Tampilkan loading
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged akan redirect by role
    } catch (e) {
      if (loadingEl) loadingEl.style.display = "none";
      console.error("Login error:", e);
      
      if (e.code === "auth/user-not-found") {
        toast("Email tidak terdaftar.");
      } else if (e.code === "auth/wrong-password") {
        toast("Kata sandi salah.");
      } else if (e.code === "auth/invalid-email") {
        toast("Format email tidak valid.");
      } else {
        toast("Gagal masuk. Periksa kembali kredensial.");
      }
    }
  };
}

// Jam server live
async function startServerClock(sel) {
  const el = $(sel);
  if (!el) return;
  const tick = async () => {
    try {
      const t = await getServerTime();
      el.textContent = `Waktu server: ${fmtDateTime(t)} WIB`;
    } catch {
      el.textContent = `Waktu server: tidak tersedia`;
    }
  };
  await tick();
  setInterval(tick, 10_000);
}

// ... (kode selanjutnya tetap sama seperti yang Anda berikan)