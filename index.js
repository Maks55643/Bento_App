const tg = Telegram.WebApp;
tg.expand();
tg.ready();
tg.setHeaderColor("#0e0f14");
tg.setBackgroundColor("#0e0f14");

const loading = document.getElementById("loading");
const app = document.getElementById("app");

const getBlockKey = id => `bento_blocked_until_${id}`;
const getAttemptsKey = id => `bento_attempts_${id}`;

/* ===== LOADER ===== */
function showApp() {
  loading.style.opacity = "0";
  loading.style.pointerEvents = "none";
  app.style.pointerEvents = "auto";

  setTimeout(() => {
    loading.style.display = "none";
    app.style.display = "flex";
  }, 300);
}

/* ===== SUPABASE ===== */
const sb = supabase.createClient(
  "https://duqqpuitipndkghpqupb.supabase.co",
  "sb_publishable_gN3Tyqs65cBJ0Ra9P7l0hQ_eB413MYU"
);

/* ===== PIN SECURITY (SUPABASE) ===== */

async function getPinState(){
  // 1. Проверяем blacklist
  const { data: bl } = await sb
    .from("blacklist")
    .select("*")
    .eq("tg_id", user.id)
    .single();

  if(bl && Date.now() < bl.blocked_until){
    blockedUntil = bl.blocked_until;
    return "blocked";
  }

  // 2. Проверяем pin_error
  const { data: pe } = await sb
    .from("pin_error")
    .select("*")
    .eq("tg_id", user.id)
    .single();

  attempts = pe?.attempts || 0;
  return "ok";
}

async function registerPinError(){
  attempts++;

  await sb.from("pin_error").upsert({
    tg_id: user.id,
    attempts,
    last_attempt: Date.now()
  });

  if(attempts >= MAX_ATTEMPTS){
    blockedUntil = Date.now() + BLOCK_TIME;

    await sb.from("blacklist").upsert({
      tg_id: user.id,
      reason: "PIN attempts exceeded",
      blocked_until: blockedUntil
    });

    await sb.from("pin_error").delete().eq("tg_id", user.id);
  }
}

async function clearPinErrors(){
  attempts = 0;
  blockedUntil = 0;

  await sb.from("pin_error").delete().eq("tg_id", user.id);
  await sb.from("blacklist").delete().eq("tg_id", user.id);
}

/* ===== STATE ===== */
let user = null;
let ROLE = "";
let PIN = "";
let input = "";
let inputLocked = false;
let error = false;

let attempts = 0;
let blockedUntil = 0;

const MAX_ATTEMPTS = 3;
const BLOCK_TIME = 5 * 60 * 1000;

/* ===== AUTO LOGOUT ===== */
const INACTIVITY = 60 * 1000;
let timer = null;

["click","touchstart","keydown"].forEach(e=>{
  document.addEventListener(e, resetInactivity, { passive:true });
});

function resetInactivity(){
  if(timer) clearTimeout(timer);
  timer = setTimeout(()=>tg.close(), INACTIVITY);
}

/* ===== THEME ===== */
if(localStorage.getItem("theme") === "light"){
  document.body.classList.add("light");
}

function toggleTheme(){
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
  tg.HapticFeedback.impactOccurred("light");
}

/* ===== START ===== */
async function start(){
  resetInactivity();

  if(!tg.initDataUnsafe?.user){
    loading.innerHTML = "⛔ Откройте через Telegram";
    showApp();
    return;
  }

  user = tg.initDataUnsafe.user;

  const state = await getPinState();

if(state === "blocked"){
  showApp();
  showBlockedScreen();
  return;
}
  if(Date.now() < blockedUntil){
    setTimeout(()=>{
      showApp();
      showBlockedScreen();
    }, 600);
    return;
  }

  localStorage.removeItem(getBlockKey(user.id));
  localStorage.removeItem(getAttemptsKey(user.id));
  attempts = 0;

  let data;
  try{
    const res = await sb
      .from("admins")
      .select("*")
      .eq("id", user.id)
      .single();
    data = res.data;
  }catch(e){
    loading.innerHTML = "⚠️ Ошибка подключения";
    showApp();
    return;
  }

  if(!data){
    loading.innerHTML = "⛔ Нет доступа";
    showApp();
    return;
  }

  ROLE = data.role;
  PIN = String(data.pin).padStart(4, "0");

  setTimeout(()=>{
    showApp();
    setTimeout(drawPin, 350);
  }, 1200);

  setTimeout(()=>{
    if(loading.style.display !== "none"){
      showApp();
    }
  }, 3000);
}

/* ===== PIN ===== */
function drawPin(){
  if(Date.now() < blockedUntil) return;

  app.innerHTML = `
    <div class="card">
      <div class="avatar" style="background-image:url('${user.photo_url || ""}')"></div>
      <div class="user-name">${user.first_name}</div>
      <div class="user-role">${ROLE}</div>

      <div class="dots">
        ${[0,1,2,3].map(i =>
          `<div class="dot ${input[i] !== undefined ? 'fill' : ''} ${error ? 'error' : ''}"></div>`
        ).join("")}
      </div>

      <div class="keypad">
        ${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(k=>{
          if(k === "") return `<div class="key empty"></div>`;
          return `<div class="key" data-key="${k}">${k}</div>`;
        }).join("")}
      </div>
    </div>
  `;
}

/* ===== SAFE KEYPAD HANDLER (FIX 0 BUG) ===== */
app.addEventListener("click", e => {
  const key = e.target.closest(".key");
  if(!key || key.classList.contains("empty")) return;

  const value = key.dataset.key;
  if(value === undefined) return;

  press(value);
});

window.press = function(k){
  if(inputLocked) return;

  if(Date.now() < blockedUntil) return;

  inputLocked = true; // ⬅️ переносим СЮДА

  tg.HapticFeedback.impactOccurred("light");

  if(k === "⌫") {
    input = input.slice(0,-1);
  } else if(input.length < 4) {
    input += String(k);
  }

  error = false;
  drawPin();

  if(input.length === 4){
    check();
  }

  requestAnimationFrame(() => {
    inputLocked = false;
  });
};

async function check(){
  if(input === PIN){
    tg.HapticFeedback.notificationOccurred("success");
    input = "";
    await clearPinErrors();
    welcome();
    return;
  }

  tg.HapticFeedback.notificationOccurred("error");
  input = "";
  error = true;

  await registerPinError();

  if(attempts >= MAX_ATTEMPTS){
    showBlockedScreen();
    return;
  }

  drawPin();
}

  tg.HapticFeedback.notificationOccurred("error");
  attempts++;
  input = "";
  error = true;
  inputLocked = false;

  localStorage.setItem(getAttemptsKey(user.id), attempts);

  if(attempts >= MAX_ATTEMPTS){
    blockedUntil = Date.now() + BLOCK_TIME;
    localStorage.setItem(getBlockKey(user.id), blockedUntil);
    showBlockedScreen();
    return;
  }

  drawPin();
}

/* ===== BLOCKED ===== */
function showBlockedScreen(){
  app.innerHTML = `
    <div class="blocked-screen">
      <div class="blocked-card">
        <div class="lock-icon">🔒</div>
        <div class="blocked-title">Слишком много попыток</div>
        <div class="blocked-sub">Попробуйте позже</div>
        <div class="blocked-timer" id="blockTimer"></div>
      </div>
    </div>
  `;
  tg.HapticFeedback.impactOccurred("heavy");
  updateBlockTimer();
}

function updateBlockTimer(){
  const el = document.getElementById("blockTimer");
  if(!el) return;

  const left = blockedUntil - Date.now();

  if(left <= 0){
    attempts = 0;
    blockedUntil = 0;
    error = false;
    localStorage.removeItem(getBlockKey(user.id));
    localStorage.removeItem(getAttemptsKey(user.id));
    drawPin();
    return;
  }

  const m = String(Math.floor(left/60000)).padStart(2,"0");
  const s = String(Math.floor(left%60000/1000)).padStart(2,"0");
  el.textContent = `${m}:${s}`;

  setTimeout(updateBlockTimer, 1000);
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

  setTimeout(() => {
  const el = document.querySelector(".welcome-screen");
  if(el){
    el.classList.add("fade-out");
  }

  setTimeout(menu, 350); // ⬅️ после fade-out
}, 1500);
}

/* MENU */
function menu(){
  resetInactivity();
  app.innerHTML = `
    <div class="card fade-in">
      <div class="menu-title">👑 BENTO ADMIN</div>

      <div class="menu-item" onclick="settings()">⚙️ Настройки</div>

      ${ROLE === "owner"
        ? `<div class="menu-item" onclick="adminPanel()">👥 Админы</div>`
        : ``}

      <div class="menu-item exit" onclick="tg.close()">🚪 Выйти</div>
    </div>
  `;
}

/* SETTINGS */
function settings(){
  app.innerHTML=`
    <div class="card">
      <div class="menu-item" onclick="toggleTheme()">🌗 Сменить тему</div>
      <div class="menu-item" onclick="menu()">← Назад</div>
    </div>`;
}

let adminsCache = [];

async function loadAdmins(){
  const { data, error } = await sb
    .from("admins")
    .select("id, role")
    .order("role", { ascending: false });

  if(error){
    console.error(error);
    return;
  }

  function renderAdmins(){
  const list = document.getElementById("adminList");
  if(!list) return;

  list.innerHTML = adminsCache.map(a => `
    <div class="admin-item">
      <div class="admin-id">ID ${a.id}</div>
      <div class="admin-role">${a.role.toUpperCase()}</div>
    </div>
  `).join("");
}

  adminsCache = data;
  renderAdmins();
}

/* ADMINS */
function adminPanel(){
  app.innerHTML = `
    <div class="card admin-card fade-in">

      <div class="admin-header" onclick="menu()">← Назад</div>

      <div class="admin-form">
        <input
          class="admin-input"
          type="number"
          placeholder="Telegram ID"
          id="newAdminId"
        />

        <select class="admin-select" id="newAdminRole">
          <option value="admin">ADMIN</option>
          <option value="owner">OWNER</option>
        </select>

        <button class="admin-btn" onclick="addAdmin()">
          + Добавить админа
        </button>
      </div>

      <div class="admin-list" id="adminList">
        <div class="admin-item">Загрузка...</div>
      </div>

    </div>
  `;

  loadAdmins(); // 🔥 сразу грузим
}

function addAdmin(){
  tg.HapticFeedback.impactOccurred("light");

  const id = document.getElementById("newAdminId").value;
  const role = document.getElementById("newAdminRole").value;

  if(!id) return;

  alert(`Добавить ID ${id} с ролью ${role}`);
}

async function addAdmin(){
  const id = document.getElementById("newAdminId").value;
  const role = document.getElementById("newAdminRole").value;

  if(!id) return;

  tg.HapticFeedback.impactOccurred("light");

  const { error } = await sb
    .from("admins")
    .insert({ id: Number(id), role });

  if(error){
    tg.HapticFeedback.notificationOccurred("error");
    alert("Ошибка добавления");
    return;
  }

  document.getElementById("newAdminId").value = "";
  loadAdmins(); // 🔥 LIVE REFRESH
}

/* ===== START ===== */
start();
sb.channel("admins-live")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "admins" },
    () => loadAdmins()
  )
  .subscribe();

