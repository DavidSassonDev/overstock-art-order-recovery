const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { upsertOrder, updateStatus, getAllOrders, getOrder, markFollowupSent, getStats, db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auto-restore seed data if database is empty ────────────────────────────────────────────
// Runs on every startup. Safe: uses INSERT OR IGNORE so existing statuses are never overwritten.
function restoreSeedIfEmpty() {
  try {
    const stats = getStats();
    if (stats.total > 0) { console.log('Database has ' + stats.total + ' orders. Skipping auto-restore.'); return; }
    console.log('Database is empty — restoring seed data...');
    const content = fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8');
    const match = content.match(/const orders\s*=\s*(\[[\s\S]*\n\]);/);
    if (!match) { console.error('Auto-restore: could not parse orders array in seed.js'); return; }
    const orders = eval(match[1]);
    const stmt = db.prepare(`INSERT OR IGNORE INTO orders
      (order_id, customer_name, customer_email, artwork, frame, order_total, coupon_code,
       payment_link, order_type, status, notes, date_added)
      VALUES (@order_id, @customer_name, @customer_email, @artwork, @frame, @order_total,
              @coupon_code, @payment_link, @order_type, @status, @notes, @date_added)`);
    let count = 0;
    const defaults = { payment_link: '', order_type: 'Incomplete Checkout', status: 'New', notes: '', date_added: new Date().toISOString().slice(0, 10) };
    for (const o of orders) { stmt.run({ ...defaults, ...o }); count++; }
    // Restore failed payment recovery orders
    const fpOrders = [
      { order_id: '105613', customer_name: 'Nick Thomas', customer_email: 'nick_thomas77@hotmail.com', artwork: 'VG573-GALWRP18X22', frame: '', order_total: 190.80, coupon_code: 'TAKE30', payment_link: 'https://square.link/u/mNxd5L9S', order_type: 'Failed Payment', status: 'New', notes: 'Coupon TAKE30 (saved $0.00). Shipping waived. Square Order ID: JbDSiLhQ1EuF3BL14dc5kEBBbLNZY', date_added: '2026-04-04' },
      { order_id: '105612', customer_name: 'Nick Thomas', customer_email: 'nick_thomas77@hotmail.com', artwork: 'OR5749, GALWRP18X22, VG1084, PB7467, GALWRP18X22', frame: '', order_total: 520.38, coupon_code: 'TAKE30', payment_link: 'https://square.link/u/wVRUlPDU', order_type: 'Failed Payment', status: 'New', notes: 'Coupon TAKE30 (saved $223.02). Shipping waived. Square Order ID: Z5sVEjRIwbUSvGwEYZkBJzgVpxLZY', date_added: '2026-04-04' }
    ];
    for (const o of fpOrders) { stmt.run(o); count++; }
    console.log('Auto-restore complete: ' + count + ' orders restored.');
  } catch (e) {
    console.error('Auto-restore error:', e.message);
  }
}
restoreSeedIfEmpty();

// ── Stats ──────────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try { res.json(getStats()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Get all orders ───────────────────────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  try {
    const { status, search, order_type } = req.query;
    res.json(getAllOrders({ status, search, order_type }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Get single order ───────────────────────────────────────────────────────────────────
app.get('/api/orders/:id', (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upsert order ─────────────────────────────────────────────────────────────────────────
app.post('/api/orders', (req, res) => {
  try {
    const result = upsertOrder(req.body);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Update status ──────────────────────────────────────────────────────────────────────────
app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = updateStatus(req.params.id, status, notes);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Mark follow-up sent ────────────────────────────────────────────────────────────────────────
app.post('/api/orders/:id/followup/:day', (req, res) => {
  try {
    const day = parseInt(req.params.day);
    if (![1, 3, 7].includes(day)) return res.status(400).json({ error: 'Day must be 1, 3, or 7' });
    const result = markFollowupSent(req.params.id, day);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bulk import orders ────────────────────────────────────────────────────────────────────────
app.post('/api/orders/bulk', (req, res) => {
  try {
    const orders = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Expected array' });
    let imported = 0;
    for (const order of orders) { upsertOrder(order); imported++; }
    res.json({ success: true, imported });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Square Webhook ─────────────────────────────────────────────────────────────────────────
app.post('/webhooks/square', (req, res) => {
  try {
    const event = req.body;
    let squareOrderId = null;
    if (event.type === 'payment.completed' || event.type === 'payment.updated') {
      const payment = event.data && event.data.object && event.data.object.payment;
      if (payment && payment.status === 'COMPLETED' && payment.order_id) squareOrderId = payment.order_id;
    }
    if (event.type === 'order.updated') {
      const obj = event.data && event.data.object && event.data.object.order_updated;
      if (obj && obj.state === 'COMPLETED' && obj.order_id) squareOrderId = obj.order_id;
    }
    if (squareOrderId) {
      const row = db.prepare("SELECT * FROM orders WHERE notes LIKE ? AND status != 'Paid'").get('%' + squareOrderId + '%');
      if (row) {
        updateStatus(row.order_id, 'Paid', 'Payment received via Square on ' + new Date().toISOString() + '. Square Order: ' + squareOrderId);
        console.log('Payment received for order ' + row.order_id);
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Square webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Serve frontend for all other routes ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OverstockArt Order Recovery running on http://localhost:${PORT}`);
});
