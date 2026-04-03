const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'orders.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    artwork TEXT,
    frame TEXT,
    order_total REAL DEFAULT 0,
    coupon_code TEXT,
    payment_link TEXT,
    order_type TEXT DEFAULT 'Incomplete Checkout',
    status TEXT DEFAULT 'New',
    notes TEXT,
    date_added TEXT,
    followup_day1_sent INTEGER DEFAULT 0,
    followup_day3_sent INTEGER DEFAULT 0,
    followup_day7_sent INTEGER DEFAULT 0,
    followup_day1_date TEXT,
    followup_day3_date TEXT,
    followup_day7_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS followup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    followup_type TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    notes TEXT
  );
`);

// Upsert an order
function upsertOrder(order) {
  const stmt = db.prepare(`
    INSERT INTO orders (
      order_id, customer_name, customer_email, artwork, frame,
      order_total, coupon_code, payment_link, order_type, status, notes, date_added
    ) VALUES (
      @order_id, @customer_name, @customer_email, @artwork, @frame,
      @order_total, @coupon_code, @payment_link, @order_type, @status, @notes, @date_added
    )
    ON CONFLICT(order_id) DO UPDATE SET
      customer_name = excluded.customer_name,
      customer_email = excluded.customer_email,
      artwork = excluded.artwork,
      frame = excluded.frame,
      order_total = excluded.order_total,
      coupon_code = excluded.coupon_code,
      payment_link = COALESCE(excluded.payment_link, orders.payment_link),
      order_type = excluded.order_type,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = datetime('now')
  `);
  return stmt.run(order);
}

// Update status
function updateStatus(order_id, status, notes) {
  const stmt = db.prepare(`
    UPDATE orders SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE order_id = ?
  `);
  return stmt.run(status, notes || null, order_id);
}

// Get all orders
function getAllOrders(filters = {}) {
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.search) {
    query += ' AND (customer_name LIKE ? OR customer_email LIKE ? OR artwork LIKE ? OR order_id LIKE ?)';
    const s = `%${filters.search}%`;
    params.push(s, s, s, s);
  }
  if (filters.order_type) {
    query += ' AND order_type = ?';
    params.push(filters.order_type);
  }

  query += ' ORDER BY date_added DESC, created_at DESC';

  return db.prepare(query).all(...params);
}

// Get single order
function getOrder(order_id) {
  return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id);
}

// Mark follow-up sent
function markFollowupSent(order_id, day) {
  const col = `followup_day${day}_sent`;
  const dateCol = `followup_day${day}_date`;
  const stmt = db.prepare(`
    UPDATE orders SET ${col} = 1, ${dateCol} = datetime('now'), updated_at = datetime('now')
    WHERE order_id = ?
  `);
  const result = stmt.run(order_id);

  db.prepare(`
    INSERT INTO followup_log (order_id, followup_type) VALUES (?, ?)
  `).run(order_id, `Day ${day}`);

  return result;
}

// Get dashboard stats
function getStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM orders GROUP BY status ORDER BY count DESC
  `).all();
  const recovered = db.prepare(`
    SELECT COALESCE(SUM(order_total), 0) as total FROM orders WHERE status = 'Paid'
  `).get().total;
  const pending = db.prepare(`
    SELECT COALESCE(SUM(order_total), 0) as total FROM orders WHERE status NOT IN ('Paid','No Response','Cancelled')
  `).get().total;

  // Follow-up due today
  const day1Due = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE status = 'New' AND followup_day1_sent = 0
    AND date(date_added) <= date('now', '-1 day')
  `).get().count;

  const day3Due = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE followup_day1_sent = 1 AND followup_day3_sent = 0
    AND date(followup_day1_date) <= date('now', '-3 day')
  `).get().count;

  const day7Due = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE followup_day3_sent = 1 AND followup_day7_sent = 0
    AND date(followup_day3_date) <= date('now', '-7 day')
  `).get().count;

  return { total, byStatus, recovered, pending, day1Due, day3Due, day7Due };
}

module.exports = { upsertOrder, updateStatus, getAllOrders, getOrder, markFollowupSent, getStats, db };
