# Church CMS — Backend

Node.js / Express + PostgreSQL backend with WhatsApp, Email, and SMS messaging, automated service reminders, and full role-based API.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL 14+ |
| Auth | JWT (jsonwebtoken) |
| Email | Nodemailer + Brevo SMTP |
| WhatsApp | Twilio WhatsApp API |
| SMS | Twilio SMS **or** Termii (Nigeria) |
| Scheduler | node-cron (Africa/Lagos timezone) |

---

## Folder Structure

```
church-cms-backend/
├── src/
│   ├── index.js                  ← Express server entry
│   ├── db/
│   │   ├── pool.js               ← PostgreSQL pool
│   │   ├── migrate.js            ← Creates all tables
│   │   └── seed.js               ← Seeds form fields + default reminders
│   ├── middleware/
│   │   └── auth.js               ← JWT middleware (requireAuth, requireCMS, requireRole)
│   ├── routes/
│   │   ├── auth.js               ← Login, invite, accept-invite
│   │   ├── users.js              ← Register, list, update, delete + auto-welcome
│   │   ├── messages.js           ← Bulk send, individual send, history
│   │   ├── reminders.js          ← CRUD reminders + test fire
│   │   └── attendance.js         ← Attendance + admins + form-fields routes
│   ├── services/
│   │   └── messaging.js          ← Email, WhatsApp, SMS send functions
│   └── jobs/
│       └── reminderScheduler.js  ← node-cron scheduler for automated reminders
├── .env.example
└── package.json
```

---

## Quick Start

### 1. Install dependencies

```bash
cd church-cms-backend
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Open .env and fill in your credentials
```

### 3. Set up PostgreSQL

```bash
# Create database
createdb church_cms

# Run migrations (creates all tables)
node src/db/migrate.js

# Seed default form fields and reminders
node src/db/seed.js
```

### 4. Start the server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server starts on **http://localhost:4000**

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | None | CMS or Admin login |
| POST | `/auth/invite` | CMS | Create admin invite |
| GET | `/auth/invites` | CMS | List all invites |
| POST | `/auth/accept-invite` | None | Accept invite & set password |
| GET | `/auth/me` | Any | Get current user |

**Login example:**
```json
POST /auth/login
{ "email": "cms@church.org", "password": "cms123" }
→ { "token": "eyJ...", "role": "cms" }
```

---

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/users/register` | None | Public registration (auto-welcome for first-timers) |
| GET | `/users` | Any admin | List users (filter by ?tag=first_timer) |
| GET | `/users/:id` | Any admin | Get single user |
| PATCH | `/users/:id` | CMS | Update user tag/department |
| DELETE | `/users/:id` | CMS | Delete user |
| GET | `/users/stats/summary` | Any admin | Counts by tag |

**Register example:**
```json
POST /users/register
{
  "full_name": "Grace Adeleke",
  "email": "grace@example.com",
  "phone": "08012345678",
  "tag": "first_timer"
}
```
→ Immediately triggers WhatsApp + Email + SMS welcome message.

---

### Messages

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/messages/bulk` | media_admin | Send to all first-timers |
| POST | `/messages/individual` | media_admin | Send to one first-timer |
| GET | `/messages` | Any admin | Message history |
| GET | `/messages/first-timers/:userId` | media_admin | Messages to one user |

**Bulk send example:**
```json
POST /messages/bulk
{
  "message": "God bless you! See you Sunday at 9AM.",
  "channels": ["whatsapp", "email", "sms"],
  "subject": "This Sunday"
}
```

**Individual send example:**
```json
POST /messages/individual
{
  "user_id": "uuid-here",
  "message": "Hi Grace, hope you're settling in well!",
  "channels": ["whatsapp"]
}
```

---

### Reminders

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/reminders` | Any admin | List all reminders |
| POST | `/reminders` | media_admin | Create reminder |
| PATCH | `/reminders/:id` | media_admin | Update reminder |
| PATCH | `/reminders/:id/toggle` | media_admin | Activate / pause |
| DELETE | `/reminders/:id` | media_admin | Delete |
| POST | `/reminders/:id/send-now` | CMS | Test fire immediately |

**Create reminder example:**
```json
POST /reminders
{
  "name": "Sunday Service Reminder",
  "day": "saturday",
  "time": "10:00",
  "targets": ["first_timer", "member"],
  "message": "🙏 Join us tomorrow for Sunday Service at 9AM!",
  "channels": ["whatsapp", "email", "sms"]
}
```

Default reminders seeded automatically:
- **Every Saturday 10:00 AM** → Sunday Service reminder → first_timers + members
- **Every Tuesday 6:00 PM** → Wednesday Service reminder → first_timers + members

---

### Attendance

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/attendance` | Any admin | List (filter by ?date=, ?event_name=) |
| POST | `/attendance` | usher_admin | Mark present/absent (upserts) |
| PATCH | `/attendance/:id` | usher_admin | Update a record |
| GET | `/attendance/stats/summary` | Any admin | Present/absent counts |

---

### Admins

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/admins` | CMS | List all admins |
| PATCH | `/admins/:id` | CMS | Update name/role/status |
| PATCH | `/admins/:id/toggle` | CMS | Activate / disable |
| DELETE | `/admins/:id` | CMS | Remove admin |

---

### Form Fields

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/form-fields` | None | Get fields (?form_type=first_timer) |
| POST | `/form-fields` | CMS | Add field |
| PATCH | `/form-fields/:id` | CMS | Update field |
| PATCH | `/form-fields/:id/toggle` | CMS | Enable / disable |
| DELETE | `/form-fields/:id` | CMS | Delete field |

---

## Messaging Services Setup

### Email — Brevo (recommended)

1. Sign up at https://brevo.com (free tier: 300 emails/day)
2. Get SMTP credentials from **SMTP & API → SMTP**
3. Set in `.env`:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=your_login@email.com
   SMTP_PASS=your_smtp_key
   EMAIL_FROM=noreply@yourchurch.org
   ```

---

### WhatsApp — Twilio

1. Sign up at https://twilio.com
2. Go to **Messaging → Try it out → Send a WhatsApp message**
3. Join sandbox by sending the join phrase to +1 415 523 8886
4. Set in `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxx
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
5. For production: apply for WhatsApp Business API approval in Twilio console.

---

### SMS — Twilio (international) or Termii (Nigeria)

**Twilio SMS:**
```
TWILIO_SMS_FROM=+1234567890  (your Twilio number)
SMS_PROVIDER=twilio
```

**Termii (cheaper for Nigeria, supports local sender IDs):**

1. Sign up at https://termii.com
2. Get API key from dashboard
3. Set in `.env`:
   ```
   TERMII_API_KEY=your_key
   TERMII_SENDER_ID=YourChurch
   SMS_PROVIDER=termii
   ```

---

## Connecting Frontend to Backend

In `ChurchCMS.jsx`, change:
```js
const API_BASE = null;
// to:
const API_BASE = "http://localhost:4000";
```

Then swap the `dispatch` calls in the frontend to `api()` calls matching the endpoints above. Each frontend action maps directly:

| Frontend action | Backend endpoint |
|---|---|
| Register user | `POST /users/register` |
| Login | `POST /auth/login` |
| Send bulk message | `POST /messages/bulk` |
| Send individual message | `POST /messages/individual` |
| Mark attendance | `POST /attendance` |
| Create reminder | `POST /reminders` |

---

## Production Deployment (Render / Railway)

1. Push repo to GitHub
2. Create a **PostgreSQL** database on Render/Railway
3. Deploy the Node.js service
4. Set all environment variables in the dashboard
5. On first deploy, run: `node src/db/migrate.js && node src/db/seed.js`
6. Set `FRONTEND_URL` to your deployed frontend URL

---

## Phone Number Format

The backend auto-normalises Nigerian numbers:

| Input | Normalised |
|---|---|
| `08012345678` | `+2348012345678` |
| `2348012345678` | `+2348012345678` |
| `+2348012345678` | `+2348012345678` |

International numbers with country code also work as-is.
