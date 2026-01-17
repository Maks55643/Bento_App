const { Telegraf } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

/* ===== CONFIG ===== */
const BOT_TOKEN = "TOKEN_ВТОРОГО_БОТА";
const SUPABASE_URL = "https://duqqpuitipndkghpqupb.supabase.co";
const SUPABASE_SERVICE_KEY = "SERVICE_ROLE_KEY"; // ⚠️ ОБЯЗАТЕЛЬНО

const bot = new Telegraf(BOT_TOKEN);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ===== FSM ===== */
const steps = [
  "age",
  "name",
  "reason",
  "experience",
  "deposit"
];

const questions = {
  age: "🧮 Сколько вам лет?",
  name: "👤 Как вас зовут?",
  reason: "🎯 Зачем хотите вступить в команду?",
  experience: "📊 Сколько опыта в трейдинге?",
  deposit: "💰 С какого депозита готовы начать?"
};

const users = {}; // временное хранилище

/* ===== START ===== */
bot.start(async ctx => {
  const tg_id = ctx.from.id;

  // 🔒 проверка на существующую заявку
  const { data } = await sb
    .from("requests")
    .select("id")
    .eq("tg_id", tg_id)
    .eq("status", "pending")
    .maybeSingle();

  if (data) {
    return ctx.reply("⏳ У вас уже есть активная заявка. Ожидайте решения.");
  }

  users[tg_id] = { step: 0, answers: {} };
  ctx.reply("📨 Заявка в команду BENTO\n\n" + questions.age);
});

/* ===== MESSAGE HANDLER ===== */
bot.on("text", async ctx => {
  const tg_id = ctx.from.id;
  const session = users[tg_id];
  if (!session) return;

  const key = steps[session.step];
  session.answers[key] = ctx.message.text.trim();
  session.step++;

  if (session.step < steps.length) {
    return ctx.reply(questions[steps[session.step]]);
  }

  /* ===== SAVE TO DB ===== */
  const a = session.answers;

  await sb.from("requests").insert({
    tg_id,
    username: ctx.from.username || null,
    age: a.age,
    name: a.name,
    reason: a.reason,
    experience: a.experience,
    deposit: a.deposit
  });

  delete users[tg_id];

  ctx.reply("✅ Заявка отправлена!\nМы свяжемся с вами после проверки.");
});

/* ===== LAUNCH ===== */
bot.launch();
console.log("🚀 Request bot started");
