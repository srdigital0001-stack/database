import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("clientflow.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    managed_by TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    total_amount REAL DEFAULT 0,
    advance_paid REAL DEFAULT 0,
    remaining_balance REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    assigned_to TEXT,
    due_date DATE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    type TEXT DEFAULT 'payment',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 3000;

  // API Routes
  app.get("/api/clients", (req, res) => {
    const clients = db.prepare(`
      SELECT c.*, 
             (SELECT GROUP_CONCAT(service_type) FROM services WHERE client_id = c.id) as services_str,
             p.total_amount, p.advance_paid, p.remaining_balance
      FROM clients c
      LEFT JOIN payments p ON c.id = p.client_id
      ORDER BY c.created_at DESC
    `).all() as any[];

    const formatted = clients.map(c => ({
      ...c,
      services: c.services_str ? c.services_str.split(',') : [],
      pending_tasks: db.prepare("SELECT COUNT(*) as count FROM tasks WHERE client_id = ? AND status = 'pending'").get(c.id).count
    }));
    res.json(formatted);
  });

  app.post("/api/clients", (req, res) => {
    const { name, email, phone, company, services, total_amount, advance_paid, notes, managed_by } = req.body;
    const insertClient = db.prepare("INSERT INTO clients (name, email, phone, company, notes, managed_by) VALUES (?, ?, ?, ?, ?, ?)");
    const result = insertClient.run(name, email, phone, company, notes, managed_by);
    const clientId = result.lastInsertRowid;

    if (services && services.length > 0) {
      const insertService = db.prepare("INSERT INTO services (client_id, service_type) VALUES (?, ?)");
      services.forEach((s: string) => insertService.run(clientId, s));
    }

    const insertPayment = db.prepare("INSERT INTO payments (client_id, total_amount, advance_paid, remaining_balance) VALUES (?, ?, ?, ?)");
    insertPayment.run(clientId, total_amount, advance_paid, total_amount - advance_paid);

    if (advance_paid > 0) {
      const insertTransaction = db.prepare("INSERT INTO transactions (client_id, amount) VALUES (?, ?)");
      insertTransaction.run(clientId, advance_paid);
    }

    res.json({ id: clientId });
  });

  app.put("/api/clients/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, phone, company, services, total_amount, advance_paid, notes, managed_by } = req.body;
    
    db.prepare("UPDATE clients SET name = ?, email = ?, phone = ?, company = ?, notes = ?, managed_by = ? WHERE id = ?")
      .run(name, email, phone, company, notes, managed_by, id);

    if (services) {
      db.prepare("DELETE FROM services WHERE client_id = ?").run(id);
      const insertService = db.prepare("INSERT INTO services (client_id, service_type) VALUES (?, ?)");
      services.forEach((s: string) => insertService.run(id, s));
    }

    db.prepare("UPDATE payments SET total_amount = ?, advance_paid = ?, remaining_balance = ?, last_updated = CURRENT_TIMESTAMP WHERE client_id = ?")
      .run(total_amount, advance_paid, total_amount - advance_paid, id);

    res.json({ success: true });
  });

  app.delete("/api/clients/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare(`
      SELECT t.*, c.name as client_name
      FROM tasks t
      JOIN clients c ON t.client_id = c.id
      ORDER BY t.due_date ASC
    `).all();
    res.json(tasks);
  });

  app.post("/api/tasks", (req, res) => {
    const { client_id, title, assigned_to, due_date } = req.body;
    const result = db.prepare("INSERT INTO tasks (client_id, title, assigned_to, due_date) VALUES (?, ?, ?, ?)")
      .run(client_id, title, assigned_to, due_date);
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
    res.json({ success: true });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/transactions", (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, c.name as client_name, c.company
      FROM transactions t
      JOIN clients c ON t.client_id = c.id
      ORDER BY t.created_at DESC
    `).all();
    res.json(transactions);
  });

  app.patch("/api/payments/:clientId", (req, res) => {
    const { clientId } = req.params;
    const { advance_paid } = req.body;
    
    const clientPayment = db.prepare("SELECT * FROM payments WHERE client_id = ?").get(clientId) as any;
    if (!clientPayment) return res.status(404).json({ error: "Payment record not found" });

    const amountAdded = advance_paid - clientPayment.advance_paid;
    const remaining = clientPayment.total_amount - advance_paid;

    db.prepare("UPDATE payments SET advance_paid = ?, remaining_balance = ?, last_updated = CURRENT_TIMESTAMP WHERE client_id = ?")
      .run(advance_paid, remaining, clientId);

    if (amountAdded > 0) {
      db.prepare("INSERT INTO transactions (client_id, amount) VALUES (?, ?)")
        .run(clientId, amountAdded);
    }

    res.json({ success: true });
  });

  app.get("/api/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        SUM(total_amount) as totalRevenue,
        SUM(advance_paid) as totalReceived,
        SUM(remaining_balance) as totalPending
      FROM payments
    `).get() as any;

    const clientCount = db.prepare("SELECT COUNT(*) as count FROM clients").get() as any;

    // Simple trend calculation (mocked for now or could be calculated from history)
    res.json({
      revenue: { value: stats.totalRevenue || 0, trend: "+12.5%" },
      received: { value: stats.totalReceived || 0, trend: "+8.2%" },
      pending: { value: stats.totalPending || 0 },
      clients: { value: clientCount.count || 0 }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite dev server integrated.");
    } catch (e) {
      console.warn("Vite not found or failed to start, falling back to static serving.");
      app.use(express.static(path.join(__dirname, "dist")));
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "dist", "index.html"));
      });
    }
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
