import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const firebaseConfig = {
  apiKey: "ТВІЙ_API_KEY",
  authDomain: "ТВІЙ_PROJECT.firebaseapp.com",
  databaseURL: "https://ТВІЙ_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ТВІЙ_PROJECT",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ADMIN_PASSWORD = "molytva2024";
const COLORS = ["#5b4a8a","#1db954","#f39c12","#e74c3c","#3498db","#9b59b6","#1abc9c","#e67e22"];

function generateSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += 20)
      slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return slots;
}
const ALL_SLOTS = generateSlots();

function getDateKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `schedule_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`;
}
function formatDateUkr(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const days = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
  const months = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]})`;
}
function getShortDate(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  const days = ["нд","пн","вт","ср","чт","пт","сб"];
  const months = ["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"];
  return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

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
  const [view, setView] = useState("today");
  const [notification, setNotification] = useState(null);
  const [myName, setMyNameState] = useState(getMyName());
  const [showNameModal, setShowNameModal] = useState(!getMyName());
  const [nameInput, setNameInput] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAdminLogoutConfirm, setShowAdminLogoutConfirm] = useState(false);
  const [, forceUpdate] = useState(0);

  const todayKey = getDateKey(0);
  const tomorrowKey = getDateKey(1);
  const deviceId = getDeviceId();

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  useEffect(() => {
    let loaded = 0;
    const done = () => { if (++loaded >= 2) setLoading(false); };
    const u1 = onValue(ref(db, todayKey), snap => { setScheduleToday(snap.val() || {}); done(); });
    const u2 = onValue(ref(db, tomorrowKey), snap => { setScheduleTomorrow(snap.val() || {}); done(); });
    const u3 = onValue(ref(db, "stats"), snap => { setStatsData(snap.val() || {}); });
    return () => { u1(); u2(); u3(); };
  }, [todayKey, tomorrowKey]);

  const handleSaveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setMyName(n); setMyNameState(n); setShowNameModal(false);
    notify(`👋 Вітаємо, ${n}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem("user_name");
    localStorage.removeItem("device_id");
    localStorage.removeItem("is_admin");
    ALL_SLOTS.forEach(s => { localStorage.removeItem(`my_slots_${getDateKey(0)}`); localStorage.removeItem(`my_slots_${getDateKey(1)}`); });
    setMyNameState(""); setIsAdmin(false); setShowLogoutConfirm(false); setShowNameModal(true); setNameInput("");
    notify("Ви вийшли з акаунту");
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("is_admin");
    setIsAdmin(false); setShowAdminLogoutConfirm(false);
    notify("Вийшли з режиму адміна");
  };

  const handleSlotClick = (slot, isNextDay) => {
    const dayOffset = isNextDay ? 1 : 0;
    const key = dayOffset === 0 ? todayKey : tomorrowKey;
    const sched = dayOffset === 0 ? scheduleToday : scheduleTomorrow;
    const occupied = !!sched[slot];
    const mine = getMySlots(key).includes(slot);
    if (occupied && !mine && !isAdmin) { notify("⛔ Скасувати може тільки та людина, яка записалась", "error"); return; }
    setSelectedSlot(slot); setSelectedDayOffset(dayOffset); setSelectedAction(occupied ? "cancel" : "book");
  };

  const handleBook = async () => {
    const slot = selectedSlot;
    const key = selectedDayOffset === 0 ? todayKey : tomorrowKey;
    const name = myName || "Невідомо";
    setSelectedSlot(null);
    try {
      await set(ref(db, `${key}/${slot}`), { bookedBy: deviceId, name });
      addMySlot(key, slot);
      await set(ref(db, `stats/${getDateKey(selectedDayOffset)}/${slot}`), { name, deviceId, time: slot });
      forceUpdate(n => n + 1);
      notify(`✅ Записано на ${slot}`);
    } catch { notify("Помилка. Спробуйте ще раз", "error"); }
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
    } catch { notify("Помилка. Спробуйте ще раз", "error"); }
  };

  const handleAdminLogin = () => {
    if (adminInput === ADMIN_PASSWORD) {
      setIsAdmin(true); setAdminDevice(); setShowAdmin(false); setAdminInput("");
      notify("👑 Адмін-режим увімкнено назавжди");
    } else { notify("Невірний пароль", "error"); }
  };

  // Побудова статистики
  const buildStats = () => {
    const days = Object.keys(statsData).sort();
    if (!days.length) return null;

    const byDay = days.map(dayKey => {
      const entries = Object.values(statsData[dayKey] || {});
      const parts = dayKey.replace("schedule_","").split("_");
      return { label: `${parts[2]}.${String(parts[1]).padStart(2,"0")}`, count: entries.length, full: `${parts[2]}.${parts[1]}.${parts[0]}` };
    });

    const byPerson = {};
    days.forEach(dayKey => {
      Object.values(statsData[dayKey] || {}).forEach(e => {
        const n = e.name || "Невідомо";
        byPerson[n] = (byPerson[n] || 0) + 1;
      });
    });
    const personData = Object.entries(byPerson).sort((a,b) => b[1]-a[1]).map(([name,value]) => ({ name, value }));

    const byWeek = {};
    days.forEach(dayKey => {
      const parts = dayKey.replace("schedule_","").split("_");
      const d = new Date(parts[0], parts[1]-1, parts[2]);
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay() + 1);
      const wKey = `${weekStart.getDate()}.${String(weekStart.getMonth()+1).padStart(2,"0")}`;
      byWeek[wKey] = (byWeek[wKey] || 0) + Object.values(statsData[dayKey] || {}).length;
    });
    const weekData = Object.entries(byWeek).map(([label, count]) => ({ label, count }));

    const byMonth = {};
    const monthNames = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
    days.forEach(dayKey => {
      const parts = dayKey.replace("schedule_","").split("_");
      const mKey = `${monthNames[parseInt(parts[1])-1]} ${parts[0]}`;
      byMonth[mKey] = (byMonth[mKey] || 0) + Object.values(statsData[dayKey] || {}).length;
    });
    const monthData = Object.entries(byMonth).map(([label, count]) => ({ label, count }));

    const total = Object.values(byPerson).reduce((a,b) => a+b, 0);
    const uniquePersons = personData.length;
    const avgPerDay = byDay.length ? (total / byDay.length).toFixed(1) : 0;
    const bestDay = byDay.reduce((a,b) => b.count > a.count ? b : a, byDay[0]);

    return { byDay: byDay.slice(-14), personData, weekData, monthData, total, uniquePersons, avgPerDay, bestDay };
  };

  const stats = buildStats();

  const buildDisplayItems = () => {
    const nowHour = new Date().getHours();
    const todaySlots = view === "today" ? ALL_SLOTS.filter(s => parseInt(s.split(":")[0]) >= nowHour - 1) : ALL_SLOTS;
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
              <button style={{ ...S.iconBtn, background: "#f39c12" }} onClick={() => setShowStats(true)}>📊</button>
            )}
            {isAdmin
              ? <button style={{ ...S.iconBtn, background: "rgba(255,255,255,0.25)" }} onClick={() => setShowAdminLogoutConfirm(true)}>👑</button>
              : <button style={{ ...S.iconBtn, background: "rgba(255,255,255,0.18)" }} onClick={() => setShowAdmin(true)}>🔒</button>
            }
          </div>
        </div>

        {myName && (
          <div style={S.myNameRow}>
            <span style={S.myNameBadge}>👤 {myName}</span>
            <button style={S.outlineBtn} onClick={() => { setNameInput(myName); setShowNameModal(true); }}>змінити</button>
            <button style={{ ...S.outlineBtn, color: "#ffb3b3" }} onClick={() => setShowLogoutConfirm(true)}>вийти</button>
          </div>
        )}

        <div style={S.stats}>
          {[{ n: Object.keys(scheduleToday).length, l: "Зайнято" },
            { n: ALL_SLOTS.length - Object.keys(scheduleToday).length, l: "Вільно" },
            { n: ALL_SLOTS.length, l: "Всього" }].map(({ n, l }) => (
            <div key={l} style={S.statBox}>
              <span style={S.statNum}>{n}</span>
              <span style={S.statLabel}>{l}</span>
            </div>
          ))}
        </div>
      </header>

      <div style={S.toggleRow}>
        {["today","all"].map(v => (
          <button key={v} style={{ ...S.toggleBtn, ...(view === v ? S.toggleActive : {}) }} onClick={() => setView(v)}>
            {v === "today" ? "З поточного часу" : "Весь день"}
          </button>
        ))}
      </div>

      {/* Слоти */}
      <div style={S.grid}>
        {buildDisplayItems().map((item) => {
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
              onClick={() => handleSlotClick(slot, isNextDay)}>
              <span style={{ ...S.slotTime, color: occupied ? "#fff" : "#5b4a8a" }}>{slot}</span>
              <span style={S.slotIcon}>
                {occupied
                  ? <span>{isMine ? "✅ 👤" : "✅"}{isAdmin && slotName ? <span style={S.adminName}> {slotName}</span> : null}</span>
                  : <span style={{ color: "#c0b8d8", fontSize: 20, fontWeight: 700 }}>—</span>}
              </span>
            </div>
          );
        })}
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
            <input style={S.input} placeholder="Прізвище та ім'я"
              value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveName()} autoFocus />
            <button style={{ ...S.btnGreen, width: "100%" }} onClick={handleSaveName}>Зберегти</button>
          </div>
        </div>
      )}

      {/* Підтвердження виходу з акаунту */}
      {showLogoutConfirm && (
        <div style={S.overlay} onClick={() => setShowLogoutConfirm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ ...S.modalTitle, color: "#e74c3c" }}>Вийти з акаунту?</h3>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 8px" }}>
              Ваше ім'я та всі записи на цьому пристрої будуть видалені.
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#e74c3c", margin: "0 0 22px" }}>
              Скасувати свої записи після цього буде неможливо!
            </p>
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setShowLogoutConfirm(false)}>Ні, залишитись</button>
              <button style={S.btnRed} onClick={handleLogout}>Так, вийти</button>
            </div>
          </div>
        </div>
      )}

      {/* Підтвердження виходу адміна */}
      {showAdminLogoutConfirm && (
        <div style={S.overlay} onClick={() => setShowAdminLogoutConfirm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ ...S.modalTitle, color: "#e74c3c" }}>Вийти з режиму адміна?</h3>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 22px" }}>
              Щоб увійти знову — потрібно буде ввести пароль.
            </p>
            <div style={S.modalBtns}>
              <button style={S.btnSecondary} onClick={() => setShowAdminLogoutConfirm(false)}>Ні, залишитись</button>
              <button style={S.btnRed} onClick={handleAdminLogout}>Так, вийти</button>
            </div>
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
          <div style={{ background: "#f4f2f9", borderRadius: 24, margin: 12, width: "calc(100% - 24px)", maxHeight: "94vh", overflowY: "auto", padding: "20px 16px 32px" }} onClick={e => e.stopPropagation()}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, color: "#5b4a8a", fontWeight: 800 }}>📊 Статистика</h3>
              <button style={{ border: "none", background: "none", fontSize: 24, cursor: "pointer", color: "#888" }} onClick={() => setShowStats(false)}>✕</button>
            </div>

            {!stats ? (
              <p style={{ color: "#aaa", textAlign: "center", padding: 40 }}>Даних ще немає</p>
            ) : (
              <>
                {/* Зведені картки */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                  {[
                    { icon: "🙏", label: "Всього годин", value: stats.total },
                    { icon: "👥", label: "Учасників", value: stats.uniquePersons },
                    { icon: "📈", label: "Середнє/день", value: stats.avgPerDay },
                    { icon: "🏆", label: "Найактивніший день", value: stats.bestDay?.label },
                  ].map(({ icon, label, value }) => (
                    <div key={label} style={{ background: "#fff", borderRadius: 16, padding: "14px 12px", textAlign: "center", boxShadow: "0 2px 8px rgba(91,74,138,0.1)" }}>
                      <div style={{ fontSize: 28 }}>{icon}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#5b4a8a" }}>{value}</div>
                      <div style={{ fontSize: 11, color: "#9e8dc0", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Лінійний графік — по днях */}
                <div style={S.chartCard}>
                  <h4 style={S.chartTitle}>📈 Активність по днях</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.byDay} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }} />
                      <Line type="monotone" dataKey="count" stroke="#5b4a8a" strokeWidth={3}
                        dot={{ fill: "#5b4a8a", r: 4 }} activeDot={{ r: 6, fill: "#8b6fc5" }} name="Годин" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Стовпчаста — по тижнях */}
                <div style={S.chartCard}>
                  <h4 style={S.chartTitle}>📊 По тижнях</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={stats.weekData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                      <Bar dataKey="count" name="Годин" radius={[6,6,0,0]}>
                        {stats.weekData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Стовпчаста — по місяцях */}
                <div style={S.chartCard}>
                  <h4 style={S.chartTitle}>📅 По місяцях</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={stats.monthData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#9e8dc0" }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                      <Bar dataKey="count" name="Годин" fill="#1db954" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Кругова — по учасниках */}
                <div style={S.chartCard}>
                  <h4 style={S.chartTitle}>👥 Розподіл по учасниках</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={stats.personData} cx="50%" cy="50%" outerRadius={80}
                        dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={false} fontSize={10}>
                        {stats.personData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Таблиця учасників */}
                <div style={S.chartCard}>
                  <h4 style={S.chartTitle}>🏅 Рейтинг учасників</h4>
                  {stats.personData.map(({ name, value }, i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`}
                      </span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#444" }}>{name}</span>
                      <div style={{ width: 80, background: "#f0eef8", borderRadius: 6, height: 14, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (value / stats.total) * 100 * 3)}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: 6, transition: "width 0.6s ease" }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#5b4a8a", width: 40, textAlign: "right" }}>{value} год.</span>
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
  page: { minHeight: "100vh", background: "#eeeaf6", fontFamily: "'Segoe UI', system-ui, sans-serif", paddingBottom: 20 },
  loadingWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#eeeaf6" },
  notif: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 28px", borderRadius: 24, zIndex: 1000, fontWeight: 700, fontSize: 15, boxShadow: "0 4px 24px rgba(0,0,0,0.18)", whiteSpace: "nowrap" },
  header: { background: "linear-gradient(135deg, #5b4a8a 0%, #8b6fc5 100%)", color: "#fff", padding: "22px 16px 18px", borderRadius: "0 0 28px 28px", marginBottom: 14, boxShadow: "0 6px 24px rgba(91,74,138,0.25)" },
  headerTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  title: { margin: 0, fontSize: 20, fontWeight: 800 },
  subtitle: { margin: "3px 0 0", fontSize: 12, opacity: 0.8 },
  iconBtn: { border: "none", borderRadius: 12, padding: "8px 13px", fontSize: 18, cursor: "pointer", color: "#fff" },
  myNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  myNameBadge: { fontSize: 13, background: "rgba(255,255,255,0.15)", padding: "4px 12px", borderRadius: 10 },
  outlineBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },
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
  adminName: { fontSize: 13, color: "#fff", fontWeight: 600, marginLeft: 4 },
  divider: { display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" },
  dividerLine: { flex: 1, height: 1, background: "#c9bfe0" },
  dividerText: { fontSize: 12, color: "#7c6fa0", fontWeight: 600, whiteSpace: "nowrap" },
  overlay: { position: "fixed", inset: 0, background: "rgba(30,20,60,0.5)", display: "flex", alignItems: "flex-end", zIndex: 500 },
  modal: { background: "#fff", borderRadius: "26px 26px 0 0", padding: "28px 20px 42px", width: "100%", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", textAlign: "center" },
  modalTitle: { margin: "0 0 4px", fontSize: 19, color: "#5b4a8a", fontWeight: 700 },
  modalBtns: { display: "flex", gap: 10 },
  btnSecondary: { flex: 1, padding: 13, border: "2px solid #ddd6f0", borderRadius: 14, background: "#fff", color: "#7c6fa0", fontWeight: 600, fontSize: 15, cursor: "pointer" },
  btnGreen: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #1db954, #17a349)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnRed: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #e74c3c, #c0392b)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  btnPurple: { flex: 2, padding: 13, border: "none", borderRadius: 14, background: "linear-gradient(135deg, #5b4a8a, #8b6fc5)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  input: { width: "100%", padding: "13px 16px", border: "2px solid #ddd6f0", borderRadius: 14, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", color: "#333", textAlign: "center" },
  chartCard: { background: "#fff", borderRadius: 18, padding: "16px 12px", marginBottom: 16, boxShadow: "0 2px 12px rgba(91,74,138,0.08)" },
  chartTitle: { margin: "0 0 12px", fontSize: 15, color: "#5b4a8a", fontWeight: 700 },
};
