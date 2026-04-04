const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { upsertOrder, updateStatus, getAllOrders, getOrder, markFollowupSent, getStats, db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auto-restore seed data if database is empty on startup
function restoreSeedIfEmpty() {
  try {
    const stats = getStats();
    if (stats.total > 0) {
      console.log('Database has ' + stats.total + ' orders. Skipping auto-restore.');
      return;
    }
    console.log('Database is empty. Running seed.js to restore orders...');
    execSync('node seed.js', { cwd: __dirname, stdio: 'inherit' });
    // Also restore the two failed-payment recovery orders
    var stmt = db.prepare('INSERT OR IGNORE INTO orders (order_id, customer_name, customer_email, artwork, frame, order_total, coupon_code, payment_link, order_type, status, notes, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run('105613','Nick Thomas','nick_thomas77@hotmail.com','VG573-GALWRP18X22','',190.80,'TAKE30','https://square.link/u/mNxd5L9S','Failed Payment','New','Coupon TAKE30 (saved $0.00). Shipping waived. Square Order ID: JbDSiLhQ1EuF3BL14dc5kEBBbLNZY','2026-04-04');
    stmt.run('105612','Nick Thomas','nick_thomas77@hotmail.com','OR5749, GALWRP18X22, VG1084, PB7467, GALWRP18X22','',520.38,'TAKE30','https://square.link/u/wVRUlPDU','Failed Payment','New','Coupon TAKE30 (saved $223.02). Shipping waived. Square Order ID: Z5sVEjRIwbUSvGwEYZkBJzgVpxLZY','2026-04-04');
    var newStats = getStats();
    console.log('Auto-restore complete: ' + newStats.total + ' orders restored.');
  } catch (e) {
    console.error('Auto-restore error:', e.message);
  }
}
restoreSeedIfEmpty();

app.get('/api/stats', (req, res) => {
  try { res.json(getStats()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', (req, res) => {
  try {
    const { status, search, order_type } = req.query;
    res.json(getAllOrders({ status, search, order_type }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', (req, res) => {
  try {
    const result = upsertOrder(req.body);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = updateStatus(req.params.id, status, notes);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/:id/followup/:day', (req, res) => {
  try {
    const day = parseInt(req.params.day);
    if (![1, 3, 7].includes(day)) return res.status(400).json({ error: 'Day must be 1, 3, or 7' });
    const result = markFollowupSent(req.params.id, day);
    res.json({ success: true, changes: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/bulk', (req, res) => {
  try {
    const orders = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Expected array' });
    let imported = 0;
    for (const order of orders) { upsertOrder(order); imported++; }
    res.json({ success: true, imported });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('OverstockArt Order Recovery running on http://localhost:' + PORT);
});
