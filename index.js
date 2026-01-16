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
  "https://mynsrqebdknpceyucayb.supabase.co",
  "sb_publishable_W37lFR5w6xlYXYtUinLtjA_IEqOP-ci"
);

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

  blockedUntil = Number(localStorage.getItem(getBlockKey(user.id)) || 0);
  attempts = Number(localStorage.getItem(getAttemptsKey(user.id)) || 0);

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

  tg.HapticFeedback.impactOccurred("light");

  if(k === "⌫"){
    input = input.slice(0,-1);
  }else if(input.length < 4){
    input += String(k);
  }

  error = false;

  if(input.length === 4){
    inputLocked = true;
    check();
  }else{
    drawPin();
  }
};

function check(){
  if(input === PIN){
    tg.HapticFeedback.notificationOccurred("success");
    attempts = 0;
    input = "";
    inputLocked = false;
    localStorage.removeItem(getAttemptsKey(user.id));
    welcome();
    return;
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

/* ===== START ===== */
start();
