import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 🔧 ЦЕ ТРЕБА ЗАМІНИТИ НА СВОЇ ДАНІ З FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "ТВІЙ_API_KEY",
  authDomain: "ТВІЙ_PROJECT.firebaseapp.com",
  databaseURL: "https://ТВІЙ_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ТВІЙ_PROJECT",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ADMIN_PASSWORD = "molytva2024";

function generateSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 20) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

function getTodayKey() {
  const d = new Date();
  return `schedule_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function formatDateUkr() {
  const d = new Date();
  const days = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
  const months = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]})`;
}

export default function App() {
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("today");
  const [notification, setNotification] = useState(null);

  const todayKey = getTodayKey();

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Слухаємо зміни в Firebase в реальному часі
  useEffect(() => {
    const dbRef = ref(db, todayKey);
    const unsub = onValue(dbRef, (snapshot) => {
      setSchedule(snapshot.val() || {});
      setLoading(false);
    });
    return () => unsub();
  }, [todayKey]);

  const handleBook = async () => {
    const slot = selectedSlot;
    setSelectedSlot(null);
    try {
      await set(ref(db, `${todayKey}/${slot}`), true);
      notify(`✅ Записано на ${slot}`);
    } catch {
      notify("Помилка. Спробуйте ще раз", "error");
    }
  };

  const handleCancel = async () => {
    const slot = selectedSlot;
    setSelectedSlot(null);
    try {
      await remove(ref(db, `${todayKey}/${slot}`));
      notify(`Час ${slot} звільнено`);
    } catch {
      notify("Помилка. Спробуйте ще раз", "error");
    }
  };

  const handleAdminLogin = () => {
    if (adminInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowAdmin(false);
      setAdminInput("");
      notify("👑 Адмін-режим увімкнено");
    } else {
      notify("Невірний пароль", "error");
    }
  };

  const generateViberText = () => {
    let text = `🙏 МОЛИТОВНА СТОРОЖА\n📅 ${formatDateUkr()}\n\n`;
    ALL_SLOTS.forEach(slot => {
      text += `${slot}  ${schedule[slot] ? "✅" : "—"}\n`;
    });
    text += "\n✨ Слава Ісусу Христу!";
    return text;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateViberText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const filledCount = Object.keys(schedule).length;
  const displaySlots = view === "today"
    ? ALL_SLOTS.filter(s => parseInt(s.split(":")[0]) >= new Date().getHours() - 1)
    : ALL_SLOTS;

  if (loading) {
    return (
      <div style={S.loadingWrap}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✝</div>
        <p style={{ color: "#7c6fa0", fontSize: 18 }}>Завантаження...</p>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {notification && (
        <div style={{ ...S.notif, background: notification.type === "error" ? "#e74c3c" : "#2ecc71" }}>
          {notification.msg}
        </div>
      )}

      <header style={S.header}>
        <div style={S.headerTop}>
          <span style={{ fontSize: 28 }}>✝</span>
          <div style={{ flex: 1 }}>
            <h1 style={S.title}>Молитовна Сторожа</h1>
            <p style={S.subtitle}>{formatDateUkr()}</p>
          </div>
          <button
            style={{ ...S.adminBtn, background: isAdmin ? "#f39c12" : "rgba(255,255,255,0.18)" }}
            onClick={() => isAdmin ? setIsAdmin(false) : setShowAdmin(true)}
          >{isAdmin ? "👑" : "🔒"}</button>
        </div>
        <div style={S.stats}>
          {[
            { n: filledCount, l: "Зайнято" },
            { n: ALL_SLOTS.length - filledCount, l: "Вільно" },
            { n: ALL_SLOTS.length, l: "Всього" },
          ].map(({ n, l }) => (
            <div key={l} style={S.statBox}>
              <span style={S.statNum}>{n}</span>
              <span style={S.statLabel}>{l}</span>
            </div>
          ))}
        </div>
      </header>

      <div style={S.toggleRow}>
        {["today", "all"].map(v => (
          <button key={v} style={{ ...S.toggleBtn, ...(view === v ? S.toggleActive : {}) }} onClick={() => setView(v)}>
            {v === "today" ? "З поточного часу" : "Весь день"}
          </button>
        ))}
      </div>

      <div style={S.grid}>
        {displaySlots.map(slot => {
          const occupied = !!schedule[slot];
          return (
            <div key={slot} style={occupied ? S.slotOccupied : S.slotFree} onClick={() => { setSelectedSlot(slot); setSelectedAction(occupied ? "cancel" : "book"); }}>
              <span style={{ ...S.slotTime, color: occupied ? "#fff" : "#5b4a8a" }}>{slot}</span>
              <span style={S.slotIcon}>{occupied ? "✅" : <span style={{ color: "#c0b8d8", fontSize: 20, fontWeight: 700 }}>—</span>}</span>
            </div>
          );
        })}
      </div>

      <div style={S.copySection}>
        <button style={S.copyBtn} onClick={handleCopy}>
          {copied ? "✅ Скопійовано!" : "📋 Скопіювати для Viber"}
        </button>
        <p style={S.copyHint}>Готовий текст розкладу для вставки у Viber</p>
      </div>

      {selectedSlot && (
        <div style={S.overlay} onClick={() => setSelectedSlot(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>{selectedAction === "book" ? "🙏" : "❓"}</div>
            <h3 style={S.modalTitle}>{selectedAction === "book" ? "Записатись на молитву?" : "Скасувати запис?"}</h3>
            <p style={{ fontSize: 40, fontWeight: 900, color: "#5b4a8a", margin: "0 0 8px", fontVariantNumeric: "tabular-nums" }}>{selectedSlot}</p>
            <p style={{ fontSize: 14, color: "#999", margin: "0 0 22px" }}>
              {selectedAction === "book" ? "Ви берете цей час молитви на себе" : "Цей час знову стане вільним"}
            </p>
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setSelectedSlot(null)}>Ні</button>
              <button
                style={selectedAction === "book" ? S.btnGreen : S.btnRed}
                onClick={selectedAction === "book" ? handleBook : handleCancel}
              >{selectedAction === "book" ? "Так, записатись" : "Так, скасувати"}</button>
            </div>
          </div>
        </div>
      )}

      {showAdmin && (
        <div style={S.overlay} onClick={() => setShowAdmin(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>🔒</div>
            <h3 style={S.modalTitle}>Адмін-доступ</h3>
            <input style={S.input} type="password" placeholder="Пароль" value={adminInput}
              onChange={e => setAdminInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdminLogin()} autoFocus />
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setShowAdmin(false)}>Скасувати</button>
              <button style={S.btnPurple} onClick={handleAdminLogin}>Увійти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page: { minHeight: "100vh", background: "#eeeaf6", fontFamily: "'Segoe UI', system-ui, sans-serif", paddingBottom: 110 },
  loadingWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#eeeaf6" },
  notif: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 28px", borderRadius: 24, zIndex: 1000, fontWeight: 700, fontSize: 15, boxShadow: "0 4px 24px rgba(0,0,0,0.18)", whiteSpace: "nowrap" },
  header: { background: "linear-gradient(135deg, #5b4a8a 0%, #8b6fc5 100%)", color: "#fff", padding: "22px 16px 18px", borderRadius: "0 0 28px 28px", marginBottom: 14, boxShadow: "0 6px 24px rgba(91,74,138,0.25)" },
  headerTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  title: { margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 },
  subtitle: { margin: "3px 0 0", fontSize: 12, opacity: 0.8 },
  adminBtn: { border: "none", borderRadius: 12, padding: "8px 13px", fontSize: 18, cursor: "pointer", color: "#fff" },
  stats: { display: "flex", gap: 8 },
  statBox: { flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "10px 4px", textAlign: "center" },
  statNum: { display: "block", fontSize: 24, fontWeight: 800 },
  statLabel: { fontSize: 11, opacity: 0.85 },
  toggleRow: { display: "flex", gap: 8, padding: "0 14px 12px" },
  toggleBtn: { flex: 1, padding: "9px", border: "2px solid #c9bfe0", borderRadius: 12, background: "#fff", color: "#7c6fa0", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  toggleActive: { background: "#7c6fa0", color: "#fff", borderColor: "#7c6fa0" },
  grid: { padding: "0 14px", display: "flex", flexDirection: "column", gap: 6 },
  slotFree: { display: "flex", alignItems: "center", padding: "11px 18px", borderRadius: 14, background: "#fff", border: "1.5px solid #ddd6f0", cursor: "pointer" },
  slotOccupied: { display: "flex", alignItems: "center", padding: "11px 18px", borderRadius: 14, background: "linear-gradient(135deg, #1db954 0%, #17a349 100%)", border: "1.5px solid #17a349", cursor: "pointer", boxShadow: "0 3px 12px rgba(29,185,84,0.30)" },
  slotTime: { fontWeight: 700, fontSize: 16, width: 54, flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  slotIcon: { fontSize: 20, marginLeft: 10 },
  copySection: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "10px 16px 26px", background: "linear-gradient(to top, #eeeaf6 70%, transparent)" },
  copyBtn: { width: "100%", padding: "15px", background: "linear-gradient(135deg, #5b4a8a, #8b6fc5)", color: "#fff", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 18px rgba(91,74,138,0.35)" },
  copyHint: { textAlign: "center", fontSize: 12, color: "#9e8dc0", margin: "6px 0 0" },
  overlay: { position: "fixed", inset: 0, background: "rgba(30,20,60,0.45)", display: "flex", alignItems: "flex-end", zIndex: 500 },
  modal: { background: "#fff", borderRadius: "26px 26px 0 0", padding: "28px 20px 42px", width: "100%", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", textAlign: "center" },
  modalTitle: { margin: "0 0 4px", fontSize: 19, color: "#5b4a8a", fontWeight: 700 },
  modalBtns: { display: "flex", gap: 10 },
  btnSecondary: { flex: 1, padding: 13, border: "2px solid #ddd6f0", borderRadius: 14, background: "#fff", color: "#7c6fa0", fontWeight: 600, fontSize: 15, cursor: "pointer" },
  btnGreen: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #1db954, #17a349)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnRed: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #e74c3c, #c0392b)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnPurple: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #5b4a8a, #8b6fc5)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  input: { width: "100%", padding: "13px 16px", border: "2px solid #ddd6f0", borderRadius: 14, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", color: "#333", textAlign: "center" },
};
