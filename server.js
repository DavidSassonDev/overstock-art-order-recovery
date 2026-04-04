const express = require('express');
const cors = require('cors');
const path = require('path');
const { upsertOrder, updateStatus, getAllOrders, getOrder, markFollowupSent, getStats, db } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Stats ──────────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get all orders ───────────────────────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  try {
    const { status, search, order_type } = req.query;
    res.json(getAllOrders({ status, search, order_type }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get single order ───────────────────────────────────────────────────────────────────
app.get('/api/orders/:id', (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upsert order ─────────────────────────────────────────────────────────────────────────
app.post('/api/orders', (req, res) => {
  try {
    const result = upsertOrder(req.body);
    res.json({ success: true, changes: result.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update status ──────────────────────────────────────────────────────────────────────────
app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = updateStatus(req.params.id, status, notes);
    res.json({ success: true, changes: result.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Mark follow-up sent ────────────────────────────────────────────────────────────────────────
app.post('/api/orders/:id/followup/:day', (req, res) => {
  try {
    const day = parseInt(req.params.day);
    if (![1, 3, 7].includes(day)) return res.status(400).json({ error: 'Day must be 1, 3, or 7' });
    const result = markFollowupSent(req.params.id, day);
    res.json({ success: true, changes: result.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk import orders ────────────────────────────────────────────────────────────────────────
app.post('/api/orders/bulk', (req, res) => {
  try {
    const orders = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: 'Expected array' });
    let imported = 0;
    for (const order of orders) {
      upsertOrder(order);
      imported++;
    }
    res.json({ success: true, imported });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Square Webhook ─────────────────────────────────────────────────────────────────────────
// Receives payment.completed and order.updated events from Square
app.post('/webhooks/square', (req, res) => {
  try {
    const event = req.body;
    let squareOrderId = null;

    if (event.type === 'payment.completed' || event.type === 'payment.updated') {
      const payment = event.data && event.data.object && event.data.object.payment;
      if (payment && payment.status === 'COMPLETED' && payment.order_id) {
        squareOrderId = payment.order_id;
      }
    }

    if (event.type === 'order.updated') {
      const obj = event.data && event.data.object && event.data.object.order_updated;
      if (obj && obj.state === 'COMPLETED' && obj.order_id) {
        squareOrderId = obj.order_id;
      }
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
