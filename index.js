const tg = Telegram.WebApp;

tg.expand();
tg.ready();
tg.setHeaderColor("#0e0f14");
tg.setBackgroundColor("#0e0f14");

const user = tg.initDataUnsafe.user;

const sb = supabase.createClient(
  "https://mynsrqebdknpceyucayb.supabase.co",
  "sb_publishable_W37lFR5w6xlYXYtUinLtjA_IEqOP-ci"
);

let ROLE="", PIN="", input="", error=false;
const app=document.getElementById("app");

let attempts = 0;
let blockedUntil = 0;
const MAX_ATTEMPTS = 3;
const BLOCK_TIME = 30 * 1000;

/* AUTO LOGOUT */
const INACTIVITY_TIME = 60 * 1000;
let inactivityTimer = null;

["click","touchstart","keydown"].forEach(evt=>{
  document.addEventListener(evt, resetInactivity, {passive:true});
});

if(localStorage.getItem("theme")==="light")
  document.body.classList.add("light");

function resetInactivity(){
  if(inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(()=>tg.close(), INACTIVITY_TIME);
}

function toggleTheme(){
  document.body.classList.toggle("light");
  localStorage.setItem("theme",
    document.body.classList.contains("light")?"light":"dark");
}

/* START */
async function start(){
  resetInactivity();

  if(!user || !user.id){
    app.innerHTML = "⛔ Откройте приложение через Telegram";
    return;
  }

  const { data, error } = await sb
    .from("admins")
    .select("*")
    .eq("id", user.id)
    .single();

  if(error || !data){
    app.innerHTML = "⛔ Нет доступа";
    return;
  }

  ROLE = String(data.role || "").toLowerCase().trim();
  PIN  = String(data.pin).trim();

  drawPin();
}

/* PIN */
function drawPin(){
  app.innerHTML=`
  <div class="card">
    <div class="avatar ${ROLE==="owner"?"premium-ring":""}"
     style="background-image:url('${user.photo_url||''}')"></div>
    <div class="user-name">${user.first_name}</div>
    <div class="user-role">${ROLE}</div>

    <div class="dots">
      ${[0,1,2,3].map(i=>`
        <div class="dot ${input[i]?'fill':''} ${error?'error':''}"></div>
      `).join("")}
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
  
  if(Date.now() < blockedUntil) return;
  if(k==="⌫") input=input.slice(0,-1);
  else if(input.length<4) input+=k;
  error=false;
  if(input.length===4){ check(); return; }
  drawPin();
}

function check(){
  if(input === PIN){
    tg.HapticFeedback.notificationOccurred("success");
    attempts = 0;
    welcome();
  }else{
    tg.HapticFeedback.notificationOccurred("error");
    attempts++;
    input="";
    error=true;
    if(attempts >= MAX_ATTEMPTS)
      blockedUntil = Date.now() + BLOCK_TIME;
    drawPin();
  }
}

function welcome(){
  app.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-card">

        <svg class="welcome-svg" width="140" height="140" viewBox="0 0 140 140" fill="none"
             xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#a1a1a1"/>
            </linearGradient>
          </defs>

          <circle cx="70" cy="70" r="62"
                  stroke="url(#grad)" stroke-width="3"/>
          <rect x="38" y="40" width="64" height="64" rx="16"
                stroke="url(#grad)" stroke-width="3"/>
          <path d="M52 62h36M52 78h24"
                stroke="url(#grad)"
                stroke-width="4"
                stroke-linecap="round"/>
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
  
function menu(){
  tg.HapticFeedback.impactOccurred("medium");
  resetInactivity();

  app.innerHTML = `
    <div class="card">
      <div class="menu-title">👑 BENTO ADMIN</div>

      <div class="user-card">
  <div class="name">${user.first_name}</div>

  <div class="id" onclick="toggleID(this)" data-open="0">
  <span class="hidden-value">•••••••••</span>
  <span class="eye">👁</span>
</div>

      <div class="menu-list">
        <div class="menu-item">📩 Заявки</div>

        ${
          ROLE === "owner"
          ? `<div class="menu-item" onclick="adminPanel()">👥 Админы</div>`
          : ``
        }

        <div class="menu-item">⛔ Блэклист</div>

        <div class="menu-item" onclick="settings()">⚙️ Настройки</div>

        <div class="menu-item exit" onclick="tg.close()">🚪 Выйти</div>
      </div>
    </div>
  `;
}

function settings(){
  resetInactivity();

  app.innerHTML = `
    <div class="card">
      <div class="back" onclick="menu()">← Назад</div>

      <h3>Настройки</h3>

      <button class="big-btn" onclick="toggleTheme()">
        🌗 Сменить тему
      </button>
    </div>
  `;
}

async function adminPanel(){
  resetInactivity();

  if(ROLE !== "owner"){
    alert("Нет доступа");
    return;
  }

  const { data, error } = await sb
    .from("admins")
    .select("*")
    .order("role", { ascending: false });

  if(error){
    alert("Ошибка загрузки админов");
    return;
  }

  app.innerHTML = `
    <div class="card">
      <div class="back" onclick="menu()">← Назад</div>
      <h3>Админы</h3>

      <div class="admin-list clean">
        ${data.map(a => `
          <div class="admin-row">
            <div class="admin-main">
              <div class="admin-id">
                <b>ID</b>
                <span class="secret"
                      onclick="toggleAdminSecret(this)"
                      data-open="0"
                      data-id="${a.id}"
                      data-pin="${ROLE === 'owner' ? String(a.pin).padStart(4,'0') : '****'}">
                  ••••••••
                  <span class="eye">👁</span>
                </span>
              </div>

              <div class="admin-role-label">
                ${a.role.toUpperCase()}
              </div>
            </div>

            <div class="admin-actions">
              ${
                a.role === "owner"
                ? `<span class="protected">protected</span>`
                : `<button class="del-btn" onclick="delAdmin(${a.id})">❌</button>`
              }
            </div>
          </div>
        `).join("")}
      </div>

      <button class="big-btn" onclick="addAdmin()">➕ Добавить админа</button>
    </div>
  `;
}

async function addAdmin(){
  if(ROLE !== "owner") return;

  const id = prompt("Telegram ID");
  const pin = prompt("PIN (4 цифры)");
  const role = prompt("admin / owner");

  if(!id || !pin || !role) return;

  await sb.from("admins").insert({
    id: Number(id),
    pin: String(pin),
    role: role.toLowerCase().trim()
  });

  adminPanel();
}

async function delAdmin(id){
  if(ROLE !== "owner") return;

  const { data } = await sb
    .from("admins")
    .select("role")
    .eq("id", id)
    .single();

  if(data?.role === "owner"){
    alert("❌ Нельзя удалить owner");
    return;
  }

  await sb.from("admins").delete().eq("id", id);
  adminPanel();
}

function toggleID(el){
  const value = el.querySelector(".hidden-value");
  const eye = el.querySelector(".eye");

  const opened = el.dataset.open === "1";

  if(opened){
    value.textContent = "•••••••••";
    eye.textContent = "👁";
    el.dataset.open = "0";
  }else{
    value.textContent = "ID " + user.id;
    eye.textContent = "🙈";
    el.dataset.open = "1";
  }
}

function toggleAdminSecret(el){
  const opened = el.dataset.open === "1";
  const id = el.dataset.id;
  const pin = el.dataset.pin;

  const eye = el.querySelector(".eye");
  const textNode = el.childNodes[0];

  if(opened){
    textNode.textContent = "•••••••• ";
    eye.textContent = "👁";
    el.dataset.open = "0";
  }else{
    textNode.textContent = `ID ${id} | PIN ${pin} `;
    eye.textContent = "🙈";
    el.dataset.open = "1";
  }
}
start();
window.menu = menu;
window.settings = settings;
window.toggleID = toggleID;
window.toggleTheme = toggleTheme;
window.resetInactivity = resetInactivity;
window.adminPanel = adminPanel;
window.addAdmin = addAdmin;
window.delAdmin = delAdmin;
window.toggleAdminSecret = toggleAdminSecret;
