/**
 * Shared Type Definitions for Cloudflare Zoom Video Conferencing Application
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_key?: string | null;
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

export interface MeetingSettings {
  waitingRoom: boolean;
  muteOnJoin: boolean;
  videoOffOnJoin: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowFileUploads: boolean;
  requirePassword?: boolean;
}

export interface Meeting {
  id: string;
  public_id: string;
  host_user_id: string;
  title: string;
  password_hash?: string | null;
  status: 'scheduled' | 'active' | 'ended';
  settings: MeetingSettings;
  created_at: number;
  scheduled_at?: number | null;
  ended_at?: number | null;
  host_name?: string;
  is_host?: boolean;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: 'host' | 'co-host' | 'participant';
  joined_at: number;
  left_at?: number | null;
  user_name?: string;
  user_email?: string;
}

export interface MeetingFile {
  id: string;
  meeting_id: string;
  uploader_user_id: string;
  uploader_name?: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  r2_key: string;
  created_at: number;
}

export interface MeetingRecording {
  id: string;
  meeting_id: string;
  r2_key: string;
  duration_seconds: number;
  file_size: number;
  status: 'recording' | 'completed' | 'failed';
  created_at: number;
  ended_at?: number | null;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export type ParticipantRole = 'host' | 'co-host' | 'participant';
export type ParticipantStatus = 'waiting' | 'in_room' | 'left';

export interface RoomParticipantState {
  participantId: string;
  userId: string;
  name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  speaking: boolean;
  callsSessionId?: string;
  callsTrackIds: {
    audio?: string;
    video?: string;
    screen?: string;
  };
  joinedAt: number;
}

// Durable Object WebSocket Message Protocols
export type ClientMessage =
  | { type: 'join'; participantId: string; userId: string; name: string; audioEnabled: boolean; videoEnabled: boolean; password?: string }
  | { type: 'state_update'; audioEnabled?: boolean; videoEnabled?: boolean; screenSharing?: boolean; speaking?: boolean }
  | { type: 'chat_message'; message: string }
  | { type: 'admit_participant'; targetParticipantId: string }
  | { type: 'deny_participant'; targetParticipantId: string }
  | { type: 'mute_participant'; targetParticipantId: string }
  | { type: 'remove_participant'; targetParticipantId: string }
  | { type: 'end_meeting' }
  | { type: 'calls_session_registered'; callsSessionId: string; tracks: { audio?: string; video?: string; screen?: string } }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'welcome'; participant: RoomParticipantState; participants: RoomParticipantState[]; waitingParticipants: RoomParticipantState[]; settings: MeetingSettings; meetingTitle: string }
  | { type: 'waiting_room'; message: string }
  | { type: 'admitted'; participants: RoomParticipantState[]; settings: MeetingSettings }
  | { type: 'denied'; reason: string }
  | { type: 'participant_joined'; participant: RoomParticipantState }
  | { type: 'participant_updated'; participant: RoomParticipantState }
  | { type: 'participant_left'; participantId: string }
  | { type: 'waiting_participant_joined'; participant: RoomParticipantState }
  | { type: 'waiting_participant_left'; participantId: string }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'host_muted_you' }
  | { type: 'removed_by_host'; reason: string }
  | { type: 'meeting_ended' }
  | { type: 'track_published'; participantId: string; callsSessionId: string; trackType: 'audio' | 'video' | 'screen'; trackId: string }
  | { type: 'track_unpublished'; participantId: string; trackType: 'audio' | 'video' | 'screen' }
  | { type: 'pong' }
  | { type: 'error'; message: string };

// Cloudflare Calls API types
export interface CallsNewSessionResponse {
  sessionId: string;
}

export interface CallsTrackLocation {
  location: 'local' | 'remote';
  mid?: string;
  trackName: string;
  sessionId?: string;
}

export interface CallsTracksNewRequest {
  sessionDescription?: {
    sdp: string;
    type: 'offer' | 'answer';
  };
  tracks?: CallsTrackLocation[];
}

export interface CallsTracksNewResponse {
  sessionDescription?: {
    sdp: string;
    type: 'answer' | 'offer';
  };
  tracks?: Array<{
    location: 'local' | 'remote';
    mid?: string;
    trackName: string;
    sessionId?: string;
    status?: string;
    error?: {
      code: string;
      message: string;
    };
  }>;
  requiresImmediateRenegotiation?: boolean;
}

export interface CallsTurnCredentialsResponse {
  iceServers: RTCIceServer[];
  ttl: number;
}

// API Response Format
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Cloudflare Worker Environment Bindings
export interface Env {
  // D1 Database Binding
  DB: D1Database;
  // Durable Object Binding for Room Coordination
  MEETING_ROOMS: DurableObjectNamespace;
  // R2 Buckets
  STORAGE: R2Bucket;

  // Environment variables
  ENVIRONMENT: string;
  COOKIE_SECRET?: string;
  CALLS_APP_ID?: string;
  CALLS_APP_SECRET?: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  APP_URL?: string;
  ALLOWED_ORIGIN?: string;
}
