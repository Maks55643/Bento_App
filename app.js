const tg = Telegram.WebApp;
tg.expand();
tg.ready();
tg.setHeaderColor("#0e0f14");
tg.setBackgroundColor("#0e0f14");

/* ================== CONFIG ================== */
const MAX_ATTEMPTS = 3;
const BLOCK_TIME = 5 * 60 * 1000; // 5 минут
const INACTIVITY_TIME = 60 * 1000; // 1 минута

/* ================== STATE ================== */
let user = null;
let ROLE = "";
let PIN = "";
let input = "";
let error = false;

let attempts = 0;
let blockedUntil = 0;
let inactivityTimer = null;

/* ================== DOM ================== */
const loading = document.getElementById("loading");
const app = document.getElementById("app");

/* ================== SUPABASE ================== */
const sb = supabase.createClient(
  "https://mynsrqebdknpceyucayb.supabase.co",
  "sb_publishable_W37lFR5w6xlYXYtUinLtjA_IEqOP-ci"
);

/* ================== AUTO LOGOUT ================== */
["click","touchstart","keydown"].forEach(evt=>{
  document.addEventListener(evt, resetInactivity, {passive:true});
});

function resetInactivity(){
  if(inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(()=>{
    tg.close();
  }, INACTIVITY_TIME);
}

/* ================== THEME ================== */
if(localStorage.getItem("theme")==="light"){
  document.body.classList.add("light");
}

function toggleTheme(){
  document.body.classList.toggle("light");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
}

/* ================== LOADER ================== */
function showApp(){
  loading.style.opacity="0";
  loading.style.pointerEvents="none";
  setTimeout(()=>loading.remove(),300);
}

/* ================== START ================== */
async function start(){
  resetInactivity();

  if(!tg.initDataUnsafe?.user){
    loading.innerText="ОТКРОЙТЕ В TELEGRAM";
    return;
  }

  user = tg.initDataUnsafe.user;

  const { data, error } = await sb
    .from("admins")
    .select("*")
    .eq("id", user.id)
    .single();

  if(error || !data){
    loading.innerText="НЕТ ДОСТУПА";
    return;
  }

  ROLE = data.role.toLowerCase();
  PIN = String(data.pin).padStart(4,"0");

  setTimeout(()=>{
    showApp();
    drawPin();
  },900);
}

/* ================== PIN ================== */
function drawPin(){
  app.innerHTML=`
    <div class="card">
      <div class="dots">
        ${[0,1,2,3].map(i=>`
          <div class="dot ${input[i]?'fill':''} ${error?'error':''}"></div>
        `).join("")}
      </div>

      <div class="keypad">
        ${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(k=>{
          if(k==="") return `<div></div>`;
          return `<div class="key" onclick="press('${k}')">${k}</div>`;
        }).join("")}
      </div>
    </div>
  `;
}

window.press=function(k){
  resetInactivity();
  tg.HapticFeedback.impactOccurred("light");

  if(Date.now() < blockedUntil) return;

  if(k==="⌫") input=input.slice(0,-1);
  else if(input.length<4) input+=k;

  error=false;

  if(input.length===4){
    checkPin();
    return;
  }
  drawPin();
};

function checkPin(){
  if(input === PIN){
    tg.HapticFeedback.notificationOccurred("success");
    attempts = 0;
    welcome();
  }else{
    tg.HapticFeedback.notificationOccurred("error");
    attempts++;
    input="";
    error=true;

    if(attempts >= MAX_ATTEMPTS){
      blockedUntil = Date.now() + BLOCK_TIME;
    }
    drawPin();
  }
}

/* ================== WELCOME ================== */
function welcome(){
  app.innerHTML=`
    <div class="card">
      <h2>Добро пожаловать</h2>
      <p><b>BENTO TEAM</b></p>
    </div>
  `;
  setTimeout(menu,1500);
}

/* ================== MENU ================== */
function menu(){
  resetInactivity();

  app.innerHTML=`
    <div class="card">
      <div class="menu-item">📩 Заявки</div>

      ${ROLE==="owner"
        ? `<div class="menu-item" onclick="adminPanel()">👥 Админы</div>`
        : ``}

      <div class="menu-item">⛔ Блэклист</div>
      <div class="menu-item" onclick="settings()">⚙️ Настройки</div>
      <div class="menu-item exit" onclick="tg.close()">🚪 Выйти</div>
    </div>
  `;
}

/* ================== SETTINGS ================== */
function settings(){
  resetInactivity();
  app.innerHTML=`
    <div class="card">
      <div class="menu-item" onclick="toggleTheme()">🌗 Сменить тему</div>
      <div class="menu-item" onclick="menu()">← Назад</div>
    </div>
  `;
}

/* ================== ADMINS ================== */
async function adminPanel(){
  resetInactivity();

  const { data } = await sb
    .from("admins")
    .select("*")
    .order("role",{ascending:false});

  app.innerHTML=`
    <div class="card">
      <h3>Админы</h3>

      ${data.map(a=>`
        <div class="menu-item">
          <span class="secret"
            data-open="0"
            data-id="${a.id}"
            data-pin="${ROLE==="owner"?a.pin:"****"}"
            onclick="toggleSecret(this)">
            •••••••• 👁
          </span>

          ${a.role!=="owner"
            ? `<button onclick="delAdmin(${a.id})">❌</button>`
            : `<span>OWNER</span>`
          }
        </div>
      `).join("")}

      <div class="menu-item" onclick="addAdmin()">➕ Добавить</div>
      <div class="menu-item" onclick="menu()">← Назад</div>
    </div>
  `;
}

function toggleSecret(el){
  const open = el.dataset.open==="1";
  el.textContent = open
    ? "•••••••• 👁"
    : `ID ${el.dataset.id} | PIN ${el.dataset.pin} 🙈`;
  el.dataset.open = open?"0":"1";
}

async function addAdmin(){
  const id = prompt("Telegram ID");
  const pin = prompt("PIN (4 цифры)");
  const role = prompt("admin / owner");

  if(!id||!pin||!role) return;

  await sb.from("admins").insert({
    id:Number(id),
    pin:String(pin),
    role:role.toLowerCase()
  });

  adminPanel();
}

async function delAdmin(id){
  const { data } = await sb
    .from("admins")
    .select("role")
    .eq("id",id)
    .single();

  if(data.role==="owner"){
    alert("Нельзя удалить owner");
    return;
  }

  await sb.from("admins").delete().eq("id",id);
  adminPanel();
}

/* ================== START ================== */
start();

/* expose */
window.menu = menu;
window.settings = settings;
window.adminPanel = adminPanel;
window.toggleTheme = toggleTheme;
window.toggleSecret = toggleSecret;
