import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Users, BookOpen, ArrowUpRight, LayoutDashboard, 
  Calendar, CalendarDays, CalendarRange, Menu, X, 
  Settings, LogIn, Lock, User, Save, CheckCircle, FileSpreadsheet, FileText, Library, Clock
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot } from 'firebase/firestore';

// --- FIREBASE CONFIG (CERDAS DUAL-MODE) ---
const customFirebaseConfig = {
  apiKey: "AIzaSyAK1anh6EOnV7LehWokqMwxj42c70muo3E",
  authDomain: "tally-penghitung-pengunjung.firebaseapp.com",
  projectId: "tally-penghitung-pengunjung",
  storageBucket: "tally-penghitung-pengunjung.firebasestorage.app",
  messagingSenderId: "675108877018",
  appId: "1:675108877018:web:3b93026aee7a117fc62be3"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : customFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const envAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  // --- STATE AUTHENTICATION & LOGIN ---
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // --- STATE SETTINGS ---
  const [settings, setSettings] = useState({
    logo: 'logo.png',
    namaKota: 'Gunung Terang',
    namaPustakawan: 'Budi Santoso, S.Pus',
    nipPustakawan: '19800101 201001 1 001', 
    namaKepsek: 'Hj. Siti Aminah, M.Pd',
    nipKepsek: '19750817 200501 2 003',
    namaSekolah: 'SDN 1 GUNUNG TERANG'
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- STATE UI & DATA ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('harian');
  const [bulanFilter, setBulanFilter] = useState('harian_sebulan'); // 'harian_sebulan' | 'bulanan_setahun'
  const [analisisFilter, setAnalisisFilter] = useState('hari_ini');
  
  const initDate = new Date();
  const initDateStr = `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, '0')}-${String(initDate.getDate()).padStart(2, '0')}`;
  const [customDate, setCustomDate] = useState({ start: initDateStr, end: initDateStr });
  
  const [dailyRecords, setDailyRecords] = useState({});
  const [syncStatus, setSyncStatus] = useState('Menghubungkan...');

  // --- HELPER DATES ---
  const getLocalDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  const parseLocalDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d);
  };

  const getMonday = (d) => {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(dt.setDate(diff));
  };

  const todayStr = getLocalDateString(new Date());
  const formatTanggal = (date) => date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const currentTodayTally = dailyRecords[todayStr] || { pengunjung: 0, pembaca: 0, peminjam: 0, hourly: {} };

  // --- FIREBASE DYNAMIC PATHS ---
  const getSettingsPath = (uid) => {
    if (typeof __app_id !== 'undefined') return doc(db, 'artifacts', envAppId, 'users', uid, 'settings', 'userSettings');
    return doc(db, 'settings', 'userSettings');
  };

  const getTalliesCollection = (uid) => {
    if (typeof __app_id !== 'undefined') return collection(db, 'artifacts', envAppId, 'users', uid, 'daily_tallies');
    return collection(db, 'daily_tallies');
  };

  const getTallyDoc = (uid, dateStr) => {
    if (typeof __app_id !== 'undefined') return doc(db, 'artifacts', envAppId, 'users', uid, 'daily_tallies', dateStr);
    return doc(db, 'daily_tallies', dateStr);
  };

  // --- FIREBASE INIT ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        setSyncStatus('Siap');
      } catch (error) {
        console.error("Firebase Auth Error:", error);
        setSyncStatus('Error Auth');
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; 

    const settingsRef = getSettingsPath(user.uid);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(prev => ({ ...prev, ...docSnap.data() }));
      }
    });

    const talliesRef = getTalliesCollection(user.uid);
    const unsubTallies = onSnapshot(talliesRef, (snapshot) => {
      const records = {};
      snapshot.forEach(document => {
        records[document.id] = document.data();
      });
      setDailyRecords(records);
      setSyncStatus('Database Sinkron');
    }, (err) => {
      console.error(err);
      setSyncStatus('Gagal Sinkron');
    });

    return () => { unsubSettings(); unsubTallies(); };
  }, [user]);

  // --- AGREGASI DATA STATISTIK ---
  const { dataHarian = [], dataPekanan = [], dataBulananHari = [], dataBulananBulan = [], dataTahunan = [], dataAnalisis = [], jamPuncakInfo = { jam: '-', total: 0 } } = useMemo(() => {
    
    // 1. DATA HARIAN
    const harian = [];
    for (let i = 7; i <= 16; i++) {
      const hourStr = i.toString().padStart(2, '0');
      const hrData = currentTodayTally.hourly?.[hourStr] || { pengunjung: 0, pembaca: 0, peminjam: 0 };
      harian.push({ name: `${hourStr}:00`, ...hrData });
    }

    // 2. DATA PEKANAN
    const pekanan = [];
    const monday = getMonday(new Date());
    const daysName = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = getLocalDateString(d);
      const rec = dailyRecords[dStr] || { pengunjung: 0, pembaca: 0, peminjam: 0 };
      pekanan.push({ name: daysName[i], tanggal: formatTanggal(d), ...rec });
    }

    // 3. DATA BULANAN
    const currYear = new Date().getFullYear();
    const currMonth = new Date().getMonth();
    
    const bulananHari = [];
    const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
       const dStr = getLocalDateString(new Date(currYear, currMonth, i));
       const rec = dailyRecords[dStr] || { pengunjung: 0, pembaca: 0, peminjam: 0 };
       bulananHari.push({ name: `Tgl ${i}`, ...rec });
    }

    const bulananBulan = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    monthNames.forEach((m) => {
       bulananBulan.push({ name: m, pengunjung: 0, pembaca: 0, peminjam: 0 });
    });

    // 4. DATA TAHUNAN & 5. ANALISIS JAM
    const tahunanMap = {};
    const hourlyAgg = {};
    for (let i = 7; i <= 16; i++) {
      hourlyAgg[i.toString().padStart(2, '0')] = { pengunjung: 0, pembaca: 0, peminjam: 0 };
    }

    const hariIniDate = parseLocalDate(todayStr);
    const tujuhHariLalu = new Date(hariIniDate);
    tujuhHariLalu.setDate(tujuhHariLalu.getDate() - 6);
    const limaTahunLalu = currYear - 4;

    Object.keys(dailyRecords).forEach(dateStr => {
      const rec = dailyRecords[dateStr];
      const d = parseLocalDate(dateStr);
      
      // Data Bulanan 12 Bulan
      if (d.getFullYear() === currYear) {
          const mIdx = d.getMonth();
          bulananBulan[mIdx].pengunjung += rec.pengunjung || 0;
          bulananBulan[mIdx].pembaca += rec.pembaca || 0;
          bulananBulan[mIdx].peminjam += rec.peminjam || 0;
      }

      // Data Tahunan
      const yearKey = d.getFullYear().toString();
      if (!tahunanMap[yearKey]) tahunanMap[yearKey] = { name: yearKey, pengunjung: 0, pembaca: 0, peminjam: 0 };
      tahunanMap[yearKey].pengunjung += rec.pengunjung || 0;
      tahunanMap[yearKey].pembaca += rec.pembaca || 0;
      tahunanMap[yearKey].peminjam += rec.peminjam || 0;

      // Data Analisis Jam Sibuk
      let include = false;
      switch (analisisFilter) {
        case 'hari_ini': include = (dateStr === todayStr); break;
        case '7_hari': include = (d >= tujuhHariLalu && d <= hariIniDate); break;
        case 'bulan_ini': include = (d.getMonth() === currMonth && d.getFullYear() === currYear); break;
        case 'tahun_ini': include = (d.getFullYear() === currYear); break;
        case '5_tahun': include = (d.getFullYear() >= limaTahunLalu && d.getFullYear() <= currYear); break;
        case 'kustom': 
          const startD = parseLocalDate(customDate.start);
          const endD = parseLocalDate(customDate.end);
          include = (d >= startD && d <= endD); 
          break;
        default: include = false;
      }

      if (include && rec.hourly) {
        Object.keys(rec.hourly).forEach(hr => {
          if (hourlyAgg[hr]) {
            hourlyAgg[hr].pengunjung += rec.hourly[hr].pengunjung || 0;
            hourlyAgg[hr].pembaca += rec.hourly[hr].pembaca || 0;
            hourlyAgg[hr].peminjam += rec.hourly[hr].peminjam || 0;
          }
        });
      }
    });

    if (Object.keys(tahunanMap).length === 0) {
        tahunanMap[currYear.toString()] = { name: currYear.toString(), pengunjung: 0, pembaca: 0, peminjam: 0 };
    }

    const analisisArr = Object.keys(hourlyAgg).sort().map(hr => ({
      name: `${hr}:00`,
      ...hourlyAgg[hr]
    }));

    let puncakNama = "-";
    let puncakNilai = 0;
    analisisArr.forEach(item => {
      if (item.pengunjung > puncakNilai) {
        puncakNilai = item.pengunjung;
        puncakNama = item.name;
      }
    });

    return {
      dataHarian: harian,
      dataPekanan: pekanan,
      dataBulananHari: bulananHari,
      dataBulananBulan: bulananBulan,
      dataTahunan: Object.values(tahunanMap).sort((a,b) => a.name.localeCompare(b.name)),
      dataAnalisis: analisisArr,
      jamPuncakInfo: { jam: puncakNama, total: puncakNilai }
    };
  }, [dailyRecords, currentTodayTally, analisisFilter, customDate, todayStr]);

  // --- HANDLERS ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (loginData.username === 'admin' && loginData.password === 'admin123') {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Username atau Password salah!');
    }
  };

  const handleTallyClick = async (type) => {
    const currentHour = new Date().getHours().toString().padStart(2, '0');
    
    let safeHour = parseInt(currentHour);
    if (safeHour < 7) safeHour = 7;
    if (safeHour > 16) safeHour = 16;
    const chartHour = safeHour.toString().padStart(2, '0');

    const newTotalValue = (currentTodayTally[type] || 0) + 1;
    const currentHourlyTypeCount = currentTodayTally.hourly?.[chartHour]?.[type] || 0;

    const updatedTally = { 
      ...currentTodayTally, 
      [type]: newTotalValue,
      hourly: {
        ...(currentTodayTally.hourly || {}),
        [chartHour]: {
          ...(currentTodayTally.hourly?.[chartHour] || { pengunjung: 0, pembaca: 0, peminjam: 0 }),
          [type]: currentHourlyTypeCount + 1
        }
      }
    };

    setDailyRecords(prev => ({ ...prev, [todayStr]: updatedTally }));

    if (user) {
      try {
        const tallyRef = getTallyDoc(user.uid, todayStr);
        await setDoc(tallyRef, updatedTally, { merge: true });
      } catch (error) {
        console.error("Gagal sinkron:", error);
      }
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setSettings(prev => ({ ...prev, logo: canvas.toDataURL('image/png', 0.85) }));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const saveSettingsToBackend = async () => {
    if (!user) {
      setSyncStatus('Koneksi Gagal');
      return;
    }
    setIsSavingSettings(true);
    try {
      const settingsRef = getSettingsPath(user.uid);
      await setDoc(settingsRef, settings, { merge: true });
      setTimeout(() => setIsSavingSettings(false), 1500);
    } catch (error) {
      console.error("Error saving settings:", error);
      setIsSavingSettings(false);
    }
  };

  const getActiveData = () => {
    switch(activeTab) {
      case 'harian': return dataHarian;
      case 'pekanan': return dataPekanan;
      case 'bulanan': return bulanFilter === 'harian_sebulan' ? dataBulananHari : dataBulananBulan;
      case 'tahunan': return dataTahunan;
      case 'analisis': return dataAnalisis;
      default: return dataHarian;
    }
  };

  const exportToCSV = () => {
    const data = getActiveData();
    const isPekanan = activeTab === 'pekanan';
    const isAnalisis = activeTab === 'analisis';
    const isHarian = activeTab === 'harian';
    
    let headers = ['Periode', 'Pengunjung', 'Pembaca', 'Peminjam'];
    if (isPekanan) headers = ['Hari', 'Tanggal', 'Pengunjung', 'Pembaca', 'Peminjam'];
    if (isAnalisis || isHarian) headers = ['Jam Kunjungan', 'Pengunjung', 'Pembaca', 'Peminjam'];

    const rows = data.map(row => {
      if (isPekanan) return [row.name, row.tanggal || '', row.pengunjung, row.pembaca, row.peminjam];
      return [row.name, row.pengunjung, row.pembaca, row.peminjam];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Perpus_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const element = document.getElementById('print-area');
    if (window.html2pdf && element) {
      const noPrintElements = element.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.style.display = 'none');
      const printOnlyElements = element.querySelectorAll('.print-only');
      printOnlyElements.forEach(el => el.style.display = 'block');

      const opt = {
        margin:       0.5,
        filename:     `Laporan_Perpus_${activeTab}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      window.html2pdf().set(opt).from(element).save().then(() => {
        noPrintElements.forEach(el => el.style.display = '');
        printOnlyElements.forEach(el => el.style.display = '');
      });
    } else {
      window.print();
    }
  };

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#0B666A] to-[#044A42]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/20">
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 mb-4 bg-white rounded-full flex items-center justify-center overflow-hidden border-4 border-[#0B666A] shadow-lg">
              <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-2" onError={(e) => { e.target.onerror = null; e.target.src = 'https://ui-avatars.com/api/?name=SD&background=0B666A&color=fff'; }} />
            </div>
            <h2 className="text-2xl font-bold text-[#0B666A] text-center">Login Sistem</h2>
            <p className="text-sm text-gray-500 text-center">Tally Perpustakaan {settings.namaSekolah}</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-1 block">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-400" />
                </div>
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] focus:border-transparent outline-none transition-all"
                  placeholder="admin"
                  value={loginData.username}
                  onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-1 block">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <input 
                  type="password" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                  required
                />
              </div>
            </div>
            
            {loginError && <p className="text-red-500 text-sm font-medium">{loginError}</p>}
            
            <button type="submit" className="w-full bg-[#0B666A] hover:bg-[#0a5255] text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-[#0B666A]/30">
              <LogIn size={20} />
              <span>Masuk Aplikasi</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const activeData = getActiveData();

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-slate-50 to-[#eef7f6]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; margin: 0; padding: 0; }
          .print-container { width: 100%; max-width: 100%; padding: 20px; box-sizing: border-box; }
          @page { size: A4 portrait; margin: 15mm; }
          .recharts-responsive-container { height: 300px !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* SIDEBAR */}
      <aside className={`no-print ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed md:relative z-20 transition-transform duration-300 ease-in-out w-64 h-full bg-gradient-to-b from-[#0B666A] via-[#0f7a7f] to-[#0a5255] text-white shadow-2xl flex flex-col`}>
        <div className="p-6 flex justify-between items-center border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 p-1 rounded-lg backdrop-blur-sm flex items-center justify-center">
               <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
               <Library size={24} className="text-[#97FEED] hidden" />
            </div>
            <div>
              <h1 className="font-bold text-base uppercase truncate w-32" title={settings.namaSekolah}>{settings.namaSekolah}</h1>
              <p className="text-[10px] text-[#97FEED] opacity-80">Perpustakaan Pintar</p>
            </div>
          </div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} className="text-white/70 hover:text-white" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <p className="px-3 text-xs font-semibold text-[#97FEED] uppercase tracking-wider mb-4 opacity-70">Laporan Statistik</p>
          {['harian', 'pekanan', 'bulanan', 'tahunan', 'analisis'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 capitalize ${activeTab === tab ? 'bg-white/15 text-white shadow-[0_0_15px_rgba(151,254,237,0.1)] border border-white/10' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
              {tab === 'harian' && <LayoutDashboard size={18} />}
              {tab === 'pekanan' && <CalendarDays size={18} />}
              {tab === 'bulanan' && <Calendar size={18} />}
              {tab === 'tahunan' && <CalendarRange size={18} />}
              {tab === 'analisis' && <Clock size={18} />}
              <span className="font-medium">{tab === 'analisis' ? 'Jam Sibuk' : `Data ${tab}`}</span>
            </button>
          ))}
          <p className="px-3 text-xs font-semibold text-[#97FEED] uppercase tracking-wider mt-8 mb-4 opacity-70">Manajemen</p>
          <button onClick={() => setActiveTab('pengaturan')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'pengaturan' ? 'bg-white/15 text-white shadow-[0_0_15px_rgba(151,254,237,0.1)] border border-white/10' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
            <Settings size={18} />
            <span className="font-medium">Pengaturan</span>
          </button>
          <button onClick={() => { setIsLoggedIn(false); setLoginData({username:'', password:''}); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-red-300 hover:bg-red-500/20">
            <LogIn size={18} className="transform rotate-180" />
            <span className="font-medium">Logout Admin</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main id="print-area" className="flex-1 flex flex-col h-full overflow-hidden relative print-container">
        
        <div className="print-only mb-8 text-center border-b-2 border-black pb-4">
          <div className="flex flex-col items-center justify-center space-y-2">
             <img src={settings.logo} alt="Logo" className="w-24 h-24 object-contain" />
             <div>
               <h1 className="text-2xl font-bold uppercase">LAPORAN KUNJUNGAN PERPUSTAKAAN</h1>
               <h2 className="text-xl font-bold uppercase">{settings.namaSekolah}</h2>
               <p className="text-sm mt-1">Dicetak pada: {formatTanggal(new Date())}</p>
             </div>
          </div>
        </div>

        <header className="no-print bg-white/60 backdrop-blur-md border-b border-gray-100 p-4 md:p-6 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center space-x-4">
            <button className="md:hidden p-2 bg-white rounded-lg shadow-sm text-[#0B666A]" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-[#044A42] tracking-tight">{activeTab === 'pengaturan' ? 'Pengaturan Sistem' : 'Tally Perpustakaan'}</h2>
              <p className="text-sm text-gray-500 font-medium">{activeTab === 'pengaturan' ? 'Kustomisasi Data Institusi' : 'Dashboard Pemantauan Pengunjung Real-time'}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          
          {activeTab === 'pengaturan' ? (
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 max-w-2xl mx-auto p-8 mb-10">
              <h3 className="text-xl font-bold text-[#044A42] mb-6 border-b pb-4">Informasi Institusi & Laporan</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold text-gray-600 block mb-2">Logo Pustaka</label>
                  <div className="flex items-center space-x-4">
                    <img src={settings.logo} alt="Preview Logo" className="w-20 h-20 rounded-lg object-contain bg-slate-50 border border-gray-200 p-2" />
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Nama Instansi / Sekolah</label>
                    <input type="text" name="namaSekolah" value={settings.namaSekolah} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Nama Kota</label>
                    <input type="text" name="namaKota" value={settings.namaKota || ''} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Nama Kepala Sekolah</label>
                    <input type="text" name="namaKepsek" value={settings.namaKepsek} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">NIP Kepala Sekolah</label>
                    <input type="text" name="nipKepsek" value={settings.nipKepsek} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Nama Pustakawan</label>
                    <input type="text" name="namaPustakawan" value={settings.namaPustakawan} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-2">NIP Pustakawan</label>
                    <input type="text" name="nipPustakawan" value={settings.nipPustakawan} onChange={handleSettingsChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B666A] outline-none transition-all" />
                  </div>
                </div>
                
                <div className="pt-6 mt-4 border-t border-gray-100 flex justify-end">
                  <button onClick={saveSettingsToBackend} disabled={isSavingSettings} className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-bold transition-all text-white shadow-lg ${isSavingSettings ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-[#0B666A] hover:bg-[#0a5255] shadow-[#0B666A]/30'}`}>
                    {isSavingSettings ? <CheckCircle size={20} /> : <Save size={20} />}
                    <span>{isSavingSettings ? 'Tersimpan!' : 'Simpan Pengaturan'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 no-print">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-between">
                  <span>Input Data Cepat ({formatTanggal(new Date())})</span>
                  <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                    <div className={`w-2 h-2 rounded-full ${syncStatus === 'Database Sinkron' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                    <span className="text-xs font-semibold text-gray-600">{syncStatus}</span>
                  </div>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <button onClick={() => handleTallyClick('pengunjung')} className="group relative bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(11,102,106,0.12)] border border-gray-100 transition-all duration-300 hover:-translate-y-1 overflow-hidden text-left cursor-pointer">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#35A29F]/10 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div>
                        <p className="text-gray-500 text-sm font-medium mb-1">Klik untuk menambah</p>
                        <h4 className="text-2xl font-bold text-[#0B666A] mb-4">+ Pengunjung</h4>
                      </div>
                      <div className="bg-[#eef7f6] p-4 rounded-2xl text-[#0B666A]">
                        <Users size={28} />
                      </div>
                    </div>
                    <div className="flex items-end justify-between relative z-10 mt-2">
                      <div className="text-5xl font-black text-[#044A42]">{currentTodayTally.pengunjung}</div>
                      <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">Total Hari Ini</div>
                    </div>
                  </button>

                  <button onClick={() => handleTallyClick('pembaca')} className="group relative bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)] border border-gray-100 transition-all duration-300 hover:-translate-y-1 overflow-hidden text-left cursor-pointer">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div>
                        <p className="text-gray-500 text-sm font-medium mb-1">Klik untuk menambah</p>
                        <h4 className="text-2xl font-bold text-blue-600 mb-4">+ Pembaca</h4>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-2xl text-blue-600">
                        <BookOpen size={28} />
                      </div>
                    </div>
                    <div className="flex items-end justify-between relative z-10 mt-2">
                      <div className="text-5xl font-black text-gray-800">{currentTodayTally.pembaca}</div>
                      <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Total Hari Ini</div>
                    </div>
                  </button>

                  <button onClick={() => handleTallyClick('peminjam')} className="group relative bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(245,158,11,0.12)] border border-gray-100 transition-all duration-300 hover:-translate-y-1 overflow-hidden text-left cursor-pointer">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div>
                        <p className="text-gray-500 text-sm font-medium mb-1">Klik untuk menambah</p>
                        <h4 className="text-2xl font-bold text-amber-500 mb-4">+ Peminjam</h4>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-2xl text-amber-500">
                        <ArrowUpRight size={28} />
                      </div>
                    </div>
                    <div className="flex items-end justify-between relative z-10 mt-2">
                      <div className="text-5xl font-black text-gray-800">{currentTodayTally.peminjam}</div>
                      <div className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">Total Hari Ini</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden mb-10 relative">
                <div className="p-6 md:p-8 border-b border-gray-100 flex flex-col md:flex-row md:justify-between md:items-center gap-4 no-print">
                  <div>
                    <h3 className="text-xl font-bold text-[#044A42]">Laporan Statistik {activeTab === 'analisis' ? 'Jam Sibuk' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                    <p className="text-gray-500 text-sm mt-1">
                      {activeTab === 'harian' && 'Grafik pengunjung hari ini berdasarkan jam kunjungan.'}
                      {activeTab === 'pekanan' && 'Rekapitulasi dari hari Senin sampai Sabtu pekan ini.'}
                      {activeTab === 'bulanan' && 'Perbandingan data laporan dalam rentang bulan atau setahun.'}
                      {activeTab === 'tahunan' && 'Perkembangan jumlah pengunjung perpustakaan per tahun.'}
                      {activeTab === 'analisis' && 'Analisis jam puncak kunjungan perpustakaan.'}
                    </p>
                  </div>
                  
                  {/* TOMBOL EXPORT FLEKSIBEL & FILTER */}
                  <div className="flex flex-wrap items-center gap-3">
                    {activeTab === 'bulanan' && (
                      <div className="flex bg-slate-100 p-1 rounded-lg border border-gray-200 mr-2">
                        <button onClick={() => setBulanFilter('harian_sebulan')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${bulanFilter === 'harian_sebulan' ? 'bg-white text-[#0B666A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Harian</button>
                        <button onClick={() => setBulanFilter('bulanan_setahun')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${bulanFilter === 'bulanan_setahun' ? 'bg-white text-[#0B666A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Bulanan</button>
                      </div>
                    )}
                    {activeTab === 'analisis' && (
                      <div className="flex flex-wrap items-center gap-2 mr-2">
                        <select 
                          value={analisisFilter} 
                          onChange={(e) => setAnalisisFilter(e.target.value)}
                          className="bg-slate-100 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#0B666A] focus:border-[#0B666A] block p-2"
                        >
                          <option value="hari_ini">Hari Ini</option>
                          <option value="7_hari">7 Hari Terakhir</option>
                          <option value="bulan_ini">Bulan Ini</option>
                          <option value="tahun_ini">Tahun Ini</option>
                          <option value="5_tahun">5 Tahun Terakhir</option>
                          <option value="kustom">Periode Kustom</option>
                        </select>
                        {analisisFilter === 'kustom' && (
                          <div className="flex items-center space-x-2">
                            <input type="date" value={customDate.start} onChange={(e) => setCustomDate({...customDate, start: e.target.value})} className="bg-slate-100 border border-gray-200 text-gray-700 text-sm rounded-lg p-2" />
                            <span className="text-gray-500">-</span>
                            <input type="date" value={customDate.end} onChange={(e) => setCustomDate({...customDate, end: e.target.value})} className="bg-slate-100 border border-gray-200 text-gray-700 text-sm rounded-lg p-2" />
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={exportToCSV} className="flex items-center space-x-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors border border-emerald-200">
                      <FileSpreadsheet size={16} /> <span>Excel/CSV</span>
                    </button>
                    <button onClick={exportToPDF} className="flex items-center space-x-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-semibold text-sm transition-colors border border-blue-200">
                      <FileText size={16} /> <span>PDF Print</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-6 md:p-8">
                  <h3 className="print-only text-xl font-bold mb-6 text-center border-b pb-2">DATA STATISTIK {activeTab === 'analisis' ? 'JAM SIBUK' : activeTab.toUpperCase()}</h3>
                  
                  {activeTab === 'analisis' && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center space-x-4">
                      <div className="bg-emerald-500 p-3 rounded-xl text-white shadow-sm">
                        <Clock size={24} />
                      </div>
                      <div>
                        <p className="text-emerald-800 font-semibold text-sm">Waktu Tersibuk (Jam Puncak Kunjungan)</p>
                        <p className="text-2xl font-bold text-[#044A42]">
                          {jamPuncakInfo.jam !== '-' ? `${jamPuncakInfo.jam} - ${String(parseInt(jamPuncakInfo.jam) + 1).padStart(2, '0')}:00` : 'Belum Ada Data'} 
                          <span className="text-lg font-medium text-emerald-600 ml-2">({jamPuncakInfo.total} Pengunjung)</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* GRAFIK GARIS (LINE CHART) ESTETIK */}
                  <div className="h-[380px] w-full mb-12 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 500 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 500 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 600 }} cursor={{stroke: '#e5e7eb', strokeWidth: 2}} />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '14px' }}/>
                        
                        <Line type="monotone" dataKey="pengunjung" name="Pengunjung" stroke="#0B666A" strokeWidth={4} activeDot={{ r: 8, strokeWidth: 0 }} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                        <Line type="monotone" dataKey="pembaca" name="Pembaca Buku" stroke="#3b82f6" strokeWidth={4} activeDot={{ r: 8, strokeWidth: 0 }} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                        <Line type="monotone" dataKey="peminjam" name="Peminjam Buku" stroke="#f59e0b" strokeWidth={4} activeDot={{ r: 8, strokeWidth: 0 }} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto print:mt-10">
                    <table className="w-full text-left border-collapse border print:border-black rounded-xl overflow-hidden">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-200 print:bg-gray-200 print:border-black">
                          <th className="py-4 px-6 text-sm font-bold text-gray-700 uppercase print:border-black print:border">
                            {activeTab === 'harian' || activeTab === 'analisis' ? 'Jam Kunjungan' : activeTab === 'pekanan' ? 'Hari (Tanggal)' : 'Periode'}
                          </th>
                          <th className="py-4 px-6 text-sm font-bold text-[#0B666A] uppercase print:border-black print:border">Pengunjung</th>
                          <th className="py-4 px-6 text-sm font-bold text-blue-600 uppercase print:border-black print:border">Pembaca</th>
                          <th className="py-4 px-6 text-sm font-bold text-amber-500 uppercase print:border-black print:border">Peminjam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.map((row, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-slate-50/50 transition-colors print:border-black">
                            <td className="py-4 px-6 font-bold text-gray-700 print:border-black print:border">
                              {row.name} {row.tanggal ? <span className="font-normal text-gray-500 text-sm block md:inline md:ml-2">({row.tanggal})</span> : ''}
                            </td>
                            <td className="py-4 px-6 font-semibold text-gray-600 print:border-black print:border">
                              {row.pengunjung.toLocaleString()}
                            </td>
                            <td className="py-4 px-6 font-medium text-gray-600 print:border-black print:border">{row.pembaca.toLocaleString()}</td>
                            <td className="py-4 px-6 font-medium text-gray-600 print:border-black print:border">{row.peminjam.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* BAGIAN TANDA TANGAN */}
                  <table className="print-only mt-16 w-full text-center" style={{ tableLayout: 'fixed' }}>
                    <tbody>
                      <tr>
                        <td style={{ verticalAlign: 'top', width: '50%' }}>
                          <p className="mb-24 text-base">Mengetahui,<br/>Kepala Sekolah</p>
                          <p className="font-bold underline text-lg">{settings.namaKepsek}</p>
                          <p className="text-sm">NIP. {settings.nipKepsek}</p>
                        </td>
                        <td style={{ verticalAlign: 'top', width: '50%' }}>
                          <p className="mb-24 text-base">{settings.namaKota || 'Nama Kota'}, {formatTanggal(new Date())}<br/>Pustakawan</p>
                          <p className="font-bold underline text-lg">{settings.namaPustakawan}</p>
                          <p className="text-sm">NIP. {settings.nipPustakawan}</p>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                </div>
              </div>
            </>
          )}
        </div>
      </main>
      
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden backdrop-blur-sm no-print" onClick={() => setIsSidebarOpen(false)} />
      )}
    </div>
  );
}