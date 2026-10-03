-- Cloudflare D1 Migration: Initial Schema
-- 0001_initial_schema.sql

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 3. Meetings table
CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    host_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    password_hash TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'active', 'ended'
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    scheduled_at INTEGER,
    ended_at INTEGER,
    FOREIGN KEY(host_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON meetings(public_id);
CREATE INDEX IF NOT EXISTS idx_meetings_host_user ON meetings(host_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- 4. Meeting Participants table
CREATE TABLE IF NOT EXISTS meeting_participants (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'participant', -- 'host', 'co-host', 'participant'
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id);

-- 5. Meeting Invitations table
CREATE TABLE IF NOT EXISTS meeting_invitations (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_invitations_token ON meeting_invitations(token);

-- 6. Meeting Events table
CREATE TABLE IF NOT EXISTS meeting_events (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    user_id TEXT,
    event_type TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_events_meeting ON meeting_events(meeting_id);

-- 7. Meeting Files table (R2 metadata)
CREATE TABLE IF NOT EXISTS meeting_files (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    uploader_user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY(uploader_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting ON meeting_files(meeting_id);

-- 8. Meeting Recordings table (R2 metadata)
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    file_size INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'recording', -- 'recording', 'completed', 'failed'
    created_at INTEGER NOT NULL,
    ended_at INTEGER,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting ON meeting_recordings(meeting_id);
