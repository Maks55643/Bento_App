const tg = Telegram.WebApp;
tg.expand();

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
  const {data}=await sb.from("admins").select("*").eq("id",user.id).single();
  if(!data) return app.innerHTML="⛔ Нет доступа";
  ROLE = String(data.role || "")
  .toLowerCase()
  .trim();
  PIN=String(data.pin).trim();
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
  if(Date.now() < blockedUntil) return;
  if(k==="⌫") input=input.slice(0,-1);
  else if(input.length<4) input+=k;
  error=false;
  if(input.length===4){ check(); return; }
  drawPin();
}

function check(){
  if(input === PIN){
    attempts = 0;
    faceID();
  }else{
    attempts++;
    input="";
    error=true;
    if(attempts >= MAX_ATTEMPTS)
      blockedUntil = Date.now() + BLOCK_TIME;
    drawPin();
  }
}

function faceID(){
  app.innerHTML = `
  <div class="card">
    <h3>Face ID</h3>

    <div class="faceid">
      <svg class="face-icon" viewBox="0 0 24 24">
        <path d="M4 7V5a2 2 0 0 1 2-2h2"/>
        <path d="M20 7V5a2 2 0 0 0-2-2h-2"/>
        <path d="M4 17v2a2 2 0 0 0 2 2h2"/>
        <path d="M20 17v2a2 2 0 0 1-2 2h-2"/>
        <circle cx="9" cy="10" r="1"/>
        <circle cx="15" cy="10" r="1"/>
        <path d="M9 15c.8.7 1.7 1 3 1s2.2-.3 3-1"/>
      </svg>

      <div class="scan-line"></div>
    </div>
  </div>`;
  setTimeout(menu, 1800);
}

function menu(){
  resetInactivity();

  app.innerHTML = `
    <div class="card">
      <div class="menu-title">👑 BENTO ADMIN</div>

      <div class="user-card">
  <div class="name">${user.first_name}</div>

  <div class="id" onclick="toggleID()">
    <span id="user-id" class="hidden-value">•••••••••</span>
    <span class="eye" id="eye-id">👁</span>
  </div>
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

      <div class="admin-list">
        ${data.map(a => `
          <div class="admin-card ${a.role === "owner" ? "owner" : "admin"}">
            <div class="admin-left">
              <div class="admin-avatar ${a.role === "owner" ? "premium-ring" : ""}">
                ${a.role === "owner" ? "👑" : "A"}
              </div>
              <div class="admin-info">
                <div class="admin-id">ID ${a.id}</div>
                <div class="admin-role ${a.role}">
                  ${a.role.toUpperCase()}
                </div>
                <div class="admin-pin">
                  PIN ${String(a.pin).padStart(4,"0")}
                </div>
              </div>
            </div>

            <div class="admin-actions">
              ${
                a.role === "owner"
                ? `<span style="font-size:12px;color:var(--muted)">protected</span>`
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

let idHidden = true;

function toggleID(){
  const idEl = document.getElementById("user-id");
  const eye = document.getElementById("eye-id");

  if(!idEl) return;

  idHidden = !idHidden;

  if(idHidden){
    idEl.textContent = "•••••••••";
    eye.textContent = "👁";
  }else{
    idEl.textContent = "ID " + user.id;
    eye.textContent = "🙈";
  }
}

start();
window.menu = menu;
window.settings = settings;
window.faceID = faceID;
window.toggleTheme = toggleTheme;
window.resetInactivity = resetInactivity;
window.adminPanel = adminPanel;
window.addAdmin = addAdmin;
window.delAdmin = delAdmin;
