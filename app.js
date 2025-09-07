// app.js - Firebase Presensi System FUPA
// Inisialisasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD6yGAN01Ns7ylc_MiCsQzcSKsIvhsCqzk",
  authDomain: "presensi-byannisakaromi.firebaseapp.com",
  projectId: "presensi-byannisakaromi",
  storageBucket: "presensi-byannisakaromi.firebasestorage.app",
  messagingSenderId: "291177514444",
  appId: "1:291177514444:web:e312b378fa2c8f215ac969",
  measurementId: "G-GXJC2K4ETP"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Konstanta Cloudinary
const CLOUD_NAME = "dn2o2vf04";
const UPLOAD_PRESET = "presensi_unsigned";

// Daftar UID Admin dan Karyawan
const ADMIN_UIDS = [
  "S14dxz13hdMAVxxiPhTyqYsraCm2", // karomi@fupa.id
  "OXQMUSsnSZRzHkRPQfx7wZDb2PI3"  // annisa@fupa.id
];

const KARYAWAN_UIDS = [
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
];

// Utility Functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const toast = (msg) => {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2200);
};

// Fungsi untuk mendapatkan waktu server
async function getServerTime() {
  try {
    const docRef = db.collection("_meta").doc("_srv");
    await docRef.set({ t: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await docRef.get();
    const ts = snap.get("t");
    return ts ? ts.toDate() : new Date();
  } catch (error) {
    console.error("Error getting server time:", error);
    return new Date();
  }
}

// Format tanggal dan waktu
function fmtDateTime(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtHM(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ymd(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// Aturan jam presensi
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

// Fungsi untuk mendapatkan override jadwal
async function getScheduleOverride(dateYMD) {
  try {
    const doc = await db.collection("_settings").doc("today").get();
    if (doc.exists) {
      const d = doc.data();
      if (d.date === dateYMD) return d.mode;
    }
    return "auto";
  } catch (error) {
    console.error("Error getting schedule override:", error);
    return "auto";
  }
}

// Fungsi untuk menentukan role user
function getUserRole(uid) {
  if (ADMIN_UIDS.includes(uid)) return "admin";
  if (KARYAWAN_UIDS.includes(uid)) return "karyawan";
  return "unknown";
}

// Fungsi untuk redirect berdasarkan role
function redirectByRole(uid) {
  const role = getUserRole(uid);
  const path = location.pathname.toLowerCase();
  
  if (role === "admin" && !path.endsWith("admin.html")) {
    location.href = "admin.html";
  } else if (role === "karyawan" && !path.endsWith("karyawan.html")) {
    location.href = "karyawan.html";
  } else if (role === "unknown") {
    auth.signOut();
    toast("Akses ditolak: akun belum diberi peran yang benar.");
  }
}

// Fungsi untuk guard halaman berdasarkan role
function guardPage(uid) {
  const role = getUserRole(uid);
  const path = location.pathname.toLowerCase();
  
  if (role === "admin" && !path.endsWith("admin.html")) {
    location.href = "index.html";
    return false;
  }
  
  if (role === "karyawan" && !path.endsWith("karyawan.html")) {
    location.href = "index.html";
    return false;
  }
  
  if (role === "unknown") {
    auth.signOut();
    location.href = "index.html";
    return false;
  }
  
  return true;
}

// Fungsi untuk bootstrap collections
async function bootstrapCollections(user) {
  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userRole = getUserRole(user.uid);
    
    if (userDoc.exists) {
      // Update last login
      await db.collection("users").doc(user.uid).set({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      return userDoc.data();
    } else {
      // Buat dokumen user baru
      const userData = {
        email: user.email || "",
        role: userRole,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection("users").doc(user.uid).set(userData);
      return userData;
    }
  } catch (error) {
    console.error("Error bootstrapping collections:", error);
    return { 
      role: getUserRole(user.uid),
      email: user.email || ""
    };
  }
}

// Fungsi untuk memulai kamera
async function startCamera(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user" }, 
      audio: false 
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    toast("Tidak bisa mengakses kamera.");
    throw e;
  }
}

// Fungsi untuk menangkap gambar ke canvas
function captureToCanvas(videoEl, canvasEl) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  const MAXW = 720;
  const scale = Math.min(1, MAXW / w);
  canvasEl.width = Math.round(w * scale);
  canvasEl.height = Math.round(h * scale);
  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
}

// Fungsi untuk kompres gambar
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

// Fungsi untuk upload ke Cloudinary
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  
  try {
    const r = await fetch(url, { method: "POST", body: form });
    if (!r.ok) throw new Error("Upload Cloudinary gagal");
    const data = await r.json();
    return data.secure_url;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw error;
  }
}

// Fungsi untuk mendapatkan lokasi
function getLocation(timeout=8000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolokasi tidak didukung."));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ 
        lat: pos.coords.latitude, 
        lng: pos.coords.longitude 
      }),
      (err) => reject(err),
      { 
        enableHighAccuracy: true, 
        timeout, 
        maximumAge: 2000 
      }
    );
  });
}

// Fungsi untuk menyimpan presensi
async function savePresensi({ uid, nama, jenis, status, lat, lng, selfieUrl, serverDate }) {
  const ts = serverDate || new Date();
  const doc = {
    uid, 
    nama: nama || "", 
    jenis, 
    status,
    lat, 
    lng,
    selfieUrl: selfieUrl || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    localTime: fmtDateTime(ts),
    ymd: ymd(ts)
  };
  
  await db.collection("presensi").add(doc);
}

// Fungsi untuk mendapatkan riwayat presensi
function subscribeRiwayat(uid, cb) {
  return db.collection("presensi")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(10)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    });
}

// Fungsi untuk mendapatkan notifikasi
function subscribeNotifForKaryawan(uid, cb) {
  return db.collection("notifs")
    .where("targets", "array-contains-any", ["all", uid])
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    });
}

// Fungsi untuk mengajukan cuti
async function ajukanCuti(uid, nama, jenis, tanggal, catatan) {
  await db.collection("cuti").add({
    uid, 
    nama, 
    jenis, 
    tanggal, 
    catatan: catatan || "",
    status: "menunggu",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Fungsi untuk mendapatkan data cuti
function subscribeCuti(cb) {
  return db.collection("cuti")
    .where("status", "==", "menunggu")
    .orderBy("createdAt", "desc")
    .limit(50)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      cb(arr);
    });
}

// Fungsi untuk mengubah status cuti
async function setCutiStatus(id, status, adminUid) {
  const cutiDoc = await db.collection("cuti").doc(id).get();
  const cutiData = cutiDoc.data();
  
  await db.collection("cuti").doc(id).set({ status }, { merge: true });
  
  // Kirim notifikasi ke karyawan
  await db.collection("notifs").add({
    type: "cuti",
    text: `Cuti Anda pada ${cutiData.tanggal} telah ${status}`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    targets: [cutiData.uid]
  });
}

// Fungsi untuk mengirim pengumuman
async function kirimPengumuman(text, adminUid) {
  await db.collection("notifs").add({
    type: "announce",
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: adminUid,
    targets: ["all"]
  });
}

// Fungsi untuk mengatur mode hari
async function setHariMode(mode, dateStr) {
  await db.collection("_settings").doc("today").set({
    mode, 
    date: dateStr
  }, { merge: true });
}

// Fungsi untuk menyimpan profil
async function saveProfile(uid, { nama, alamat, pfpUrl }) {
  const d = {};
  if (nama !== undefined) d.nama = nama;
  if (alamat !== undefined) d.alamat = alamat;
  if (pfpUrl !== undefined) d.pfp = pfpUrl;
  d.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  
  await db.collection("users").doc(uid).set(d, { merge: true });
}

// Fungsi untuk mendapatkan profil
async function getProfile(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists ? snap.data() : {};
  } catch (error) {
    console.error("Error getting profile:", error);
    return {};
  }
}

// Fungsi untuk menghapus presensi
async function deletePresensi(id) {
  await db.collection("presensi").doc(id).delete();
}

// Fungsi untuk memulai jam server
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
  setInterval(tick, 10000);
}

// Fungsi untuk memastikan izin notifikasi
async function ensureNotificationPermission() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const res = await Notification.requestPermission();
      return res === "granted";
    }
    return false;
  } catch { 
    return false; 
  }
}

// Fungsi untuk menampilkan notifikasi
function notify(msg) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Presensi FUPA", { body: msg });
  }
}

// Fungsi untuk bind halaman login
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
    $("#loading").style.display = "flex";
    
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged akan redirect by role
    } catch (e) {
      $("#loading").style.display = "none";
      
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

  // Enter key untuk login
  $("#password").addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      loginBtn.click();
    }
  });
}

// Fungsi untuk bind halaman karyawan
async function bindKaryawanPage(user, userData) {
  try {
    // Tampilkan loading
    $("#loading").style.display = "flex";
    
    // Inisialisasi elemen
    const video = $("#cam");
    const canvas = $("#canvas");
    const preview = $("#preview");
    const jenisSel = $("#jenis");
    const statusText = $("#statusText");
    const statusChip = $("#statusChip");
    const locText = $("#locText");
    
    // Pastikan elemen ada
    if (!video || !canvas || !preview || !jenisSel || !statusText || !statusChip || !locText) {
      throw new Error("Elemen yang diperlukan tidak ditemukan!");
    }
    
    // Mulai kamera
    let stream;
    try {
      stream = await startCamera(video);
    } catch (e) {
      $("#loading").style.display = "none";
      return;
    }
    
    // Dapatkan lokasi
    let coords = null;
    try {
      coords = await getLocation();
      locText.textContent = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    } catch {
      locText.textContent = "Lokasi tidak aktif";
    }
    
    // Muat profil
    const profile = await getProfile(user.uid);
    if (profile.pfp) $("#pfp").src = profile.pfp;
    if (profile.nama) $("#nama").value = profile.nama;
    if (profile.alamat) $("#alamat").value = profile.alamat;
    
    // Fungsi untuk refresh status
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
        return { allowed: false, reason: "not-required" };
      }
      
      const win = inWindow(serverNow, jenis, 30);
      if (!win.allowed) {
        statusText.textContent = "Di luar jam presensi";
        statusChip.className = "status s-bad";
        return { allowed: false, reason: "out-of-window" };
      } else {
        statusText.textContent = win.status === "tepat" ? "Tepat waktu" : "Terlambat";
        statusChip.className = "status " + (win.status === "tepat" ? "s-good" : "s-warn");
        return { allowed: true, status: win.status, serverNow };
      }
    }
    
    let lastStatus = await refreshStatus();
    setInterval(async () => { lastStatus = await refreshStatus(); }, 30000);
    
    // Event listener untuk tombol snap
    $("#snapBtn").onclick = () => {
      captureToCanvas(video, canvas);
      canvas.style.display = "block";
      preview.style.display = "none";
      toast("Foto diambil. Anda bisa langsung upload.");
    };
    
    // Event listener untuk tombol upload
    $("#uploadBtn").onclick = async () => {
      lastStatus = await refreshStatus();
      if (!lastStatus.allowed) {
        toast("Presensi ditolak: di luar jadwal atau tidak wajib.");
        return;
      }
      if (!coords) {
        toast("Lokasi belum aktif.");
        return;
      }
      if (canvas.width === 0 || canvas.height === 0) {
        toast("Ambil selfie dulu.");
        return;
      }
      
      $("#loading").style.display = "flex";
      
      try {
        const blob = await canvasToCompressedBlob(canvas, 50);
        const url = await uploadToCloudinary(blob);
        preview.src = url;
        preview.style.display = "block";
        
        const nama = ($("#nama")?.value || profile.nama || user.email.split("@")[0]).trim();
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
        toast("Gagal menyimpan presensi.");
      } finally {
        $("#loading").style.display = "none";
      }
    };
    
    // Riwayat presensi
    const unsubLog = subscribeRiwayat(user.uid, (items) => {
      const list = $("#logList");
      if (!list) return;
      
      list.innerHTML = "";
      items.forEach(it => {
        const badge = it.status === "tepat" ? "s-good" : (it.status === "terlambat" ? "s-warn" : "s-bad");
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
    
    // Notifikasi
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
    
    // Cuti
    $("#cutiFab").onclick = () => $("#cutiDlg").showModal();
    $("#ajukanCutiBtn").onclick = async () => {
      const jenis = $("#cutiJenis").value;
      const tanggal = $("#cutiTanggal").value;
      const catatan = $("#cutiCatatan").value.trim();
      
      if (!tanggal) { 
        toast("Pilih tanggal cuti."); 
        return; 
      }
      
      $("#loading").style.display = "flex";
      
      try {
        const nama = ($("#nama")?.value || profile.nama || user.email.split("@")[0]).trim();
        await ajukanCuti(user.uid, nama, jenis, tanggal, catatan);
        toast("Permintaan cuti dikirim.");
        $("#cutiDlg").close();
      } catch (e) {
        toast("Gagal mengajukan cuti.");
      } finally {
        $("#loading").style.display = "none";
      }
    };
    
    // Profil
    $("#profileBtn").onclick = () => $("#profileDlg").showModal();
    $("#saveProfileBtn").onclick = async () => {
      $("#loading").style.display = "flex";
      
      try {
        let pfpUrl;
        const file = $("#pfpFile").files?.[0];
        
        if (file) {
          const imgEl = document.createElement("img");
          imgEl.src = URL.createObjectURL(file);
          await new Promise(r => imgEl.onload = r);
          
          const c = document.createElement("canvas");
          const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
          c.width = Math.max(64, Math.round(imgEl.width * scale));
          c.height = Math.max(64, Math.round(imgEl.height * scale));
          
          const ctx = c.getContext("2d");
          ctx.drawImage(imgEl, 0, 0, c.width, c.height);
          
          const pfpBlob = await canvasToCompressedBlob(c, 50);
          pfpUrl = await uploadToCloudinary(pfpBlob);
          $("#pfp").src = pfpUrl;
        }
        
        const nama = $("#nama").value.trim();
        const alamat = $("#alamat").value.trim();
        
        await saveProfile(user.uid, { nama, alamat, pfpUrl });
        toast("Profil tersimpan.");
      } catch {
        toast("Gagal menyimpan profil.");
      } finally {
        $("#loading").style.display = "none";
      }
    };
    
    // Logout
    $("#logoutBtn").onclick = async () => { 
      $("#loading").style.display = "flex";
      await auth.signOut(); 
      location.href = "index.html"; 
    };
    
    // Sembunyikan loading
    $("#loading").style.display = "none";
    
    // Bersihkan saat keluar
    window.addEventListener("beforeunload", () => {
      try { 
        if (stream) stream.getTracks().forEach(t => t.stop()); 
      } catch {}
      
      if (unsubLog) unsubLog();
      if (unsubNotif) unsubNotif();
    });
  } catch (error) {
    console.error("Error in bindKaryawanPage:", error);
    toast("Error memuat halaman karyawan: " + error.message);
    $("#loading").style.display = "none";
  }
}

// Fungsi untuk bind halaman admin
async function bindAdminPage(user, userData) {
  try {
    // Muat profil
    const profile = await getProfile(user.uid);
    if (profile.pfp) $("#pfp").src = profile.pfp;
    if (profile.nama) $("#nama").value = profile.nama;
    if (profile.alamat) $("#alamat").value = profile.alamat;
    
    // Dialog profil
    $("#profileBtn").onclick = () => $("#profileDlg").showModal();
    $("#logoutBtn").onclick = async () => { 
      $("#loading").style.display = "flex";
      await auth.signOut(); 
      location.href = "index.html"; 
    };
    
    // Simpan profil
    $("#saveProfileBtn").onclick = async () => {
      $("#loading").style.display = "flex";
      
      try {
        let pfpUrl;
        const file = $("#pfpFile").files?.[0];
        
        if (file) {
          const imgEl = document.createElement("img");
          imgEl.src = URL.createObjectURL(file);
          await new Promise(r => imgEl.onload = r);
          
          const c = document.createElement("canvas");
          const scale = Math.min(1, 512 / Math.max(imgEl.width, imgEl.height));
          c.width = Math.max(64, Math.round(imgEl.width * scale));
          c.height = Math.max(64, Math.round(imgEl.height * scale));
          
          const ctx = c.getContext("2d");
          ctx.drawImage(imgEl, 0, 0, c.width, c.height);
          
          const blob = await canvasToCompressedBlob(c, 50);
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
        $("#loading").style.display = "none";
      }
    };
    
    // Notifikasi cuti
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
              <span class="status ${it.status === 'menunggu' ? 's-warn' : (it.status === 'disetujui' ? 's-good' : 's-bad')}">${it.status}</span>
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
        $("#loading").style.display = "flex";
        await setCutiStatus(b.dataset.id, "disetujui", user.uid);
        $("#loading").style.display = "none";
        toast("Cuti disetujui.");
      });
      
      $$("[data-act='reject']").forEach(b => b.onclick = async () => {
        $("#loading").style.display = "flex";
        await setCutiStatus(b.dataset.id, "ditolak", user.uid);
        $("#loading").style.display = "none";
        toast("Cuti ditolak.");
      });
    });
    
    // Pengumuman
    $("#announceFab").onclick = async () => {
      const text = prompt("Tulis pengumuman:");
      if (!text) return;
      
      $("#loading").style.display = "flex";
      await kirimPengumuman(text, user.uid);
      $("#loading").style.display = "none";
      toast("Pengumuman terkirim.");
    };
    
    $("#sendAnnounce").onclick = async () => {
      const text = $("#announceText").value.trim();
      if (!text) { 
        toast("Tulis isi pengumuman."); 
        return; 
      }
      
      $("#loading").style.display = "flex";
      await kirimPengumuman(text, user.uid);
      $("#announceText").value = "";
      $("#loading").style.display = "none";
      toast("Pengumuman terkirim.");
    };
    
    // Jadwal wajib
    $("#saveSchedule").onclick = async () => {
      const mode = $("#wajibHari").value;
      const now = await getServerTime();
      
      $("#loading").style.display = "flex";
      await setHariMode(mode, ymd(now));
      $("#loading").style.display = "none";
      toast("Pengaturan hari tersimpan.");
    };
    
    // Tabel presensi
    let lastData = [];
    let currentPage = 1;
    const pageSize = 20;
    
    async function loadPresensi() {
      $("#loading").style.display = "flex";
      
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
            startDate.setHours(0, 0, 0, 0);
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
      
      // Ambil data
      const snap = await q.get();
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      
      let filtered = arr;
      if (tanggal) filtered = filtered.filter(x => x.ymd === tanggal);
      if (nama) filtered = filtered.filter(x => (x.nama || "").toLowerCase().includes(nama));
      
      lastData = filtered;
      renderPagination(filtered.length);
      renderTable(filtered, currentPage);
      
      $("#loading").style.display = "none";
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
        const badge = r.status === "tepat" ? "s-good" : (r.status === "terlambat" ? "s-warn" : "s-bad");
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
    
    // Bind fungsi deletePresensi ke window
    window.deletePresensi = async (id) => {
      if (confirm("Hapus data presensi ini?")) {
        $("#loading").style.display = "flex";
        await deletePresensi(id);
        $("#loading").style.display = "none";
        toast("Presensi dihapus");
        loadPresensi();
      }
    };
    
    $("#applyFilter").onclick = () => {
      currentPage = 1;
      loadPresensi();
    };
    
    $("#exportCsv").onclick = () => {
      if (!lastData.length) { 
        toast("Tidak ada data untuk diekspor."); 
        return; 
      }
      
      const cols = ["localTime", "nama", "jenis", "status", "lat", "lng", "selfieUrl", "uid", "ymd"];
      const csv = toCSV(lastData, cols);
      download(`presensi_${Date.now()}.csv`, csv);
    };
    
    // Muat data awal
    await loadPresensi();
    
    // Buat akun karyawan
    $("#createUserBtn").onclick = async () => {
      const email = $("#newEmail").value.trim();
      const pass = $("#newPass").value.trim();
      
      if (!email || !pass) { 
        toast("Isi email dan kata sandi."); 
        return; 
      }
      
      $("#loading").style.display = "flex";
      
      try {
        // Buat second app instance untuk createUser tanpa logout admin
        const secondApp = firebase.apps.length > 1 ? 
          firebase.apps[1] : 
          firebase.initializeApp(firebaseConfig, "second");
        
        const secondAuth = secondApp.auth();
        const cred = await secondAuth.createUserWithEmailAndPassword(email, pass);
        const uid = cred.user.uid;
        
        await db.collection("users").doc(uid).set({
          email, 
          role: "karyawan", 
          createdBy: user.uid, 
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Tampilkan dialog konfirmasi UID
        $("#newUid").value = uid;
        $("#confirmUidDlg").showModal();
        
        // Kembalikan secondAuth ke kosong
        await secondAuth.signOut();
      } catch (e) {
        toast("Gagal membuat akun karyawan.");
      } finally {
        $("#loading").style.display = "none";
      }
    };
    
    // Bersihkan saat keluar
    window.addEventListener("beforeunload", () => {
      if (unsubCuti) unsubCuti();
    });
  } catch (error) {
    console.error("Error in bindAdminPage:", error);
    toast("Error memuat halaman admin: " + error.message);
  }
}

// Fungsi untuk konversi ke CSV
function toCSV(rows, columns) {
  const esc = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  const header = columns.map(esc).join(",");
  const body = rows.map(r => columns.map(k => esc(r[k])).join(",")).join("\n");
  return header + "\n" + body;
}

// Fungsi untuk download file
function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

// Fungsi untuk copy UID
function copyUid() {
  const uidInput = $("#newUid");
  uidInput.select();
  document.execCommand("copy");
  toast("UID disalin ke clipboard");
}

// Auth state change handler
auth.onAuthStateChanged(async (user) => {
  const path = location.pathname.toLowerCase();
  
  if (!user) {
    // Cegah akses langsung ke halaman yang membutuhkan login
    if (path.endsWith("karyawan.html") || path.endsWith("admin.html")) {
      location.href = "index.html";
    }
    
    // Inisialisasi halaman login
    if (path.endsWith("index.html") || path.endsWith("/")) {
      bindLoginPage();
    }
    
    return;
  }
  
  try {
    const userData = await bootstrapCollections(user);
    
    // Update server time
    startServerClock("#serverTime");
    
    // Routing berdasarkan role
    if (path.endsWith("index.html") || path.endsWith("/")) {
      redirectByRole(user.uid);
      return;
    }
    
    if (path.endsWith("karyawan.html")) {
      if (!guardPage(user.uid)) return;
      await ensureNotificationPermission();
      await bindKaryawanPage(user, userData);
    }
    
    if (path.endsWith("admin.html")) {
      if (!guardPage(user.uid)) return;
      await ensureNotificationPermission();
      await bindAdminPage(user, userData);
    }
  } catch (error) {
    console.error("Error in auth state change:", error);
    toast("Error memuat data pengguna. Silakan coba lagi.");
    await auth.signOut();
    location.href = "index.html";
  }
});

// PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

// Inisialisasi berdasarkan halaman saat ini
document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname.toLowerCase();
  
  if (path.endsWith("index.html") || path.endsWith("/")) {
    bindLoginPage();
  }
});