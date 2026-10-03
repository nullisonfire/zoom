import { User, Session, Meeting, MeetingParticipant, MeetingFile, MeetingRecording } from './types';

/**
 * Cloudflare D1 Database Helper Layer
 * All queries are strictly parameterized to prevent SQL injection.
 */
export class Database {
  constructor(private db: D1Database) {}

  // ================= USERS =================

  async createUser(user: { id: string; email: string; password_hash: string; name: string }): Promise<User> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, avatar_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(user.id, user.email.toLowerCase().trim(), user.password_hash, user.name.trim(), now, now)
      .run();

    return {
      id: user.id,
      email: user.email.toLowerCase().trim(),
      name: user.name.trim(),
      avatar_key: null,
      created_at: now,
      updated_at: now,
    };
  }

  async getUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
    const row = await this.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .bind(email.toLowerCase().trim())
      .first<any>();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      password_hash: row.password_hash,
      avatar_key: row.avatar_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(`SELECT id, email, name, avatar_key, created_at, updated_at FROM users WHERE id = ?`)
      .bind(id)
      .first<any>();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatar_key: row.avatar_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async updateUser(id: string, updates: { name?: string; avatar_key?: string | null }): Promise<void> {
    const now = Date.now();
    const clauses: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (updates.name !== undefined) {
      clauses.push('name = ?');
      params.push(updates.name.trim());
    }
    if (updates.avatar_key !== undefined) {
      clauses.push('avatar_key = ?');
      params.push(updates.avatar_key);
    }

    params.push(id);
    await this.db
      .prepare(`UPDATE users SET ${clauses.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();
  }

  // ================= SESSIONS =================

  async createSession(session: { id: string; user_id: string; expires_at: number }): Promise<Session> {
    const now = Date.now();
    await this.db
      .prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind(session.id, session.user_id, session.expires_at, now)
      .run();

    return {
      id: session.id,
      user_id: session.user_id,
      expires_at: session.expires_at,
      created_at: now,
    };
  }

  async getSessionById(sessionId: string): Promise<(Session & { user: User }) | null> {
    const now = Date.now();
    const row = await this.db
      .prepare(
        `SELECT s.id as session_id, s.user_id, s.expires_at, s.created_at as session_created_at,
                u.id as u_id, u.email, u.name, u.avatar_key, u.created_at as u_created_at, u.updated_at as u_updated_at
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > ?`
      )
      .bind(sessionId, now)
      .first<any>();

    if (!row) return null;

    return {
      id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      created_at: row.session_created_at,
      user: {
        id: row.u_id,
        email: row.email,
        name: row.name,
        avatar_key: row.avatar_key,
        created_at: row.u_created_at,
        updated_at: row.u_updated_at,
      },
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(Date.now()).run();
  }

  // ================= MEETINGS =================

  async createMeeting(meeting: {
    id: string;
    public_id: string;
    host_user_id: string;
    title: string;
    password_hash?: string | null;
    status: 'scheduled' | 'active' | 'ended';
    settings_json: string;
    scheduled_at?: number | null;
  }): Promise<Meeting> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO meetings (id, public_id, host_user_id, title, password_hash, status, settings_json, created_at, scheduled_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        meeting.id,
        meeting.public_id,
        meeting.host_user_id,
        meeting.title.trim(),
        meeting.password_hash || null,
        meeting.status,
        meeting.settings_json,
        now,
        meeting.scheduled_at || null
      )
      .run();

    return {
      id: meeting.id,
      public_id: meeting.public_id,
      host_user_id: meeting.host_user_id,
      title: meeting.title.trim(),
      password_hash: meeting.password_hash || null,
      status: meeting.status,
      settings: JSON.parse(meeting.settings_json),
      created_at: now,
      scheduled_at: meeting.scheduled_at || null,
      ended_at: null,
    };
  }

  async getMeetingByPublicId(publicId: string): Promise<Meeting | null> {
    const row = await this.db
      .prepare(
        `SELECT m.*, u.name as host_name
         FROM meetings m
         JOIN users u ON m.host_user_id = u.id
         WHERE m.public_id = ?`
      )
      .bind(publicId)
      .first<any>();

    if (!row) return null;

    return {
      id: row.id,
      public_id: row.public_id,
      host_user_id: row.host_user_id,
      title: row.title,
      password_hash: row.password_hash,
      status: row.status,
      settings: JSON.parse(row.settings_json || '{}'),
      created_at: row.created_at,
      scheduled_at: row.scheduled_at,
      ended_at: row.ended_at,
      host_name: row.host_name,
    };
  }

  async getMeetingById(id: string): Promise<Meeting | null> {
    const row = await this.db
      .prepare(
        `SELECT m.*, u.name as host_name
         FROM meetings m
         JOIN users u ON m.host_user_id = u.id
         WHERE m.id = ?`
      )
      .bind(id)
      .first<any>();

    if (!row) return null;

    return {
      id: row.id,
      public_id: row.public_id,
      host_user_id: row.host_user_id,
      title: row.title,
      password_hash: row.password_hash,
      status: row.status,
      settings: JSON.parse(row.settings_json || '{}'),
      created_at: row.created_at,
      scheduled_at: row.scheduled_at,
      ended_at: row.ended_at,
      host_name: row.host_name,
    };
  }

  async listUserMeetings(userId: string): Promise<Meeting[]> {
    const { results } = await this.db
      .prepare(
        `SELECT DISTINCT m.*, u.name as host_name,
         CASE WHEN m.host_user_id = ? THEN 1 ELSE 0 END as is_host
         FROM meetings m
         JOIN users u ON m.host_user_id = u.id
         LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
         WHERE m.host_user_id = ? OR mp.user_id = ?
         ORDER BY m.created_at DESC
         LIMIT 100`
      )
      .bind(userId, userId, userId)
      .all<any>();

    return (results || []).map((row) => ({
      id: row.id,
      public_id: row.public_id,
      host_user_id: row.host_user_id,
      title: row.title,
      password_hash: row.password_hash,
      status: row.status,
      settings: JSON.parse(row.settings_json || '{}'),
      created_at: row.created_at,
      scheduled_at: row.scheduled_at,
      ended_at: row.ended_at,
      host_name: row.host_name,
      is_host: Boolean(row.is_host),
    }));
  }

  async updateMeetingStatus(id: string, status: 'scheduled' | 'active' | 'ended'): Promise<void> {
    const endedAt = status === 'ended' ? Date.now() : null;
    await this.db
      .prepare(`UPDATE meetings SET status = ?, ended_at = COALESCE(?, ended_at) WHERE id = ?`)
      .bind(status, endedAt, id)
      .run();
  }

  async updateMeetingSettings(id: string, settingsJson: string, title?: string): Promise<void> {
    if (title) {
      await this.db
        .prepare(`UPDATE meetings SET settings_json = ?, title = ? WHERE id = ?`)
        .bind(settingsJson, title.trim(), id)
        .run();
    } else {
      await this.db
        .prepare(`UPDATE meetings SET settings_json = ? WHERE id = ?`)
        .bind(settingsJson, id)
        .run();
    }
  }

  async deleteMeeting(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM meetings WHERE id = ?`).bind(id).run();
  }

  // ================= PARTICIPANTS =================

  async recordParticipantJoin(meetingId: string, userId: string, role: 'host' | 'co-host' | 'participant'): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO meeting_participants (id, meeting_id, user_id, role, joined_at, left_at)
         VALUES (?, ?, ?, ?, ?, NULL)`
      )
      .bind(id, meetingId, userId, role, now)
      .run();

    return id;
  }

  async recordParticipantLeave(participantRecordId: string): Promise<void> {
    await this.db
      .prepare(`UPDATE meeting_participants SET left_at = ? WHERE id = ?`)
      .bind(Date.now(), participantRecordId)
      .run();
  }

  async getMeetingParticipants(meetingId: string): Promise<MeetingParticipant[]> {
    const { results } = await this.db
      .prepare(
        `SELECT mp.*, u.name as user_name, u.email as user_email
         FROM meeting_participants mp
         JOIN users u ON mp.user_id = u.id
         WHERE mp.meeting_id = ?
         ORDER BY mp.joined_at ASC`
      )
      .bind(meetingId)
      .all<any>();

    return (results || []).map((row) => ({
      id: row.id,
      meeting_id: row.meeting_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      left_at: row.left_at,
      user_name: row.user_name,
      user_email: row.user_email,
    }));
  }

  // ================= EVENTS =================

  async logMeetingEvent(meetingId: string, userId: string | null, eventType: string, metadata: any = {}): Promise<void> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO meeting_events (id, meeting_id, user_id, event_type, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, meetingId, userId, eventType, JSON.stringify(metadata), Date.now())
      .run();
  }

  // ================= FILES (R2 Metadata in D1) =================

  async createMeetingFile(file: {
    id: string;
    meeting_id: string;
    uploader_user_id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    r2_key: string;
  }): Promise<MeetingFile> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO meeting_files (id, meeting_id, uploader_user_id, file_name, file_size, mime_type, r2_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        file.id,
        file.meeting_id,
        file.uploader_user_id,
        file.file_name,
        file.file_size,
        file.mime_type,
        file.r2_key,
        now
      )
      .run();

    return {
      ...file,
      created_at: now,
    };
  }

  async listMeetingFiles(meetingId: string): Promise<MeetingFile[]> {
    const { results } = await this.db
      .prepare(
        `SELECT mf.*, u.name as uploader_name
         FROM meeting_files mf
         JOIN users u ON mf.uploader_user_id = u.id
         WHERE mf.meeting_id = ?
         ORDER BY mf.created_at DESC`
      )
      .bind(meetingId)
      .all<any>();

    return (results || []).map((row) => ({
      id: row.id,
      meeting_id: row.meeting_id,
      uploader_user_id: row.uploader_user_id,
      uploader_name: row.uploader_name,
      file_name: row.file_name,
      file_size: row.file_size,
      mime_type: row.mime_type,
      r2_key: row.r2_key,
      created_at: row.created_at,
    }));
  }

  async getMeetingFileById(fileId: string): Promise<MeetingFile | null> {
    const row = await this.db
      .prepare(`SELECT * FROM meeting_files WHERE id = ?`)
      .bind(fileId)
      .first<any>();

    if (!row) return null;
    return {
      id: row.id,
      meeting_id: row.meeting_id,
      uploader_user_id: row.uploader_user_id,
      file_name: row.file_name,
      file_size: row.file_size,
      mime_type: row.mime_type,
      r2_key: row.r2_key,
      created_at: row.created_at,
    };
  }

  // ================= RECORDINGS (R2 Metadata in D1) =================

  async createMeetingRecording(recording: {
    id: string;
    meeting_id: string;
    r2_key: string;
  }): Promise<MeetingRecording> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO meeting_recordings (id, meeting_id, r2_key, duration_seconds, file_size, status, created_at, ended_at)
         VALUES (?, ?, ?, 0, 0, 'recording', ?, NULL)`
      )
      .bind(recording.id, recording.meeting_id, recording.r2_key, now)
      .run();

    return {
      id: recording.id,
      meeting_id: recording.meeting_id,
      r2_key: recording.r2_key,
      duration_seconds: 0,
      file_size: 0,
      status: 'recording',
      created_at: now,
      ended_at: null,
    };
  }

  async updateMeetingRecording(
    id: string,
    updates: { duration_seconds?: number; file_size?: number; status: 'completed' | 'failed' }
  ): Promise<void> {
    const now = Date.now();
    await this.db
      .prepare(
        `UPDATE meeting_recordings
         SET duration_seconds = COALESCE(?, duration_seconds),
             file_size = COALESCE(?, file_size),
             status = ?,
             ended_at = ?
         WHERE id = ?`
      )
      .bind(updates.duration_seconds || null, updates.file_size || null, updates.status, now, id)
      .run();
  }

  async listMeetingRecordings(meetingId: string): Promise<MeetingRecording[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM meeting_recordings WHERE meeting_id = ? ORDER BY created_at DESC`)
      .bind(meetingId)
      .all<any>();

    return (results || []).map((row) => ({
      id: row.id,
      meeting_id: row.meeting_id,
      r2_key: row.r2_key,
      duration_seconds: row.duration_seconds,
      file_size: row.file_size,
      status: row.status,
      created_at: row.created_at,
      ended_at: row.ended_at,
    }));
  }

  async getMeetingRecordingById(id: string): Promise<MeetingRecording | null> {
    const row = await this.db
      .prepare(`SELECT * FROM meeting_recordings WHERE id = ?`)
      .bind(id)
      .first<any>();

    if (!row) return null;
    return {
      id: row.id,
      meeting_id: row.meeting_id,
      r2_key: row.r2_key,
      duration_seconds: row.duration_seconds,
      file_size: row.file_size,
      status: row.status,
      created_at: row.created_at,
      ended_at: row.ended_at,
    };
  }
}
