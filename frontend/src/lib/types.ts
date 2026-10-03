export interface User {
  id: string;
  email: string;
  name: string;
  avatar_key?: string | null;
  created_at: number;
  updated_at: number;
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
  // Local media stream attached in client
  stream?: MediaStream;
}

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

export interface MediaDeviceState {
  audioInputs: DeviceInfo[];
  videoInputs: DeviceInfo[];
  audioOutputs: DeviceInfo[];
  selectedAudioInput: string;
  selectedVideoInput: string;
  selectedAudioOutput: string;
  hasPermissions: boolean;
}
