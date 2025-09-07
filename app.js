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
      const userRole = ADMIN_UIDS.has(user.uid) ? "admin" : "karyawan";
      
      await up.set({
        email: user.email || "",
        role: userRole,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { role: userRole, email: user.email || "" };
    }
  } catch (error) {
    console.error("Error bootstrapping collections:", error);
    // Kembalikan data minimal berdasarkan UID
    const userRole = ADMIN_UIDS.has(user.uid) ? "admin" : "karyawan";
    return { role: userRole, email: user.email || "" };
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
      await bindKaryawanPage(user, userData); // Ditambahkan await
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

  // PERBAIKAN: Tambahkan event listener untuk tombol enter
  const passwordInput = $("#password");
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        loginBtn.click();
      }
    });
  }
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

// Ambil lokasi
function getLocation(timeout=8000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Geolokasi tidak didukung."));
    navigator.geolocation.getCurrentPosition(
      (pos) => res({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => rej(err),
      { enableHighAccuracy:true, timeout, maximumAge: 2_000 }
    );
  });
}

// Kamera
async function startCamera(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    toast("Tidak bisa mengakses kamera.");
    throw e;
  }
}
function captureToCanvas(videoEl, canvasEl) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  const MAXW = 720; // kurangi ukuran
  const scale = Math.min(1, MAXW / w);
  canvasEl.width = Math.round(w * scale);
  canvasEl.height = Math.round(h * scale);
  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
}

// Kompres gambar ke kualitas kecil (target ≤50 KB)
async function canvasToCompressedBlob(canvas, targetKB=50) {
  let quality = 0.6;
  let blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
  
  // Turunkan kualitas hingga ukuran ≤ targetKB
  for (let i = 0; i < 5 && blob.size / 1024 > targetKB; i++) {
    quality = Math.max(0.3, quality - 0.1);
    blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
  }
  
  // Jika masih besar, kurangi resolusi
  if (blob.size / 1024 > targetKB) {
    const scale = Math.sqrt(targetKB * 1024 / blob.size);
    const newWidth = Math.max(320, Math.round(canvas.width * scale));
    const newHeight = Math.max(240, Math.round(canvas.height * scale));
    
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;
    const ctx = tempCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
    
    blob = await new Promise(r => tempCanvas.toBlob(r, "image/jpeg", 0.7));
  }
  
  return blob;
}

// Upload ke Cloudinary unsigned
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  const r = await fetch(url, { method:"POST", body: form });
  if (!r.ok) throw new Error("Upload Cloudinary gagal");
  const data = await r.json();
  return data.secure_url;
}

// Simpan presensi
async function savePresensi({ uid, nama, jenis, status, lat, lng, selfieUrl, serverDate }) {
  const ts = serverDate || new Date();
  const doc = {
    uid, nama: nama || "", jenis, status,
    lat, lng,
    selfieUrl: selfieUrl || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    localTime: fmtDateTime(ts),
    ymd: ymd(ts)
  };
  await db.collection("presensi").add(doc);
}

// Ambil riwayat singkat karyawan
function subscribeRiwayat(uid, cb) {
  return db.collection("presensi")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(10)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      cb(arr);
    });
}

// Notifikasi list untuk karyawan (pengumuman + progres cuti)
function subscribeNotifForKaryawan(uid, cb) {
  return db.collection("notifs")
    .where("targets", "array-contains-any", ["all", uid])
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      cb(arr);
    });
}

// Cuti collection
async function ajukanCuti(uid, nama, jenis, tanggal, catatan) {
  await db.collection("cuti").add({
    uid, nama, jenis, tanggal, catatan: catatan || "",
    status: "menunggu",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Admin list cuti
function subscribeCuti(cb) {
  return db.collection("cuti")
    .where("status", "==", "menunggu") // Hanya tampilkan yang statusnya menunggu
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
      cb(arr);
    });
}
async function setCutiStatus(id, status, adminUid) {
  const cutiDoc = await db.collection("cuti").doc(id).get();
  const cutiData = cutiDoc.data();
  
  await db.collection("cuti").doc(id).set({ status }, { merge:true });
  
  // Kirim notifikasi ke karyawan
  await db.collection("notifs").add({
    type: "cuti",
    text: `Cuti Anda pada ${cutiData.tanggal} telah ${status}`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    targets: [cutiData.uid]
  });
}

// Pengumuman
async function kirimPengumuman(text, adminUid) {
  await db.collection("notifs").add({
    type: "announce",
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    targets: ["all"]
  });
  notify("Pengumuman terkirim ke semua karyawan.");
}

// Jadwal wajib
async function setHariMode(mode, dateStr) {
  await db.collection("_settings").doc("today").set({
    mode, date: dateStr
  }, { merge: true });
}

// Profil simpan (nama, alamat, foto profil -> Cloudinary)
async function saveProfile(uid, { nama, alamat, pfpUrl }) {
  const d = {};
  if (nama !== undefined) d.nama = nama;
  if (alamat !== undefined) d.alamat = alamat;
  if (pfpUrl !== undefined) d.pfp = pfpUrl;
  d.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(uid).set(d, { merge: true });
}

// Ambil profil
async function getProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() : {};
}

// Hapus presensi
async function deletePresensi(id) {
  await db.collection("presensi").doc(id).delete();
}

// Halaman Karyawan bindings - DIPERBAIKI: Menerima parameter userData
async function bindKaryawanPage(user, userData) {
  console.log("Binding karyawan page for:", user.uid, userData);
  
  try {
    const video = $("#cam");
    const canvas = $("#canvas");
    const preview = $("#preview");
    const jenisSel = $("#jenis");
    const statusText = $("#statusText");
    const statusChip = $("#statusChip");
    const locText = $("#locText");

    // Tampilkan loading
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";

    // Pastikan elemen yang diperlukan ada
    if (!video || !canvas || !preview || !jenisSel || !statusText || !statusChip || !locText) {
      console.error("Elemen yang diperlukan tidak ditemukan!");
      toast("Error: Elemen tidak ditemukan");
      return;
    }

    // Guard kamera
    let stream;
    try {
      stream = await startCamera(video);
    } catch (e) {
      if (loadingEl) loadingEl.style.display = "none";
      return;
    }

    // Lokasi
    let coords = null;
    try {
      coords = await getLocation();
      locText.textContent = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    } catch {
      locText.textContent = "Lokasi tidak aktif";
    }

    // Profil muat
    const profile = await getProfile(user.uid);
    if (profile.pfp && $("#pfp")) $("#pfp").src = profile.pfp;
    if (profile.nama && $("#nama")) $("#nama").value = profile.nama;
    if (profile.alamat && $("#alamat")) $("#alamat").value = profile.alamat;

    // Status window
    async function refreshStatus() {
      const serverNow = await getServerTime();
      const today = ymd(serverNow);
      const override = await getScheduleOverride(today);
      const isSunday = serverNow.getDay() === 0;
      const jenis = jenisSel.value;

      let wajib = true;
      if (override === "forceOn") wajib = true;
      else if (override === "forceOff") wajib = false;
      else wajib = !isSunday;

      if (!wajib) {
        statusText.textContent = "Hari ini tidak wajib presensi";
        statusChip.className = "status s-warn";
        return { allowed: false, reason:"not-required" };
      }

      const win = inWindow(serverNow, jenis, 30);
      if (!win.allowed) {
        statusText.textContent = "Di luar jam presensi";
        statusChip.className = "status s-bad";
        return { allowed:false, reason:"out-of-window" };
      } else {
        // PERBAIKAN: Typo "tept" diperbaiki menjadi "tepat"
        statusText.textContent = win.status === "tepat" ? "Tepat waktu" : "Terlambat";
        statusChip.className = "status " + (win.status === "tepat" ? "s-good" : "s-warn");
        return { allowed:true, status:win.status, serverNow };
      }
    }
    let lastStatus = await refreshStatus();
    setInterval(async () => { lastStatus = await refreshStatus(); }, 30_000);

    // Snap
    $("#snapBtn").onclick = () => {
      captureToCanvas(video, canvas);
      canvas.style.display = "block";
      preview.style.display = "none";
      toast("Foto diambil. Anda bisa langsung upload.");
    };

    // Upload
    $("#uploadBtn").onclick = async () => {
      // Periksa status window lagi
      lastStatus = await refreshStatus();
      if (!lastStatus.allowed) {
        toast("Presensi ditolak: di luar jadwal atau tidak wajib.");
        return;
      }
      if (!coords) {
        toast("Lokasi belum aktif.");
        return;
      }
      // Pastikan ada gambar di canvas
      if (canvas.width === 0 || canvas.height === 0) {
        toast("Ambil selfie dulu.");
        return;
      }
      
      // Tampilkan loading
      if (loadingEl) loadingEl.style.display = "flex";
      
      try {
        const blob = await canvasToCompressedBlob(canvas, 50); // Kompres ke ≤50 KB
        const url = await uploadToCloudinary(blob);
        preview.src = url;
        preview.style.display = "block";
        // Simpan presensi
        const namaInput = $("#nama");
        const nama = (namaInput?.value || profile.nama || user.email.split("@")[0]).trim();
        const jenis = jenisSel.value;
        const status = lastStatus.status === "tepat" ? "tepat" : "terlambat";
        await savePresensi({
          uid: user.uid,
          nama,
          jenis,
          status,
          lat: coords.lat,
          lng: coords.lng,
          selfieUrl: url,
          serverDate: lastStatus.serverNow
        });
        toast("Presensi tersimpan.");
      } catch (e) {
        console.error("Error saving presensi:", e);
        toast("Gagal menyimpan presensi.");
      } finally {
        if (loadingEl) loadingEl.style.display = "none";
      }
    };

    // Riwayat singkat
    const unsubLog = subscribeRiwayat(user.uid, (items) => {
      const list = $("#logList");
      if (!list) return;
      
      list.innerHTML = "";
      items.forEach(it => {
        const badge = it.status === "tepat" ? "s-good" : (it.status==="terlambat"?"s-warn":"s-bad");
        const el = document.createElement("div");
        el.className = "row";
        el.style.justifyContent = "space-between";
        el.innerHTML = `
          <div class="row" style="gap:8px">
            <span class="material-symbols-rounded">schedule</span>
            <b>${it.localTime || 'Waktu tidak tersedia'}</b>
            <span>•</span>
            <span>${it.jenis}</span>
          </div>
          <span class="status ${badge}">${it.status}</span>
        `;
        list.appendChild(el);
      });
    });

    // Notifikasi dialog
    $("#notifBtn").onclick = () => $("#notifDlg").showModal();
    const unsubNotif = subscribeNotifForKaryawan(user.uid, (items) => {
      const list = $("#notifList");
      if (!list) return;
      
      list.innerHTML = "";
      
      // Update badge notifikasi
      const unreadCount = items.filter(item => !item.read).length;
      const badge = $("#notifBadge");
      if (unreadCount > 0 && badge) {
        badge.textContent = unreadCount;
        badge.style.display = "grid";
      } else if (badge) {
        badge.style.display = "none";
      }
      
      items.forEach(it => {
        const el = document.createElement("div");
        el.className = "card";
        const sub = it.type === "announce" ? "Pengumuman" : "Info";
        el.innerHTML = `
          <div style="font-weight:700">${sub}</div>
          <div style="opacity:.8; margin-top:4px">${it.text || "(tanpa teks)"}</div>
          <div style="font-size:12px; opacity:.6; margin-top:6px">${it.createdAt ? it.createdAt.toDate().toLocaleString() : ""}</div>
        `;
        list.appendChild(el);
      });
    });

    // Cuti FAB
    $("#cutiFab").onclick = () => $("#cutiDlg").showModal();
    $("#ajukanCutiBtn").onclick = async () => {
      const jenis = $("#cutiJenis").value;
      const tanggal = $("#cutiTanggal").value;
      const catatan = $("#cutiCatatan").value.trim();
      if (!tanggal) { toast("Pilih tanggal cuti."); return; }
      
      // Tampilkan loading
      if (loadingEl) loadingEl.style.display = "flex";
      
      try {
        const namaInput = $("#nama");
        const nama = (namaInput?.value || profile.nama || user.email.split("@")[0]).trim();
        await ajukanCuti(user.uid, nama, jenis, tanggal, catatan);
        toast("Permintaan cuti dikirim.");
        $("#cutiDlg").close();
      } catch (e) {
        console.error("Error submitting cuti:", e);
        toast("Gagal mengajukan cuti.");
      } finally {
        if (loadingEl) loadingEl.style.display = "none";
      }
    };

    // Profil dialog
    $("#profileBtn").onclick = () => $("#profileDlg").showModal();
    $("#saveProfileBtn").onclick = async () => {
      // Tampilkan loading
      if (loadingEl) loadingEl.style.display = "flex";
      
      try {
        let pfpUrl;
        const file = $("#pfpFile").files?.[0];
        if (file) {
          // Kompres foto profil ke ≤50 KB
          const imgEl = document.createElement("img");
          imgEl.src = URL.createObjectURL(file);
          await new Promise(r => imgEl.onload = r);
          const c = document.createElement("canvas");
          const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
          c.width = Math.max(64, Math.round(imgEl.width * scale));
          c.height = Math.max(64, Math.round(imgEl.height * scale));
          const ctx = c.getContext("2d");
          ctx.drawImage(imgEl, 0, 0, c.width, c.height);
          const pfpBlob = await canvasToCompressedBlob(c, 50); // Kompres ke ≤50 KB
          pfpUrl = await uploadToCloudinary(pfpBlob);
          if ($("#pfp")) $("#pfp").src = pfpUrl;
        }
        const nama = $("#nama").value.trim();
        const alamat = $("#alamat").value.trim();
        await saveProfile(user.uid, { nama, alamat, pfpUrl });
        toast("Profil tersimpan.");
      } catch (e) {
        console.error("Error saving profile:", e);
        toast("Gagal menyimpan profil.");
      } finally {
        if (loadingEl) loadingEl.style.display = "none";
      }
    };
    $("#logoutBtn").onclick = async () => { 
      // Tampilkan loading
      if (loadingEl) loadingEl.style.display = "flex";
      await auth.signOut(); 
      location.href = "index.html"; 
    };

    // Sembunyikan loading setelah semua selesai
    if (loadingEl) loadingEl.style.display = "none";

    // Bersihkan stream saat keluar
    window.addEventListener("beforeunload", () => {
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      unsubLog && unsubLog();
      unsubNotif && unsubNotif();
    });
  } catch (error) {
    console.error("Error in bindKaryawanPage:", error);
    toast("Error memuat halaman karyawan: " + error.message);
    if (loadingEl) loadingEl.style.display = "none";
  }
}

// Halaman Admin bindings - DIPERBAIKI: Menerima parameter userData
async function bindAdminPage(user, userData) {
  // Profil muat
  const profile = await getProfile(user.uid);
  if (profile.pfp) $("#pfp").src = profile.pfp;
  if (profile.nama) $("#nama").value = profile.nama;
  if (profile.alamat) $("#alamat").value = profile.alamat;

  // Dialogs
  $("#profileBtn").onclick = () => $("#profileDlg").showModal();
  $("#logoutBtn").onclick = async () => { 
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    await auth.signOut(); 
    location.href="index.html"; 
  };

  // Simpan profil
  $("#saveProfileBtn").onclick = async () => {
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    
    try {
      let pfpUrl;
      const file = $("#pfpFile").files?.[0];
      if (file) {
        // Kompres foto profil ke ≤50 KB
        const imgEl = document.createElement("img");
        imgEl.src = URL.createObjectURL(file);
        await new Promise(r => imgEl.onload = r);
        const c = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
        c.width = Math.max(64, Math.round(imgEl.width * scale));
        c.height = Math.max(64, Math.round(imgEl.height * scale));
        const ctx = c.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, c.width, c.height);
        const blob = await canvasToCompressedBlob(c, 50); // Kompres ke ≤50 KB
        pfpUrl = await uploadToCloudinary(blob);
        $("#pfp").src = pfpUrl;
      }
      const nama = $("#nama").value.trim();
      const alamat = $("#alamat").value.trim();
      await saveProfile(user.uid, { nama, alamat, pfpUrl });
      toast("Profil admin tersimpan.");
    } catch {
      toast("Gagal menyimpan profil admin.");
    } finally {
      const loadingEl = $("#loading");
      if (loadingEl) loadingEl.style.display = "none";
    }
  };

  // Notifikasi (cuti)
  $("#notifBtn").onclick = () => $("#notifDlg").showModal();
  const cutiList = $("#cutiList");
  const unsubCuti = subscribeCuti((items) => {
    cutiList.innerHTML = "";
    
    // Update badge notifikasi
    const badge = $("#notifBadge");
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.style.display = "grid";
    } else {
      badge.style.display = "none";
    }
    
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <span class="material-symbols-rounded">person</span><b>${it.nama || it.uid}</b>
            <span>•</span>
            <span>${it.jenis}</span>
            <span>•</span>
            <span>${it.tanggal}</span>
          </div>
          <div class="row">
            <span class="status ${it.status==='menunggu'?'s-warn':(it.status==='disetujui'?'s-good':'s-bad')}">${it.status}</span>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end; margin-top:8px">
          <button class="btn" data-act="approve" data-id="${it.id}"><span class="material-symbols-rounded">check</span> Setujui</button>
          <button class="btn" data-act="reject" data-id="${it.id}" style="background:#222"><span class="material-symbols-rounded">close</span> Tolak</button>
        </div>
      `;
      cutiList.appendChild(row);
    });
    // Bind actions
    $$("[data-act='approve']").forEach(b => b.onclick = async () => {
      const loadingEl = $("#loading");
      if (loadingEl) loadingEl.style.display = "flex";
      await setCutiStatus(b.dataset.id, "disetujui", user.uid);
      if (loadingEl) loadingEl.style.display = "none";
      toast("Cuti disetujui.");
    });
    $$("[data-act='reject']").forEach(b => b.onclick = async () => {
      const loadingEl = $("#loading");
      if (loadingEl) loadingEl.style.display = "flex";
      await setCutiStatus(b.dataset.id, "ditolak", user.uid);
      if (loadingEl) loadingEl.style.display = "none";
      toast("Cuti ditolak.");
    });
  });

  // Pengumuman
  $("#announceFab").onclick = async () => {
    const text = prompt("Tulis pengumuman:");
    if (!text) return;
    
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    await kirimPengumuman(text, user.uid);
    if (loadingEl) loadingEl.style.display = "none";
    toast("Pengumuman terkirim.");
  };
  
  $("#sendAnnounce").onclick = async () => {
    const text = $("#announceText").value.trim();
    if (!text) { toast("Tulis isi pengumuman."); return; }
    
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    await kirimPengumuman(text, user.uid);
    $("#announceText").value = "";
    if (loadingEl) loadingEl.style.display = "none";
    toast("Pengumuman terkirim.");
  };

  // Jadwal wajib / tidak
  $("#saveSchedule").onclick = async () => {
    const mode = $("#wajibHari").value;
    const now = await getServerTime();
    
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    await setHariMode(mode, ymd(now));
    if (loadingEl) loadingEl.style.display = "none";
    toast("Pengaturan hari tersimpan.");
  };

  // Tabel presensi + filter + export CSV
  let lastData = [];
  let currentPage = 1;
  const pageSize = 20;
  
  async function loadPresensi() {
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    
    let q = db.collection("presensi").orderBy("createdAt", "desc");
    const nama = $("#fNama").value.trim().toLowerCase();
    const tanggal = $("#fTanggal").value;
    const periode = $("#fPeriode").value;
    
    // Filter berdasarkan periode
    if (periode && periode !== "semua") {
      const now = new Date();
      let startDate = new Date();
      
      switch(periode) {
        case "hari":
          startDate.setHours(0,0,0,0);
          break;
        case "minggu":
          startDate.setDate(now.getDate() - 7);
          break;
        case "bulan":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "tahun":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      q = q.where("createdAt", ">=", startDate);
    }
    
    // Firestore tidak bisa compound query yang fleksibel untuk text, maka filter di klien setelah pengambilan
    const snap = await q.get();
    const arr = [];
    snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
    let filtered = arr;
    if (tanggal) filtered = filtered.filter(x => x.ymd === tanggal);
    if (nama) filtered = filtered.filter(x => (x.nama||"").toLowerCase().includes(nama));
    lastData = filtered;
    
    renderPagination(filtered.length);
    renderTable(filtered, currentPage);
    
    if (loadingEl) loadingEl.style.display = "none";
  }
  
  function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / pageSize);
    const pagination = $("#pagination");
    pagination.innerHTML = "";
    
    if (totalPages <= 1) return;
    
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.classList.toggle("active", i === currentPage);
      btn.onclick = () => {
        currentPage = i;
        renderTable(lastData, currentPage);
      };
      pagination.appendChild(btn);
    }
  }
  
  function renderTable(data, page) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = data.slice(startIndex, endIndex);
    
    const tb = $("#tableBody");
    tb.innerHTML = "";
    pageData.forEach(r => {
      const badge = r.status === "tepat" ? "s-good" : (r.status==="terlambat"?"s-warn":"s-bad");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.localTime || ""}</td>
        <td>${r.nama || r.uid}</td>
        <td>${r.jenis}</td>
        <td><span class="status ${badge}">${r.status}</span></td>
        <td>${(r.lat?.toFixed?.(5) || r.lat || "")}, ${(r.lng?.toFixed?.(5) || r.lng || "")}</td>
        <td>${r.selfieUrl ? `<a href="${r.selfieUrl}" target="_blank">Lihat</a>` : "-"}</td>
        <td><button class="btn" style="background:var(--bad); padding:6px 10px; font-size:12px;" onclick="deletePresensi('${r.id}')">Hapus</button></td>
      `;
      tb.appendChild(tr);
    });
  }
  
  // Bind fungsi deletePresensi ke window agar bisa diakses dari onclick
  window.deletePresensi = async (id) => {
    if (confirm("Hapus data presensi ini?")) {
      const loadingEl = $("#loading");
      if (loadingEl) loadingEl.style.display = "flex";
      await deletePresensi(id);
      if (loadingEl) loadingEl.style.display = "none";
      toast("Presensi dihapus");
      loadPresensi(); // Reload data
    }
  };
  
  $("#applyFilter").onclick = () => {
    currentPage = 1;
    loadPresensi();
  };
  
  $("#exportCsv").onclick = () => {
    if (!lastData.length) { toast("Tidak ada data untuk diekspor."); return; }
    const cols = ["localTime","nama","jenis","status","lat","lng","selfieUrl","uid","ymd"];
    const csv = toCSV(lastData, cols);
    download(`presensi_${Date.now()}.csv`, csv);
  };
  
  // Tambahkan select filter periode di HTML admin
  const filterContainer = $(".row:has(#fNama)");
  if (filterContainer && !$("#fPeriode")) {
    const periodeSelect = document.createElement("select");
    periodeSelect.id = "fPeriode";
    periodeSelect.innerHTML = `
      <option value="semua">Semua Periode</option>
      <option value="hari">Hari Ini</option>
      <option value="minggu">Minggu Ini</option>
      <option value="bulan">Bulan Ini</option>
      <option value="tahun">Tahun Ini</option>
    `;
    filterContainer.insertBefore(periodeSelect, $("#applyFilter"));
  }
  
  // Muat awal + refresh periodik ringan
  await loadPresensi();
  setInterval(loadPresensi, 20_000);

  // Create akun karyawan (tanpa logout admin)
  // Trik: buat second app instance untuk createUser supaya sesi admin tetap
  const secondApp = firebase.apps.length > 1 ? firebase.apps[1] : firebase.initializeApp(firebaseConfig, "second");
  const secondAuth = secondApp.auth();

  // Dialog konfirmasi UID
  const confirmUidDlg = document.createElement("dialog");
  confirmUidDlg.id = "confirmUidDlg";
  confirmUidDlg.innerHTML = `
    <div class="dlg-head">
      <div class="row"><span class="material-symbols-rounded">person_add</span><b>Konfirmasi UID</b></div>
      <button class="icon-btn" onclick="document.getElementById('confirmUidDlg').close()"><span class="material-symbols-rounded">close</span></button>
    </div>
    <div class="dlg-body">
      <p>Akun berhasil dibuat! Salin UID berikut dan tambahkan ke constant KARYawan_UIDS di app.js:</p>
      <div class="input" style="margin:10px 0">
        <input id="newUid" type="text" readonly />
        <button class="btn" onclick="copyUid()">Salin</button>
      </div>
      <button class="btn" onclick="document.getElementById('confirmUidDlg').close()">Selesai</button>
    </div>
  `;
  document.body.appendChild(confirmUidDlg);
  
  function copyUid() {
    const uidInput = $("#newUid");
    uidInput.select();
    document.execCommand("copy");
    toast("UID disalin ke clipboard");
  }

  $("#createUserBtn").onclick = async () => {
    const email = $("#newEmail").value.trim();
    const pass = $("#newPass").value.trim();
    if (!email || !pass) { toast("Isi email dan kata sandi."); return; }
    
    const loadingEl = $("#loading");
    if (loadingEl) loadingEl.style.display = "flex";
    
    try {
      const cred = await secondAuth.createUserWithEmailAndPassword(email, pass);
      const uid = cred.user.uid;
      await db.collection("users").doc(uid).set({
        email, role:"karyawan", createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
      
      // Tampilkan dialog konfirmasi UID
      $("#newUid").value = uid;
      $("#confirmUidDlg").showModal();
      
      // Kembalikan secondAuth ke kosong signOut agar tidak mengganggu
      await secondAuth.signOut();
    } catch (e) {
      toast("Gagal membuat akun karyawan.");
    } finally {
      if (loadingEl) loadingEl.style.display = "none";
    }
  };

  // Bersih
  window.addEventListener("beforeunload", () => {
    unsubCuti && unsubCuti();
  });
}

// Fungsi utilitas untuk CSV dan download
function toCSV(rows, columns) {
  const esc = (v) => `"${(v ?? "").toString().replace(/"/g,'""')}"`;
  const header = columns.map(esc).join(",");
  const body = rows.map(r => columns.map(k => esc(r[k])).join(",")).join("\n");
  return header + "\n" + body;
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"text/csv"}));
  a.download = filename;
  a.click();
}