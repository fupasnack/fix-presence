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
  setTimeout(() => { t.style.display = "none"; }, 3000);
};

// Fungsi untuk mendapatkan waktu server
async function getServerTime() {
  try {
    const docRef = db.collection("_meta").doc("_srv");
    await docRef.set({ 
      t: firebase.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
    
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
  const start = new Date(d); 
  start.setHours(w.start.h, w.start.m, 0, 0);
  
  const end = new Date(d);   
  end.setHours(w.end.h, w.end.m, 0, 0);
  
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
  const currentPath = window.location.pathname;
  
  if (role === "admin" && !currentPath.endsWith("admin.html")) {
    window.location.href = "admin.html";
  } else if (role === "karyawan" && !currentPath.endsWith("karyawan.html")) {
    window.location.href = "karyawan.html";
  } else if (role === "unknown") {
    auth.signOut();
    toast("Akses ditolak: akun belum diberi peran yang benar.");
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
    return stream;
  } catch (e) {
    toast("Tidak bisa mengakses kamera. Pastikan Anda memberikan izin.");
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
  
  for (let i = 0; i < 5 && blob.size / 1024 > targetKB; i++) {
    quality = Math.max(0.3, quality - 0.1);
    blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
  }
  
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
    }, error => {
      console.error("Error subscribing to presensi:", error);
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
    }, error => {
      console.error("Error subscribing to notifications:", error);
    });
}

// Fungsi untuk mendapatkan notifikasi cuti untuk admin
function subscribeNotifCutiForAdmin(cb) {
  return db.collection("notifs")
    .where("type", "==", "cuti_request")
    .orderBy("createdAt", "desc")
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => {
        const data = d.data();
        // Pastikan notifikasi ditujukan untuk admin
        if (data.targets && (data.targets.includes("all") || 
            data.targets.some(target => ADMIN_UIDS.includes(target)))) {
          arr.push({ id: d.id, ...data });
        }
      });
      cb(arr);
    }, error => {
      console.error("Error subscribing to cuti notifications:", error);
    });
}

// Fungsi untuk mengajukan cuti
async function ajukanCuti(uid, nama, jenis, tanggal, catatan) {
  // Simpan data cuti
  const cutiRef = await db.collection("cuti").add({
    uid, 
    nama, 
    jenis, 
    tanggal, 
    catatan: catatan || "",
    status: "menunggu",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  // Buat notifikasi untuk admin
  await db.collection("notifs").add({
    type: "cuti_request",
    cutiId: cutiRef.id,
    text: `${nama} mengajukan ${jenis} pada ${tanggal}${catatan ? ': ' + catatan : ''}`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    from: uid,
    targets: ADMIN_UIDS,
    read: false
  });
}

// Fungsi untuk memproses permintaan cuti
async function processCutiRequest(notifId, cutiId, status, adminUid) {
  try {
    // Update status cuti
    await db.collection("cuti").doc(cutiId).update({ 
      status,
      processedAt: firebase.firestore.FieldValue.serverTimestamp(),
      processedBy: adminUid
    });
    
    // Dapatkan data cuti
    const cutiDoc = await db.collection("cuti").doc(cutiId).get();
    const cutiData = cutiDoc.data();
    
    // Buat presensi otomatis jika cuti disetujui
    if (status === "disetujui") {
      let dateObj = new Date(cutiData.tanggal);
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date(); // Fallback jika tanggal invalid
      }
      
      await db.collection("presensi").add({
        uid: cutiData.uid,
        nama: cutiData.nama,
        jenis: cutiData.jenis,
        status: "cuti",
        lat: null,
        lng: null,
        selfieUrl: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        localTime: fmtDateTime(dateObj),
        ymd: ymd(dateObj),
        keterangan: cutiData.catatan || ""
      });
    }
    
    // Kirim notifikasi ke karyawan
    await db.collection("notifs").add({
      type: "cuti_response",
      text: `Permintaan ${cutiData.jenis} Anda pada ${cutiData.tanggal} telah ${status}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      from: adminUid,
      targets: [cutiData.uid],
      read: false
    });
    
    // Hapus notifikasi permintaan cuti
    await db.collection("notifs").doc(notifId).delete();
    
    return true;
  } catch (error) {
    console.error("Error processing cuti request:", error);
    throw error;
  }
}

// Fungsi untuk mengirim pengumuman
async function kirimPengumuman(text, adminUid) {
  try {
    await db.collection("notifs").add({
      type: "announce",
      text: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      from: adminUid,
      targets: ["all"],
      read: false
    });
    return true;
  } catch (error) {
    console.error("Error sending announcement:", error);
    throw error;
  }
}

// Fungsi untuk mengatur mode hari
async function setHariMode(mode, dateStr, adminUid) {
  try {
    await db.collection("_settings").doc("today").set({
      mode, 
      date: dateStr,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUid
    }, { merge: true });
    
    // Kirim notifikasi override ke semua karyawan
    let message = "";
    if (mode === "forceOn") {
      message = "Admin memaksa wajib presensi hari ini (" + dateStr + ").";
    } else if (mode === "forceOff") {
      message = "Admin memaksa tidak wajib presensi hari ini (" + dateStr + ").";
    } else {
      message = "Pengaturan presensi kembali ke mode otomatis (Minggu non-presensi) untuk hari ini (" + dateStr + ").";
    }
    
    await db.collection("notifs").add({
      type: "override",
      text: message,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      from: adminUid,
      targets: ["all"],
      read: false
    });
    
    return true;
  } catch (error) {
    console.error("Error setting day mode:", error);
    throw error;
  }
}

// Fungsi untuk override presensi oleh admin
async function overridePresensi(tanggal, status, adminUid) {
  try {
    await db.collection("overrides").doc(tanggal).set({
      tanggal: tanggal,
      status: status,
      dibuatPada: new Date(),
      oleh: adminUid
    });
    
    // Kirim notifikasi ke semua karyawan
    await db.collection("notifs").add({
      type: "override",
      text: `Admin telah mengubah status presensi tanggal ${tanggal} menjadi: ${status}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      from: adminUid,
      targets: ["all"],
      read: false
    });
    
    return true;
  } catch (error) {
    console.error("Error overriding presensi:", error);
    throw error;
  }
}

// Fungsi untuk menghapus notifikasi
async function hapusNotifikasi(notifId) {
  try {
    await db.collection("notifs").doc(notifId).delete();
    return true;
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
}

// Fungsi untuk menandai notifikasi sebagai sudah dibaca
async function tandaiNotifikasiDibaca(notifId) {
  try {
    await db.collection("notifs").doc(notifId).update({
      read: true,
      readAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
}

// Fungsi untuk mendapatkan daftar karyawan
async function getDaftarKaryawan() {
  try {
    const snapshot = await db.collection("users")
      .where("role", "==", "karyawan")
      .get();
    
    const karyawan = [];
    snapshot.forEach(doc => {
      karyawan.push({ id: doc.id, ...doc.data() });
    });
    
    return karyawan;
  } catch (error) {
    console.error("Error getting employees:", error);
    return [];
  }
}

// Fungsi untuk mengupdate data karyawan
async function updateKaryawan(uid, data) {
  try {
    const updateData = {};
    if (data.nama) updateData.nama = data.nama;
    if (data.email) updateData.email = data.email;
    if (data.jabatan) updateData.jabatan = data.jabatan;
    if (data.alamat) updateData.alamat = data.alamat;
    
    updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    
    await db.collection("users").doc(uid).update(updateData);
    return true;
  } catch (error) {
    console.error("Error updating employee:", error);
    throw error;
  }
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

// Fungsi untuk menyimpan profil
async function saveProfile(uid, { nama, alamat, pfpUrl }) {
  const d = {};
  if (nama !== undefined) d.nama = nama;
  if (alamat !== undefined) d.alamat = alamat;
  if (pfpUrl !== undefined) d.pfp = pfpUrl;
  d.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  
  await db.collection("users").doc(uid).set(d, { merge: true });
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

// Auth state change handler
auth.onAuthStateChanged(async (user) => {
  const path = window.location.pathname;
  
  if (!user) {
    // Cegah akses langsung ke halaman yang membutuhkan login
    if (path.endsWith("karyawan.html") || path.endsWith("admin.html")) {
      window.location.href = "index.html";
    }
    
    // Inisialisasi halaman login
    if (path.endsWith("index.html") || path.endsWith("/")) {
      bindLoginPage();
    }
    
    return;
  }
  
  try {
    // Dapatkan role user
    const role = getUserRole(user.uid);
    
    // Update server time
    startServerClock("#serverTime");
    
    // Routing berdasarkan role
    if (path.endsWith("index.html") || path.endsWith("/")) {
      redirectByRole(user.uid);
      return;
    }
    
    if (path.endsWith("karyawan.html")) {
      if (role !== "karyawan") {
        window.location.href = "index.html";
        return;
      }
      // Implementasi bindKaryawanPage akan ada di file karyawan.html
    }
    
    if (path.endsWith("admin.html")) {
      if (role !== "admin") {
        window.location.href = "index.html";
        return;
      }
      // Implementasi bindAdminPage akan ada di file admin.html
    }
  } catch (error) {
    console.error("Error in auth state change:", error);
    toast("Error memuat data pengguna. Silakan coba lagi.");
    await auth.signOut();
    window.location.href = "index.html";
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
  const path = window.location.pathname;
  
  if (path.endsWith("index.html") || path.endsWith("/")) {
    bindLoginPage();
  }
});