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
  ROLE=String(data.role).toLowerCase();
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
  app.innerHTML=`
  <div class="card">
    <h3>Face ID</h3>
    <div class="faceid">
      <div class="scan-line"></div>
    </div>
  </div>`;
  setTimeout(menu,1800);
}

function menu(){
  app.innerHTML=`
  <div class="card">
    <h2>BENTO ADMIN</h2>
    <p>${user.first_name} • ${ROLE}</p>
    <button class="big-btn" onclick="settings()">⚙️ Настройки</button>
    <button class="big-btn danger" onclick="tg.close()">🚪 Выйти</button>
  </div>`;
}

window.settings=function(){
  app.innerHTML=`
  <div class="card">
    <div class="back" onclick="menu()">← Назад</div>
    <button class="big-btn" onclick="toggleTheme()">🌗 Сменить тему</button>
  </div>`;
}

start();
