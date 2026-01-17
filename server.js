import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Railway backend works" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
