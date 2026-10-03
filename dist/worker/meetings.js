"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MeetingService = void 0;
var _auth = require("./auth");
class MeetingService {
  constructor(db, env) {
    this.db = db;
    this.env = env;
  }
  async createMeeting(params) {
    const title = params.title.trim() || 'Instant Meeting';
    const publicId = (0, _auth.generateMeetingPublicId)();
    const meetingId = crypto.randomUUID();
    let passwordHash = null;
    if (params.password && params.password.trim().length > 0) {
      if (params.password.length < 4) {
        throw new Error('INVALID_PASSWORD: Meeting password must be at least 4 characters');
      }
      passwordHash = await (0, _auth.hashPassword)(params.password);
    }
    const defaultSettings = {
      waitingRoom: params.settings?.waitingRoom ?? false,
      muteOnJoin: params.settings?.muteOnJoin ?? false,
      videoOffOnJoin: params.settings?.videoOffOnJoin ?? false,
      allowScreenShare: params.settings?.allowScreenShare ?? true,
      allowChat: params.settings?.allowChat ?? true,
      allowFileUploads: params.settings?.allowFileUploads ?? true,
      requirePassword: Boolean(passwordHash)
    };
    const meeting = await this.db.createMeeting({
      id: meetingId,
      public_id: publicId,
      host_user_id: params.userId,
      title,
      password_hash: passwordHash,
      status: params.scheduledAt && params.scheduledAt > Date.now() ? 'scheduled' : 'active',
      settings_json: JSON.stringify(defaultSettings),
      scheduled_at: params.scheduledAt || null
    });
    await this.db.logMeetingEvent(meetingId, params.userId, 'meeting_created', {
      publicId,
      title,
      scheduledAt: params.scheduledAt
    });
    return meeting;
  }
  async getMeeting(publicId, currentUserId) {
    const meeting = await this.db.getMeetingByPublicId(publicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting does not exist or has been deleted');
    }
    const isHost = currentUserId ? meeting.host_user_id === currentUserId : false;

    // Sanitize password_hash before returning to client
    return {
      ...meeting,
      is_host: isHost,
      password_hash: null,
      // Never expose password hash!
      settings: {
        ...meeting.settings,
        requirePassword: Boolean(meeting.password_hash)
      }
    };
  }
  async joinMeeting(params) {
    const rawMeeting = await this.db.getMeetingByPublicId(params.publicId);
    if (!rawMeeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }
    if (rawMeeting.status === 'ended') {
      throw new Error('MEETING_ENDED: This meeting has already concluded');
    }
    const isHost = rawMeeting.host_user_id === params.user.id;
    const role = isHost ? 'host' : 'participant';

    // Password verification for non-hosts
    if (!isHost && rawMeeting.password_hash) {
      if (!params.password) {
        throw new Error('PASSWORD_REQUIRED: This meeting is password-protected');
      }
      const isValid = await (0, _auth.verifyPassword)(params.password, rawMeeting.password_hash);
      if (!isValid) {
        throw new Error('INVALID_PASSWORD: Incorrect meeting password');
      }
    }

    // Activate meeting if it was scheduled
    if (rawMeeting.status === 'scheduled') {
      await this.db.updateMeetingStatus(rawMeeting.id, 'active');
      rawMeeting.status = 'active';
    }

    // Record join in D1
    const participantRecordId = await this.db.recordParticipantJoin(rawMeeting.id, params.user.id, role);
    await this.db.logMeetingEvent(rawMeeting.id, params.user.id, 'participant_joined', {
      role
    });
    return {
      meeting: {
        ...rawMeeting,
        is_host: isHost,
        password_hash: null
      },
      role,
      participantRecordId
    };
  }
  async updateMeeting(params) {
    const meeting = await this.db.getMeetingByPublicId(params.publicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }
    if (meeting.host_user_id !== params.userId) {
      throw new Error('FORBIDDEN: Only the host can modify meeting settings');
    }
    const updatedSettings = {
      ...meeting.settings,
      ...params.settings
    };
    await this.db.updateMeetingSettings(meeting.id, JSON.stringify(updatedSettings), params.title);
    return {
      ...meeting,
      title: params.title || meeting.title,
      settings: updatedSettings,
      password_hash: null
    };
  }
  async endMeeting(publicId, userId) {
    const meeting = await this.db.getMeetingByPublicId(publicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }
    if (meeting.host_user_id !== userId) {
      throw new Error('FORBIDDEN: Only the host can end the meeting');
    }
    await this.db.updateMeetingStatus(meeting.id, 'ended');
    await this.db.logMeetingEvent(meeting.id, userId, 'meeting_ended');

    // Notify the Durable Object room that the meeting has ended
    try {
      const doId = this.env.MEETING_ROOMS.idFromName(publicId);
      const room = this.env.MEETING_ROOMS.get(doId);
      await room.fetch(new Request('https://room.internal/end', {
        method: 'POST'
      }));
    } catch (e) {
      // Room may have already been idle
    }
  }
  async listUserMeetings(userId) {
    return this.db.listUserMeetings(userId);
  }
  async getParticipants(publicId, userId) {
    const meeting = await this.db.getMeetingByPublicId(publicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }
    return this.db.getMeetingParticipants(meeting.id);
  }
}
exports.MeetingService = MeetingService;