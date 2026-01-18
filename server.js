import express from "express";

const app = express();

app.use(express.json());

app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

app.use("/admin-bot", express.static("admin-bot"));

app.get("/", (req, res) => {
  res.send("BENTO backend OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on", PORT);
});
