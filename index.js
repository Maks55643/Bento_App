/* ===== TELEGRAM ===== */
const tg = Telegram.WebApp;
tg.expand();
tg.ready();
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

/* ===== PIN STATE ===== */
async function getPinState(){
  const { data: bl } = await sb
    .from("blacklist")
    .select("*")
    .eq("tg_id", user.id)
    .maybeSingle();

  if (bl) {
    if (!bl.blocked_until || Date.now() < bl.blocked_until) {
      deny("banned");
      return "denied";
    }
  }

  const { data: pe } = await sb
    .from("pin_error")
    .select("*")
    .eq("tg_id", user.id)
    .maybeSingle();

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
      reason: "PIN exceeded",
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

    const state = await getPinState();
    if (state === "denied") return;

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

    if (!data.role) {
      deny("no_role");
      return;
    }

    ROLE = data.role;
    PIN_HASH = data.pin_hash || "";

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
  if (ROLE === "owner") return; // ⛔ owner никогда не видит PIN
  inputLocked = true;

  if(
    ROLE === "owner" ||
    (PIN_HASH && await hashPin(input) === PIN_HASH)
  ){
    tg.HapticFeedback.notificationOccurred("success");
    input = "";
    await clearPinErrors();
    welcome();
    return;
  }

  tg.HapticFeedback.notificationOccurred("error");
  input = "";
  error = true;
  inputLocked = false;
  await registerPinError();

  if(attempts >= MAX_ATTEMPTS){
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
        <div class="blocked-timer" id="timer"></div>
      </div>
    </div>
  `;
  updateTimer();
}

function updateTimer(){
  if (ROLE === "owner") return; // ⛔ owner никогда не видит PIN
  const el = document.getElementById("timer");
  if(!el) return;

  const left = blockedUntil - Date.now();
  if(left <= 0){
    blockedUntil = 0;
    attempts = 0;
    drawPin();
    return;
  }

  const m = String(left/60000|0).padStart(2,"0");
  const s = String(left/1000%60|0).padStart(2,"0");
  el.textContent = `${m}:${s}`;
  setTimeout(updateTimer,1000);
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
    <div class="card">
      <div class="menu-title">👑 BENTO ADMIN</div>
      ${ROLE==="owner"?`<div class="menu-item" onclick="adminPanel()">👥 Админы</div>`:""}
      <div class="menu-item exit" onclick="tg.close()">🚪 Выйти</div>
    </div>
  `;
}

/* ===== ADMINS ===== */
async function adminPanel(){
  app.innerHTML = `
    <div class="card">
      <input id="aid" placeholder="TG ID">
      <select id="arole">
        <option value="admin">ADMIN</option>
        <option value="owner">OWNER</option>
      </select>
      <button onclick="addAdmin()">Добавить</button>
      <div id="alist"></div>
    </div>
  `;
  loadAdmins();
}

async function loadAdmins(){
  const { data } = await sb.from("admins").select("tg_id, role");
  document.getElementById("alist").innerHTML =
    data.map(a=>`<div>${a.tg_id} — ${a.role}</div>`).join("");
}

async function addAdmin(){
  const id = +document.getElementById("aid").value;
  const role = document.getElementById("arole").value;
  if(!id) return;

  const pin = role === "owner" ? null : "2580";
  const pin_hash = pin ? await hashPin(pin) : null;

  await sb.from("admins").insert({ tg_id:id, role, pin_hash });
  loadAdmins();
}

/* ===== INIT ===== */
(async () => {
  await waitForInitData();
  start();
})();
setTimeout(() => {
  if (!denied &&
    loading.style.display !== "none" &&
    app.style.display === "none"
) {
