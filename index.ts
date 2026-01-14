 const tg = window.Telegram.WebApp;
tg.expand();

const OWNER_IDS = [8354848795];

const user = tg.initDataUnsafe?.user;
const app = document.getElementById("app")!;

if (!user || !OWNER_IDS.includes(user.id)) {
  app.innerHTML = "⛔ Доступ запрещён";
  setTimeout(() => tg.close(), 1500);
  throw new Error("Access denied");
}

renderMain();

function renderMain() {
  app.innerHTML = `
    <div class="header">👑 BENTO ADMIN</div>

    <div class="card">
      <div><b>${user!.first_name}</b></div>
      <div class="user">ID: ${user!.id}</div>
    </div>

    <div class="card menu">
      <button onclick="openSection('apps')">📨 Заявки</button>
      <button onclick="openSection('admins')">👥 Админы</button>
      <button onclick="openSection('blacklist')">⛔ Блэклист</button>
      <button onclick="openSection('settings')">⚙️ Настройки</button>
      <button class="exit" onclick="exitApp()">🚪 Выйти</button>
    </div>
  `;
}

// Навигация
(window as any).openSection = (section: string) => {
  app.innerHTML = `
    <div class="header">← Назад</div>
    <div class="card">Раздел: <b>${section}</b></div>
  `;
};

(window as any).exitApp = () => tg.close();
