const tg = window.Telegram.WebApp;
tg.expand();

const OWNER_IDS = [ВАШ_ID]; // ← сюда свой TG ID

const user = tg.initDataUnsafe?.user;
const content = document.getElementById("content")!;

if (!user) {
  content.innerText = "Ошибка авторизации";
  tg.close();
}

if (!OWNER_IDS.includes(user!.id)) {
  content.innerText = "⛔ Нет доступа";
  setTimeout(() => tg.close(), 1500);
  throw new Error("Access denied");
}

content.innerHTML = `
  <p>👤 ${user!.first_name}</p>
  <button id="apps">📨 Заявки</button>
  <button id="admins">👥 Админы</button>
  <button id="settings">⚙️ Настройки</button>
`;

document.getElementById("apps")!.onclick = () => {
  content.innerHTML = "📨 Управление заявками";
};
