/* ===== TELEGRAM ===== */
const tg = Telegram.WebApp;
tg.expand();
tg.ready();
tg.disableVerticalSwipes();
tg.enableClosingConfirmation();
tg.setHeaderColor("#0e0f14");
tg.setBackgroundColor("#0e0f14");

/* ===== DOM ===== */
const loading = document.getElementById("loading");
const app = document.getElementById("app");

/* ===== SUPABASE ===== */
const sb = supabase.createClient(
  "https://duqqpuitipndkghpqupb.supabase.co",
  "sb_publishable_gN3Tyqs65cBJ0Ra9P7l0hQ_eB413MYU"
);

async function verifyInitData(){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      "https://duqqpuitipndkghpqupb.supabase.co/functions/v1/verify-telegram",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
        signal: controller.signal
      }
    );

    if (!res.ok) {
      console.error("verifyInitData failed:", res.status);
      return null;
    }

    const json = await res.json();
    return json.ok ? json.tg_id : null;

  } catch (e) {
    console.error("verifyInitData error:", e);
    return null;

  } finally {
    clearTimeout(timer);
  }
}

async function pingDB(){
  const { error } = await sb
    .from("admins")
    .select("tg_id")
    .limit(1);

  return !error;
}

/* ===== HASH ===== */
async function hashPin(pin){
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");
}

/* ===== STATE ===== */
let user = null;
let ROLE = "";
let PIN_HASH = "";
let input = "";
let inputLocked = false;
let error = false;

let denied = false;

let attempts = 0;
let blockedUntil = 0;

const MAX_ATTEMPTS = 3;
const BLOCK_TIME = 5 * 60 * 1000;

/* ===== LOADER ===== */
function showApp(){
  loading.style.display = "none";
  loading.style.pointerEvents = "none";

  app.style.display = "flex";
  app.style.pointerEvents = "auto";
}

function deny(reason = "access"){
  if (denied) return; // ⛔ защита от повторов
  denied = true;

  let text = "⛔ Нет доступа";

  switch(reason){
    case "banned": text = "🚫 Вы заблокированы"; break;
    case "no_role": text = "👤 У вас нет прав доступа"; break;
    case "deleted": text = "🗑 Доступ удалён"; break;
    case "error": text = "⚠️ Ошибка сервера"; break;
  }

  // ⛔ полностью останавливаем app
  app.innerHTML = "";
  app.style.display = "none";
  app.style.pointerEvents = "none";

  loading.style.display = "flex";
  loading.style.pointerEvents = "none";
  loading.innerHTML = `<div class="deny-text">${text}</div>`;

  tg.HapticFeedback.notificationOccurred("error");

  setTimeout(() => {
    tg.close();
  }, 2000);
}

function waitForInitData() {
  return new Promise(resolve => {
    if (tg.initData) return resolve();
    const i = setInterval(() => {
      if (tg.initData) {
        clearInterval(i);
        resolve();
      }
    }, 50);
  });
}

/* ===== START ===== */
async function start(){
  try {
    if (!(await pingDB())) {
      deny("error");
      return;
    }

    const tg_id = await verifyInitData();
    if (!tg_id) {
      deny("error");
      return;
    }

    user = {
      id: tg_id,
      first_name: tg.initDataUnsafe.user?.first_name || "",
      photo_url: tg.initDataUnsafe.user?.photo_url || ""
    };

    const { data, error } = await sb
      .from("admins")
      .select("*")
      .eq("tg_id", user.id)
      .maybeSingle();

    if (error) {
      deny("error");
      return;
    }

    if (!data) {
      deny("deleted");
      return;
    }

    // 🔒 PIN-блок (временный)
    if (
      data.blocked_until &&
      data.blocked_until !== 9999999999999 &&
      Date.now() < data.blocked_until
    ) {
      blockedUntil = data.blocked_until;
      showApp();
      showBlockedScreen();
      return;
    }

   // 🚫 Перманентный бан (только owner)
   if (data.blocked_until === 9999999999999) {
     deny("banned");
     return;
    }

    if (!data.role) {
      deny("no_role");
      return;
    }

    ROLE = data.role;
    PIN_HASH = data.pin_hash || "";

    // 🔥 обновляем последнюю активность
   await sb
    .from("admins")
    .update({ last_activity: Date.now() })
    .eq("tg_id", user.id);

    showApp();
    app.innerHTML = "";

    if (ROLE === "owner") {
      welcome();
    } else {
      drawPin();
    }

  } catch (e) {
    console.error("START ERROR:", e);
    deny("error");
  }
}

/* ===== PIN UI ===== */
function drawPin(){
  if (ROLE === "owner") return; // ⛔ owner никогда не видит PIN
  if(Date.now() < blockedUntil) return;

  app.innerHTML = `
    <div class="card">
      <div class="avatar" style="background-image:url('${user.photo_url||""}')"></div>
      <div class="user-name">${user.first_name}</div>
      <div class="user-role">${ROLE}</div>

      <div class="dots">
        ${[0,1,2,3].map(i =>
          `<div class="dot ${input[i]?'fill':''} ${error?'error':''}"></div>`
        ).join("")}
      </div>

      <div class="keypad">
        ${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(k=>{
          return k === ""
            ? `<div class="key empty"></div>`
            : `<div class="key" data-key="${k}">${k}</div>`;
        }).join("")}
      </div>
    </div>
  `;
}

/* ===== KEYPAD ===== */
app.addEventListener("click", e=>{
  const key = e.target.closest(".key");
  if(!key || key.classList.contains("empty")) return;
  press(key.dataset.key);
});

function press(k){
  if (ROLE === "owner") return; // ⛔ owner никогда не видит PIN
  if(inputLocked || Date.now() < blockedUntil) return;
  tg.HapticFeedback.impactOccurred("light");

  if(k === "⌫") input = input.slice(0,-1);
  else if(input.length < 4) input += k;

  error = false;
  drawPin();

  if(input.length === 4) check();
}

/* ===== CHECK ===== */
async function check(){
  if (ROLE === "owner") return;

  inputLocked = true;

  const ok = PIN_HASH && await hashPin(input) === PIN_HASH;

  if (ok) {
    tg.HapticFeedback.notificationOccurred("success");
    input = "";
    attempts = 0;
    inputLocked = false;
    welcome();
    return;
  }

  attempts++;
  tg.HapticFeedback.notificationOccurred("error");

  if (attempts >= MAX_ATTEMPTS) {
    blockedUntil = Date.now() + BLOCK_TIME;

    await sb
      .from("admins")
      .update({ blocked_until: blockedUntil })
      .eq("tg_id", user.id);

    showBlockedScreen();
    return;
  }

  input = "";
  error = true;
  inputLocked = false;
  drawPin();
}

/* ===== BLOCKED ===== */
function showBlockedScreen(){
  app.innerHTML = `
    <div class="blocked-screen">
      <div class="blocked-card">
        <div class="lock-icon">🔒</div>
        <div class="blocked-title">Слишком много попыток</div>
        <div class="blocked-timer" id="timer"></div>
      </div>
    </div>
  `;
  updateTimer();
}

function updateTimer(){
  const el = document.getElementById("timer");
  if (!el) return;

  const left = blockedUntil - Date.now();

  if (left <= 0) {
    blockedUntil = 0;
    attempts = 0;
    input = "";
    error = false;

    drawPin(); // 🔥 возврат к PIN
    return;
  }

  const m = String(Math.floor(left / 60000)).padStart(2, "0");
  const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");

  el.textContent = `${m}:${s}`;

  setTimeout(updateTimer, 1000);
}

/* WELCOME */
function welcome(){
  app.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-card">

        <!-- PREMIUM SVG -->
        <svg class="welcome-svg" width="160" height="160"
             viewBox="0 0 160 160" fill="none"
             xmlns="http://www.w3.org/2000/svg">

          <defs>
            <linearGradient id="grad-main" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="50%" stop-color="#c7c7ff"/>
              <stop offset="100%" stop-color="#8affd6"/>
            </linearGradient>

            <filter id="glow">
              <feGaussianBlur stdDeviation="6" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <circle cx="80" cy="80" r="66"
                  stroke="url(#grad-main)"
                  stroke-width="3"
                  opacity="0.6"
                  filter="url(#glow)"/>

          <rect x="44" y="44" width="72" height="72" rx="20"
                stroke="url(#grad-main)"
                stroke-width="3"
                fill="rgba(255,255,255,0.02)"
                filter="url(#glow)"/>

          <path d="M60 68h40M60 82h28"
                stroke="url(#grad-main)"
                stroke-width="4"
                stroke-linecap="round"/>

          <circle cx="104" cy="60" r="4"
                  fill="#8affd6"
                  filter="url(#glow)"/>
        </svg>

        <div class="welcome-title">Добро пожаловать</div>
        <div class="welcome-sub">
          в админ панель <b>BENTO TEAM</b>
        </div>

      </div>
    </div>
  `;

  setTimeout(menu, 1800);
}

/* ===== MENU ===== */
function menu(){
  app.innerHTML = `
    <div class="menu-wrap">
      <div class="menu-card">

        <div class="menu-title">
          👑 BENTO ADMIN
        </div>

        ${ROLE === "owner" ? `
          <div class="menu-btn" onclick="adminPanel()">
            <span class="menu-icon">👥</span>
            <span class="menu-text">Админы</span>
          </div>

          <div class="menu-btn" onclick="logsPanel()">
            <span class="menu-icon">📜</span>
            <span class="menu-text">Логи</span>
          </div>

          <div class="menu-btn danger" onclick="emergencyPanel()">
            <span class="menu-icon">🚨</span>
            <span class="menu-text">Экстренная ситуация</span>
          </div>
        ` : ""}

        <div class="menu-btn" onclick="requestsPanel()">
          <span class="menu-icon">📨</span>
          <span class="menu-text">Заявки</span>
        </div>

        <div class="menu-btn" onclick="settingsPanel()">
          <span class="menu-icon">⚙️</span>
          <span class="menu-text">Настройки</span>
        </div>

        <div class="menu-btn exit" onclick="tg.close()">
          <span class="menu-icon">🚪</span>
          <span class="menu-text">Выйти</span>
        </div>

      </div>
    </div>
  `;
}

/* ===== ADMINS ===== */
async function adminPanel(){
  if (ROLE !== "owner") return;

  app.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-box">

        <div class="admin-title" onclick="menu()">← Админы</div>

        <div class="admin-form">
          <input id="a_name" placeholder="Имя админа">
          <input id="a_id" placeholder="Telegram ID" inputmode="numeric">
          <input id="a_pin" placeholder="PIN (если ADMIN)">
          <select id="a_role">
            <option value="admin">ADMIN</option>
            <option value="owner">OWNER</option>
          </select>
          <button onclick="addAdmin()">+ Добавить админа</button>
        </div>

        <div id="admins" class="admin-list"></div>

      </div>
    </div>
  `;

  loadAdmins();
}

async function loadAdmins(){
  const { data } = await sb
    .from("admins")
    .select("*")
    .order("role", { ascending:false });

  document.getElementById("admins").innerHTML =
    data.map(renderAdmin).join("");
}

function formatMSK(ts){
  if (!ts) return "—";

  return new Date(ts).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function activityStatus(ts){
  if (!ts) {
    return {
      icon: "⚫",
      text: "offline"
    };
  }

  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);

  if (min <= 2) {
    return {
      icon: "🟢",
      text: "online"
    };
  }

  return {
    icon: "⚫",
    text: "offline"
  };
}

function renderAdmin(a){
  const blocked = a.blocked_until && Date.now() < a.blocked_until;

  return `
  <div class="admin-card">
    <div class="admin-header">
      ${(() => {
  const st = activityStatus(a.last_activity);
  return `
    <div class="admin-name">
      ${a.name || "Без имени"}
      <span class="admin-status">
        ${st.icon} ${st.text} · ${formatMSK(a.last_activity)}
      </span>
    </div>
  `;
})()}
      <div class="admin-role ${blocked ? "blocked" : a.role}">
        ${blocked ? "BLOCKED" : a.role.toUpperCase()}
      </div>
    </div>

    <div class="admin-info">ID ${a.tg_id}</div>

    ${a.role !== "owner" ? `
      <div class="pin">
        <div class="pin-code" id="pin-${a.tg_id}">••••</div>
        <div class="pin-btn"
             onclick="togglePin(${a.tg_id})">
          показать
        </div>
      </div>
    ` : ""}

    ${a.role !== "owner" ? `
      <div class="admin-actions">
        <button onclick="blockAdmin(${a.tg_id}, 300000)">5 мин</button>
        <button onclick="blockAdmin(${a.tg_id}, 0)">Навсегда</button>
        <button onclick="deleteAdmin(${a.tg_id})">Удалить</button>
      </div>
    ` : ""}
  </div>
  `;
}

async function addAdmin(){
  const name = document.getElementById("a_name").value.trim();
  const id   = Number(document.getElementById("a_id").value.trim());
  const role = document.getElementById("a_role").value;
  const pin  = document.getElementById("a_pin").value.trim();

  if (role === "owner" && pin) {
    alert("OWNER не использует PIN");
    return;
  }

  if (role === "admin" && !pin) {
    alert("PIN обязателен для ADMIN");
    return;
  }

  if (!id || !name) {
    tg.HapticFeedback.notificationOccurred("error");
    return;
  }

  const pin_hash =
    role === "owner" ? null :
    pin ? await hashPin(pin) : null;

  const { error } = await sb.from("admins").insert({
    tg_id: id,
    name,
    role,
    pin_hash,
    blocked_until: null
  });

  if (error) {
    alert(error.message);
    tg.HapticFeedback.notificationOccurred("error");
    return;
  }

  tg.HapticFeedback.notificationOccurred("success");

  document.getElementById("a_name").value = "";
  document.getElementById("a_id").value = "";
  document.getElementById("a_pin").value = "";

  loadAdmins();
}

async function blockAdmin(tg_id, time){
  const until = time === 0 ? 9999999999999 : Date.now() + time;

  await sb
    .from("admins")
    .update({ blocked_until: until })
    .eq("tg_id", tg_id);

  loadAdmins();
}

function togglePin(id){
  const el = document.getElementById(`pin-${id}`);
  el.textContent = el.textContent === "••••" ? "СКРЫТО" : "••••";
}

async function deleteAdmin(tg_id){
  if (!confirm("Удалить админа?")) return;

  const { error } = await sb
    .from("admins")
    .delete()
    .eq("tg_id", tg_id);

  if (error) {
    alert(error.message);
    return;
  }

  tg.HapticFeedback.notificationOccurred("success");
  loadAdmins();
}

function logsPanel(){
  if (ROLE !== "owner") return;
  app.innerHTML = `
    <div class="card">
      <div class="menu-title">📜 Логи</div>
      <div class="menu-sub">Скоро будет</div>
      <div class="menu-btn" onclick="menu()">← Назад</div>
    </div>
  `;
}

function emergencyPanel(){
  if (ROLE !== "owner") return;

  if (!confirm("⚠️ Экстренная панель. Продолжить?")) return;

  app.innerHTML = `
    <div class="card danger">
      <div class="menu-title">🚨 Экстренная ситуация</div>
      <div class="menu-sub">Доступ только для OWNER</div>
      <div class="menu-btn" onclick="menu()">← Назад</div>
    </div>
  `;
}

/* ===== REQUESTS ===== */
function requestsPanel(){
  app.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-box">

        <div class="admin-title" onclick="menu()">← Заявки</div>

        <div class="admin-list" id="requests-list">

          <div class="admin-card">
            <div class="admin-header">
              <div class="admin-name">
                Нет заявок
                <span class="admin-status">📭 пусто</span>
              </div>
              <div class="admin-role admin">INFO</div>
            </div>

            <div class="admin-info">
              Здесь будут отображаться входящие заявки
            </div>
          </div>

        </div>

      </div>
    </div>
  `;
}

function settingsPanel(){
  app.innerHTML = `
    <div class="card">
      <div class="menu-title">⚙️ Настройки</div>
      <div class="menu-sub">В разработке</div>
      <div class="menu-btn" onclick="menu()">← Назад</div>
    </div>
  `;
}

/* ===== INIT ===== */
(async () => {
  await waitForInitData();
  start();
})();

setTimeout(() => {
  if (
    !denied &&
    loading.style.display !== "none" &&
    app.style.display === "none"
  ) {
    loading.innerHTML = "🌐 Проверьте интернет соединение";
    setTimeout(() => tg.close(), 2000);
  }
}, 4000);

fetch("bentoapp-production.up.railway.app")
  .then(r => r.json())
  .then(d => console.log("Railway:", d))
  .catch(e => console.error("Railway error", e));
