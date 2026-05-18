// src/db/migrate.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running migrations...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name     VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE,
        phone         VARCHAR(30),
        tag           VARCHAR(20) NOT NULL CHECK (tag IN ('first_timer','member','worker')),
        department    VARCHAR(100),
        extra_fields  JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admins (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name          VARCHAR(255),
        role          VARCHAR(30) NOT NULL CHECK (role IN ('media_admin','usher_admin','leader')),
        status        VARCHAR(20) DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
        created_by    VARCHAR(50) DEFAULT 'cms',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invites (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) NOT NULL,
        role          VARCHAR(30) NOT NULL,
        token         VARCHAR(20) UNIQUE NOT NULL,
        status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
        expires_at    TIMESTAMPTZ NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS form_fields (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_type     VARCHAR(30) NOT NULL CHECK (form_type IN ('first_timer','member_worker')),
        field_key     VARCHAR(100) NOT NULL,
        label         VARCHAR(255) NOT NULL,
        type          VARCHAR(30) NOT NULL CHECK (type IN ('text','dropdown','date','number','file')),
        options       JSONB DEFAULT '[]',
        required      BOOLEAN DEFAULT false,
        worker_only   BOOLEAN DEFAULT false,
        active        BOOLEAN DEFAULT true,
        sort_order    INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(form_type, field_key)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_name    VARCHAR(255) NOT NULL,
        status        VARCHAR(10) NOT NULL CHECK (status IN ('present','absent')),
        marked_by     UUID REFERENCES admins(id),
        date          DATE NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, date, event_name)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id       VARCHAR(50),
        sender_name     VARCHAR(255),
        target_type     VARCHAR(20) NOT NULL CHECK (target_type IN ('bulk','individual','reminder','welcome')),
        target_group    VARCHAR(30),
        target_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
        target_user_name VARCHAR(255),
        channels        TEXT[] NOT NULL DEFAULT '{}',
        message         TEXT NOT NULL,
        type            VARCHAR(30) DEFAULT 'manual',
        status          VARCHAR(20) DEFAULT 'sent',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(255) NOT NULL,
        day           VARCHAR(15) NOT NULL,
        time          TIME NOT NULL,
        targets       TEXT[] NOT NULL DEFAULT '{}',
        message       TEXT NOT NULL,
        channels      TEXT[] NOT NULL DEFAULT '{}',
        active        BOOLEAN DEFAULT true,
        last_sent_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_tag ON users(tag);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_target_user ON messages(target_user_id);
    `);

    console.log("✅ All tables created successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
