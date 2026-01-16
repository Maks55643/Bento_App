const tg = Telegram.WebApp;
tg.expand();
tg.ready();
tg.setHeaderColor("#0e0f14");
tg.setBackgroundColor("#0e0f14");

const loading = document.getElementById("loading");
const app = document.getElementById("app");
const getBlockKey = id => `bento_blocked_until_${id}`;
const getAttemptsKey = id => `bento_attempts_${id}`;

function showApp() {
  loading.style.opacity = "0";
  loading.style.pointerEvents = "none";

  setTimeout(() => {
    loading.style.display = "none";
    app.style.display = "flex";
  }, 300);
}

/* SUPABASE */
const sb = supabase.createClient(
  "https://mynsrqebdknpceyucayb.supabase.co",
  "sb_publishable_W37lFR5w6xlYXYtUinLtjA_IEqOP-ci"
);

/* STATE */
let user=null, ROLE="", PIN="", input="", error=false;
let attempts=0, blockedUntil=0;
const MAX_ATTEMPTS=3;
const BLOCK_TIME=5*60*1000;
const STORAGE_BLOCK_KEY = "bento_blocked_until";

/* AUTO LOGOUT */
const INACTIVITY=60*1000;
let timer=null;
["click","touchstart","keydown"].forEach(e=>{
  document.addEventListener(e,resetInactivity,{passive:true});
});
function resetInactivity(){
  if(timer) clearTimeout(timer);
  timer=setTimeout(()=>tg.close(),INACTIVITY);
}

/* THEME */
// DARK THEME BY DEFAULT
if(localStorage.getItem("theme")==="light"){
  document.body.classList.add("light");
}else{
  document.body.classList.remove("light");
}
function toggleTheme(){
  document.body.classList.toggle("light");
  localStorage.setItem("theme",
    document.body.classList.contains("light")?"light":"dark");
  tg.HapticFeedback.impactOccurred("light");
}

/* START */
async function start(){
  resetInactivity();

  if(!tg.initDataUnsafe?.user){
    loading.innerHTML="⛔ Откройте через Telegram";
    return;
  }

  user = tg.initDataUnsafe.user;

  // ♻️ восстановление блокировки
  const savedBlockedUntil = Number(localStorage.getItem(getBlockKey(user.id)) || 0);
  const savedAttempts = Number(localStorage.getItem(getAttemptsKey(user.id)) || 0);

  blockedUntil = savedBlockedUntil;
  attempts = savedAttempts;

  if(Date.now() < blockedUntil){
    setTimeout(()=>{
      showApp();
      showBlockedScreen();
    }, 600);
    return;
  }

  // ❗ если блокировка истекла — чистим
  localStorage.removeItem(getBlockKey(user.id));
  localStorage.removeItem(getAttemptsKey(user.id));
  attempts = 0;

  const {data} = await sb
    .from("admins")
    .select("*")
    .eq("id", user.id)
    .single();

  if(!data){
    loading.innerHTML="⛔ Нет доступа";
    return;
  }

  ROLE = data.role;
  PIN = String(data.pin);

  setTimeout(()=>{
    drawPin();
    showApp();
  }, 1200);
}

  const {data}=await sb
    .from("admins")
    .select("*")
    .eq("id",user.id)
    .single();

  if(!data){
    loading.innerHTML="⛔ Нет доступа";
    return;
  }

  ROLE=data.role;
  PIN=String(data.pin);

  setTimeout(()=>{
  drawPin();   // ← СНАЧАЛА рисуем PIN
  showApp();   // ← ПОТОМ убираем loader
},1200);
}

/* PIN */
function drawPin(){
  if(Date.now() < blockedUntil) return; // 🔒 ВАЖНО
  
  app.innerHTML=`
  <div class="card">
    <div class="avatar" style="background-image:url('${user.photo_url||''}')"></div>
    <div class="user-name">${user.first_name}</div>
    <div class="user-role">${ROLE}</div>

    <div class="dots">
      ${[0,1,2,3].map(i=>`<div class="dot ${input[i]?'fill':''} ${error?'error':''}"></div>`).join("")}
    </div>

    <div class="keypad">
      ${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(k=>{
        if(k==="") return `<div class="key empty"></div>`;
        return `<div class="key" onclick="press('${k}')">${k}</div>`;
      }).join("")}
    </div>
  </div>`;
}

window.press=function(k){
  tg.HapticFeedback.impactOccurred("light");
  if(Date.now()<blockedUntil) return;

  if(k==="⌫") input=input.slice(0,-1);
  else if(input.length<4) input+=k;

  error=false;
  if(input.length===4) check();
  else drawPin();
}

function check(){
  if(input === PIN){
    tg.HapticFeedback.notificationOccurred("success");
    attempts = 0;
    input = "";
    localStorage.removeItem(getAttemptsKey(user.id));
    welcome();
    return;
  }

  tg.HapticFeedback.notificationOccurred("error");
  attempts++;
  input = "";
  error = true;

  localStorage.setItem(getAttemptsKey(user.id), attempts);

  if(attempts >= MAX_ATTEMPTS){
    blockedUntil = Date.now() + BLOCK_TIME;

    localStorage.setItem(getBlockKey(user.id), blockedUntil);
    localStorage.setItem(getAttemptsKey(user.id), attempts);

    showBlockedScreen();
    return;
  }

  drawPin();
}

function showBlockedScreen(){
  app.innerHTML = `
    <div class="blocked-screen">
      <div class="blocked-card">
        <div class="lock-icon">🔒</div>
        <div class="blocked-title">Слишком много попыток</div>
        <div class="blocked-sub">Попробуйте позже</div>
        <div class="blocked-timer" id="blockTimer">05:00</div>
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

  // 🧹 очистка storage
  localStorage.removeItem(STORAGE_BLOCK_KEY);

  drawPin();
  return;
}

  const m = String(Math.floor(left / 60000)).padStart(2,"0");
  const s = String(Math.floor((left % 60000) / 1000)).padStart(2,"0");
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

  setTimeout(()=>{
    document.getElementById("welcome")?.remove(); // 🔥 ВАЖНО
    menu();
  },1800);
}

/* MENU */
function menu(){
  resetInactivity();
  app.innerHTML=`
    <div class="card">
      <div class="menu-title">👑 BENTO ADMIN</div>

      <div class="menu-item" onclick="settings()">⚙️ Настройки</div>

      ${ROLE==="owner"
        ? `<div class="menu-item" onclick="adminPanel()">👥 Админы</div>`
        : ``}

      <div class="menu-item exit" onclick="tg.close()">🚪 Выйти</div>
    </div>`;
}

/* SETTINGS */
function settings(){
  app.innerHTML=`
    <div class="card">
      <div class="menu-item" onclick="toggleTheme()">🌗 Сменить тему</div>
      <div class="menu-item" onclick="menu()">← Назад</div>
    </div>`;
}

/* ADMINS */
async function adminPanel(){
  const {data}=await sb.from("admins").select("*");
  app.innerHTML=`
    <div class="card">
      <div class="menu-item" onclick="menu()">← Назад</div>
      ${data.map(a=>`
        <div class="menu-item">
          ${a.id} | ${a.role}
        </div>`).join("")}
    </div>`;
}

start();
