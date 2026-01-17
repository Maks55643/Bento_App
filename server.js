import express from "express";

const app = express();

// ===== CONFIG FOR MINI APP =====
app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// ===== STATIC MINI APP =====
app.use("/admin-bot", express.static("admin-bot"));

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("BENTO backend OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on", PORT);
});
