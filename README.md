# OverstockArt Order Recovery Dashboard

A lightweight Node.js + SQLite CRM for tracking and recovering incomplete checkout orders.

## Features

- Full lead database with SQLite persistence
- Follow-up cadence tracking (Day 1 / Day 3 / Day 7)
- Status management (New, Link Sent, Follow-Up 1, Follow-Up 2, Paid, No Response, Cancelled)
- Email preview generator per lead
- CSV export
- Dashboard stats (pipeline value, recovered revenue, follow-ups due)
- REST API for automation / scheduled tasks

## Setup

```bash
npm install
npm start
```

Then open http://localhost:3000

## Deploy to Railway

1. Push this repo to GitHub (already done)
2. Go to https://railway.app and create a new project
3. Connect your GitHub repo
4. Railway auto-detects Node.js and runs `npm start`
5. Your dashboard will be live at a public URL

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/orders | List all orders (supports ?status=, ?search=, ?order_type=) |
| GET | /api/orders/:id | Get single order |
| POST | /api/orders | Create or update order |
| PATCH | /api/orders/:id/status | Update status |
| POST | /api/orders/:id/followup/:day | Mark follow-up sent (day = 1, 3, or 7) |
| GET | /api/stats | Dashboard statistics |

## Upsert Example

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "105596",
    "customer_name": "Richard Morganelli",
    "customer_email": "shopcraft1@gmaol.com",
    "artwork": "Reminiscence of Youth by Claude Monet",
    "frame": "REM4588",
    "order_total": 333.99,
    "coupon_code": "TAKE30",
    "order_type": "Incomplete Checkout",
    "status": "New"
  }'
```

## Follow-up Cadence

- **Day 1**: Sent 24h after order date — warm personal recovery email
- **Day 3**: Sent 3 days after Day 1 — gentle reminder with payment link
- **Day 7**: Sent 7 days after Day 3 — final nudge before closing lead
