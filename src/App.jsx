import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 🔧 ЗАЛИШ СВОЇ ДАНІ FIREBASE
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
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += 20)
      slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return slots;
}
const ALL_SLOTS = generateSlots();

function getDateKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `schedule_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`;
}

function formatDateUkr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const days = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
  const months = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]})`;
}

function getShortDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const days = ["нд","пн","вт","ср","чт","пт","сб"];
  const months = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
  return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

// localStorage helpers
function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) { id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("device_id", id); }
  return id;
}
function getMyName() { return localStorage.getItem("user_name") || ""; }
function setMyName(name) { localStorage.setItem("user_name", name); }
function getMySlots(dateKey) { try { return JSON.parse(localStorage.getItem(`my_slots_${dateKey}`) || "[]"); } catch { return []; } }
function addMySlot(dateKey, slot) { const s = getMySlots(dateKey); if (!s.includes(slot)) { s.push(slot); localStorage.setItem(`my_slots_${dateKey}`, JSON.stringify(s)); } }
function removeMySlot(dateKey, slot) { localStorage.setItem(`my_slots_${dateKey}`, JSON.stringify(getMySlots(dateKey).filter(x => x !== slot))); }
function isAdminDevice() { return localStorage.getItem("is_admin") === "true"; }
function setAdminDevice() { localStorage.setItem("is_admin", "true"); }
function shouldShowTomorrow() { return new Date().getHours() >= 20; }

export default function App() {
  const [scheduleToday, setScheduleToday] = useState({});
  const [scheduleTomorrow, setScheduleTomorrow] = useState({});
  const [statsData, setStatsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [isAdmin, setIsAdmin] = useState(isAdminDevice());
  const [adminInput, setAdminInput] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("today");
  const [activeTab, setActiveTab] = useState(0);
  const [notification, setNotification] = useState(null);
  const [myName, setMyNameState] = useState(getMyName());
  const [showNameModal, setShowNameModal] = useState(!getMyName());
  const [nameInput, setNameInput] = useState("");
  const [, forceUpdate] = useState(0);

  const todayKey = getDateKey(0);
  const tomorrowKey = getDateKey(1);
  const deviceId = getDeviceId();

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    let loaded = 0;
    const done = () => { if (++loaded >= 2) setLoading(false); };
    const u1 = onValue(ref(db, todayKey), snap => { setScheduleToday(snap.val() || {}); done(); });
    const u2 = onValue(ref(db, tomorrowKey), snap => { setScheduleTomorrow(snap.val() || {}); done(); });
    // Слухаємо статистику
    const u3 = onValue(ref(db, "stats"), snap => { setStatsData(snap.val() || {}); });
    return () => { u1(); u2(); u3(); };
  }, [todayKey, tomorrowKey]);

  const handleSaveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setMyName(n);
    setMyNameState(n);
    setShowNameModal(false);
    notify(`👋 Вітаємо, ${n}!`);
  };

  const currentKey = activeTab === 0 ? todayKey : tomorrowKey;
  const currentSchedule = activeTab === 0 ? scheduleToday : scheduleTomorrow;

  const handleSlotClick = (slot, isNextDay) => {
    const dayOffset = isNextDay ? 1 : 0;
    const key = dayOffset === 0 ? todayKey : tomorrowKey;
    const sched = dayOffset === 0 ? scheduleToday : scheduleTomorrow;
    const occupied = !!sched[slot];
    const mine = getMySlots(key).includes(slot);

    if (occupied && !mine && !isAdmin) {
      notify("⛔ Скасувати може тільки та людина, яка записалась", "error");
      return;
    }
    setSelectedSlot(slot);
    setSelectedDayOffset(dayOffset);
    setSelectedAction(occupied ? "cancel" : "book");
  };

  const handleBook = async () => {
    const slot = selectedSlot;
    const key = selectedDayOffset === 0 ? todayKey : tomorrowKey;
    const name = myName || "Невідомо";
    setSelectedSlot(null);
    try {
      await set(ref(db, `${key}/${slot}`), { bookedBy: deviceId, name });
      addMySlot(key, slot);
      // Зберігаємо статистику
      const dateLabel = getDateKey(selectedDayOffset);
      await set(ref(db, `stats/${dateLabel}/${slot}`), { name, deviceId, time: slot });
      forceUpdate(n => n + 1);
      notify(`✅ Записано на ${slot}`);
    } catch {
      notify("Помилка. Спробуйте ще раз", "error");
    }
  };

  const handleCancel = async () => {
    const slot = selectedSlot;
    const key = selectedDayOffset === 0 ? todayKey : tomorrowKey;
    setSelectedSlot(null);
    try {
      await remove(ref(db, `${key}/${slot}`));
      await remove(ref(db, `stats/${getDateKey(selectedDayOffset)}/${slot}`));
      removeMySlot(key, slot);
      forceUpdate(n => n + 1);
      notify(`Час ${slot} звільнено`);
    } catch {
      notify("Помилка. Спробуйте ще раз", "error");
    }
  };

  const handleAdminLogin = () => {
    if (adminInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setAdminDevice();
      setShowAdmin(false);
      setAdminInput("");
      notify("👑 Адмін-режим увімкнено назавжди на цьому пристрої");
    } else {
      notify("Невірний пароль", "error");
    }
  };

  const generateViberText = () => {
    const sched = activeTab === 0 ? scheduleToday : scheduleTomorrow;
    let text = `🙏 МОЛИТОВНА СТОРОЖА\n📅 ${formatDateUkr(activeTab)}\n\n`;
    ALL_SLOTS.forEach(slot => { text += `${slot}  ${sched[slot] ? "✅" : "—"}\n`; });
    text += "\n✨ Слава Ісусу Христу!";
    return text;
  };

  // Статистика
  const buildStats = () => {
    const days = Object.keys(statsData).sort();
    if (!days.length) return null;

    // По днях
    const byDay = days.map(dayKey => {
      const slots = statsData[dayKey] || {};
      const entries = Object.values(slots);
      const parts = dayKey.replace("schedule_","").split("_");
      const label = `${parts[2]}.${String(parts[1]).padStart(2,"0")}.${parts[0]}`;
      return { label, count: entries.length, entries };
    });

    // По учасниках
    const byPerson = {};
    days.forEach(dayKey => {
      const slots = statsData[dayKey] || {};
      Object.values(slots).forEach(e => {
        const n = e.name || "Невідомо";
        if (!byPerson[n]) byPerson[n] = 0;
        byPerson[n]++;
      });
    });
    const personList = Object.entries(byPerson).sort((a,b) => b[1]-a[1]);

    // По тижнях
    const byWeek = {};
    days.forEach(dayKey => {
      const slots = statsData[dayKey] || {};
      const parts = dayKey.replace("schedule_","").split("_");
      const d = new Date(parts[0], parts[1]-1, parts[2]);
      const weekNum = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
      const wKey = `${parts[0]}-${String(d.getMonth()+1).padStart(2,"0")} тиж.${weekNum}`;
      if (!byWeek[wKey]) byWeek[wKey] = 0;
      byWeek[wKey] += Object.values(slots).length;
    });

    // По місяцях
    const byMonth = {};
    days.forEach(dayKey => {
      const slots = statsData[dayKey] || {};
      const parts = dayKey.replace("schedule_","").split("_");
      const months = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
      const mKey = `${months[parseInt(parts[1])-1]} ${parts[0]}`;
      if (!byMonth[mKey]) byMonth[mKey] = 0;
      byMonth[mKey] += Object.values(slots).length;
    });

    return { byDay, personList, byWeek: Object.entries(byWeek), byMonth: Object.entries(byMonth) };
  };

  const stats = buildStats();

  const buildDisplayItems = () => {
    const nowHour = new Date().getHours();
    let todaySlots = view === "today"
      ? ALL_SLOTS.filter(s => parseInt(s.split(":")[0]) >= nowHour - 1)
      : ALL_SLOTS;
    const result = todaySlots.map(s => ({ slot: s, isNextDay: false }));
    if (shouldShowTomorrow()) {
      result.push({ slot: null, isDivider: true });
      ALL_SLOTS.forEach(s => result.push({ slot: s, isNextDay: true }));
    }
    return result;
  };

  if (loading) return (
    <div style={S.loadingWrap}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✝</div>
      <p style={{ color: "#7c6fa0", fontSize: 18 }}>Завантаження...</p>
    </div>
  );

  return (
    <div style={S.page}>
      {notification && (
        <div style={{ ...S.notif, background: notification.type === "error" ? "#e74c3c" : "#2ecc71" }}>
          {notification.msg}
        </div>
      )}

      {/* Хедер */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <span style={{ fontSize: 28 }}>✝</span>
          <div style={{ flex: 1 }}>
            <h1 style={S.title}>Молитовна Сторожа</h1>
            <p style={S.subtitle}>{formatDateUkr(0)}</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {isAdmin && (
              <button style={{ ...S.adminBtn, background: "#f39c12" }} onClick={() => setShowStats(true)}>
                📊
              </button>
            )}
            <button
              style={{ ...S.adminBtn, background: isAdmin ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)" }}
              onClick={() => isAdmin ? (setIsAdmin(false), localStorage.removeItem("is_admin")) : setShowAdmin(true)}
            >{isAdmin ? "👑" : "🔒"}</button>
          </div>
        </div>
        {myName && (
          <div style={S.myNameBadge}>
            👤 {myName}
            <button style={S.changeName} onClick={() => { setNameInput(myName); setShowNameModal(true); }}>змінити</button>
          </div>
        )}
        <div style={S.stats}>
          {[
            { n: Object.keys(scheduleToday).length, l: "Зайнято" },
            { n: ALL_SLOTS.length - Object.keys(scheduleToday).length, l: "Вільно" },
            { n: ALL_SLOTS.length, l: "Всього" },
          ].map(({ n, l }) => (
            <div key={l} style={S.statBox}>
              <span style={S.statNum}>{n}</span>
              <span style={S.statLabel}>{l}</span>
            </div>
          ))}
        </div>
      </header>

      {activeTab === 0 && (
        <div style={S.toggleRow}>
          {["today","all"].map(v => (
            <button key={v} style={{ ...S.toggleBtn, ...(view === v ? S.toggleActive : {}) }} onClick={() => setView(v)}>
              {v === "today" ? "З поточного часу" : "Весь день"}
            </button>
          ))}
        </div>
      )}

      <div style={S.grid}>
        {buildDisplayItems().map((item, idx) => {
          if (item.isDivider) return (
            <div key="divider" style={S.divider}>
              <div style={S.dividerLine} />
              <span style={S.dividerText}>🌙 {getShortDate(1)} — наступний день</span>
              <div style={S.dividerLine} />
            </div>
          );

          const { slot, isNextDay } = item;
          const sched = isNextDay ? scheduleTomorrow : scheduleToday;
          const slotKey = isNextDay ? tomorrowKey : todayKey;
          const occupied = !!sched[slot];
          const isMine = getMySlots(slotKey).includes(slot);
          const slotName = occupied && sched[slot]?.name ? sched[slot].name : null;

          return (
            <div key={`${isNextDay?"t":"d"}-${slot}`}
              style={{ ...(occupied ? S.slotOccupied : S.slotFree), opacity: isNextDay ? 0.9 : 1 }}
              onClick={() => handleSlotClick(slot, isNextDay)}
            >
              <span style={{ ...S.slotTime, color: occupied ? "#fff" : "#5b4a8a" }}>{slot}</span>
              <span style={S.slotIcon}>
                {occupied
                  ? <span>{isMine ? "✅ 👤" : "✅"}{isAdmin && slotName ? <span style={S.adminName}> {slotName}</span> : null}</span>
                  : <span style={{ color: "#c0b8d8", fontSize: 20, fontWeight: 700 }}>—</span>
                }
              </span>
            </div>
          );
        })}
      </div>

      <div style={S.copySection}>
        <button style={S.copyBtn} onClick={() => navigator.clipboard.writeText(generateViberText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })}>
          {copied ? "✅ Скопійовано!" : "📋 Скопіювати для Viber"}
        </button>
        <p style={S.copyHint}>Готовий текст розкладу для вставки у Viber</p>
      </div>

      {/* Модал вводу імені */}
      {showNameModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>🙏</div>
            <h3 style={S.modalTitle}>Вітаємо!</h3>
            <p style={{ fontSize: 14, color: "#888", margin: "0 0 16px" }}>
              Введіть своє прізвище та ім'я.<br/>Це потрібно один раз.
            </p>
            <input style={S.input} placeholder="Наприклад: Грицак Надія"
              value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveName()} autoFocus />
            <button style={{ ...S.btnGreen, width: "100%" }} onClick={handleSaveName}>
              Зберегти
            </button>
          </div>
        </div>
      )}

      {/* Модал запису/скасування */}
      {selectedSlot && (
        <div style={S.overlay} onClick={() => setSelectedSlot(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>{selectedAction === "book" ? "🙏" : "❓"}</div>
            <h3 style={S.modalTitle}>{selectedAction === "book" ? "Записатись на молитву?" : "Скасувати запис?"}</h3>
            <p style={{ fontSize: 40, fontWeight: 900, color: "#5b4a8a", margin: "0 0 4px", fontVariantNumeric: "tabular-nums" }}>{selectedSlot}</p>
            <p style={{ fontSize: 13, color: "#888", margin: "0 0 6px" }}>
              {selectedDayOffset === 0 ? `📅 Сьогодні — ${formatDateUkr(0)}` : `🌙 Завтра — ${formatDateUkr(1)}`}
            </p>
            {myName && <p style={{ fontSize: 14, color: "#5b4a8a", fontWeight: 600, margin: "0 0 18px" }}>👤 {myName}</p>}
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setSelectedSlot(null)}>Ні</button>
              <button style={selectedAction === "book" ? S.btnGreen : S.btnRed}
                onClick={selectedAction === "book" ? handleBook : handleCancel}>
                {selectedAction === "book" ? "Так, записатись" : "Так, скасувати"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал адміна */}
      {showAdmin && (
        <div style={S.overlay} onClick={() => setShowAdmin(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>🔒</div>
            <h3 style={S.modalTitle}>Адмін-доступ</h3>
            <p style={{ fontSize: 13, color: "#aaa", margin: "0 0 14px" }}>Пристрій буде запам'ятовано назавжди</p>
            <input style={S.input} type="password" placeholder="Пароль" value={adminInput}
              onChange={e => setAdminInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdminLogin()} autoFocus />
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setShowAdmin(false)}>Скасувати</button>
              <button style={S.btnPurple} onClick={handleAdminLogin}>Увійти</button>
            </div>
          </div>
        </div>
      )}

      {/* Статистика */}
      {showStats && isAdmin && (
        <div style={{ ...S.overlay, alignItems: "flex-start", overflowY: "auto" }} onClick={() => setShowStats(false)}>
          <div style={{ ...S.modal, borderRadius: 24, margin: 16, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ ...S.modalTitle, margin: 0 }}>📊 Статистика</h3>
              <button style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#888" }} onClick={() => setShowStats(false)}>✕</button>
            </div>

            {!stats ? (
              <p style={{ color: "#aaa", textAlign: "center" }}>Даних ще немає</p>
            ) : (
              <>
                {/* По місяцях */}
                <div style={S.statSection}>
                  <h4 style={S.statSectionTitle}>📅 По місяцях</h4>
                  {stats.byMonth.map(([m, c]) => (
                    <div key={m} style={S.statRow}>
                      <span style={S.statRowLabel}>{m}</span>
                      <span style={S.statRowBar}>
                        <span style={{ ...S.statRowFill, width: `${Math.min(100, c * 2)}%` }} />
                      </span>
                      <span style={S.statRowCount}>{c} год.</span>
                    </div>
                  ))}
                </div>

                {/* По тижнях */}
                <div style={S.statSection}>
                  <h4 style={S.statSectionTitle}>📆 По тижнях</h4>
                  {stats.byWeek.map(([w, c]) => (
                    <div key={w} style={S.statRow}>
                      <span style={S.statRowLabel}>{w}</span>
                      <span style={S.statRowBar}>
                        <span style={{ ...S.statRowFill, width: `${Math.min(100, c * 3)}%` }} />
                      </span>
                      <span style={S.statRowCount}>{c} год.</span>
                    </div>
                  ))}
                </div>

                {/* По днях */}
                <div style={S.statSection}>
                  <h4 style={S.statSectionTitle}>🗓 По днях</h4>
                  {stats.byDay.slice(-14).reverse().map(({ label, count }) => (
                    <div key={label} style={S.statRow}>
                      <span style={S.statRowLabel}>{label}</span>
                      <span style={S.statRowBar}>
                        <span style={{ ...S.statRowFill, width: `${Math.min(100, count * 1.4)}%` }} />
                      </span>
                      <span style={S.statRowCount}>{count} год.</span>
                    </div>
                  ))}
                </div>

                {/* По учасниках */}
                <div style={S.statSection}>
                  <h4 style={S.statSectionTitle}>👥 По учасниках</h4>
                  {stats.personList.map(([name, count]) => (
                    <div key={name} style={S.statRow}>
                      <span style={{ ...S.statRowLabel, fontWeight: 600 }}>{name}</span>
                      <span style={S.statRowBar}>
                        <span style={{ ...S.statRowFill, background: "linear-gradient(90deg,#5b4a8a,#8b6fc5)", width: `${Math.min(100, count * 5)}%` }} />
                      </span>
                      <span style={S.statRowCount}>{count} год.</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
  headerTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  title: { margin: 0, fontSize: 20, fontWeight: 800 },
  subtitle: { margin: "3px 0 0", fontSize: 12, opacity: 0.8 },
  adminBtn: { border: "none", borderRadius: 12, padding: "8px 13px", fontSize: 18, cursor: "pointer", color: "#fff" },
  myNameBadge: { background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "5px 12px", fontSize: 13, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 8 },
  changeName: { background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0 },
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
  slotIcon: { fontSize: 18, marginLeft: 10, display: "flex", alignItems: "center", gap: 4 },
  adminName: { fontSize: 13, color: "#fff", fontWeight: 600, marginLeft: 4, opacity: 0.95 },
  divider: { display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" },
  dividerLine: { flex: 1, height: 1, background: "#c9bfe0" },
  dividerText: { fontSize: 12, color: "#7c6fa0", fontWeight: 600, whiteSpace: "nowrap" },
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
  statSection: { marginBottom: 24, textAlign: "left" },
  statSectionTitle: { margin: "0 0 10px", fontSize: 15, color: "#5b4a8a", fontWeight: 700 },
  statRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
  statRowLabel: { fontSize: 13, color: "#444", width: 90, flexShrink: 0 },
  statRowBar: { flex: 1, background: "#f0eef8", borderRadius: 6, height: 16, overflow: "hidden" },
  statRowFill: { display: "block", height: "100%", background: "linear-gradient(90deg,#1db954,#17a349)", borderRadius: 6, transition: "width 0.4s" },
  statRowCount: { fontSize: 13, color: "#7c6fa0", fontWeight: 700, width: 50, textAlign: "right", flexShrink: 0 },
};
