// Minimal notes API with Postgres persistence.
// ShipKit injects DATABASE_URL automatically when the project has a managed
// Postgres service attached; locally you can set it in your shell.

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const port = parseInt(process.env.PORT || "3000", 10);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL missing — add a Postgres service to this project.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body  TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[db] schema ready");
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1 AS ok");
    res.json({ ok: rows[0].ok === 1 });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/api/notes", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, title, body, created_at FROM notes ORDER BY id DESC LIMIT 50"
  );
  res.json({ data: rows });
});

app.post("/api/notes", async (req, res) => {
  const { title, body } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const { rows } = await pool.query(
    "INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING id, title, body, created_at",
    [title, body ?? null]
  );
  res.status(201).json({ data: rows[0] });
});

app.delete("/api/notes/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
  await pool.query("DELETE FROM notes WHERE id = $1", [id]);
  res.status(204).end();
});

ensureSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`[notes-app] listening on :${port}`);
    });
  })
  .catch((err) => {
    console.error("[db] schema init failed:", err);
    process.exit(1);
  });
