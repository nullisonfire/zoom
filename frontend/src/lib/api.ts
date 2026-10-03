import { User, Meeting, MeetingSettings, MeetingFile } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('zoom_session_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('zoom_session_token', token);
      } else {
        localStorage.removeItem('zoom_session_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    // Parse JSON
    let json: any;
    try {
      json = await response.json();
    } catch (_) {
      throw new Error(`HTTP Error ${response.status}: Non-JSON response`);
    }

    if (!response.ok || !json.success) {
      const errMessage = json?.error?.message || `Request failed with status ${response.status}`;
      const errCode = json?.error?.code || 'UNKNOWN_ERROR';
      const error: any = new Error(errMessage);
      error.code = errCode;
      error.status = response.status;
      throw error;
    }

    return json.data as T;
  }

  // ================= AUTH =================
  async register(data: { email: string; password: string; name: string }): Promise<{ user: User; sessionId: string }> {
    const res = await this.request<{ user: User; sessionId: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.sessionId);
    return res;
  }

  async login(data: { email: string; password: string }): Promise<{ user: User; sessionId: string }> {
    const res = await this.request<{ user: User; sessionId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.sessionId);
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me', { method: 'GET' });
  }

  // ================= MEETINGS =================
  async createMeeting(data: {
    title: string;
    password?: string;
    scheduledAt?: number;
    settings?: Partial<MeetingSettings>;
  }): Promise<{ meeting: Meeting }> {
    return this.request<{ meeting: Meeting }>('/meetings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listMeetings(): Promise<{ meetings: Meeting[] }> {
    return this.request<{ meetings: Meeting[] }>('/meetings', { method: 'GET' });
  }

  async getMeeting(publicId: string): Promise<{ meeting: Meeting }> {
    return this.request<{ meeting: Meeting }>(`/meetings/${publicId}`, { method: 'GET' });
  }

  async updateMeeting(
    publicId: string,
    data: { title?: string; settings?: Partial<MeetingSettings> }
  ): Promise<{ meeting: Meeting }> {
    return this.request<{ meeting: Meeting }>(`/meetings/${publicId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async joinMeeting(
    publicId: string,
    password?: string
  ): Promise<{ meeting: Meeting; role: 'host' | 'participant'; participantRecordId: string }> {
    return this.request<{ meeting: Meeting; role: 'host' | 'participant'; participantRecordId: string }>(
      `/meetings/${publicId}/join`,
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      }
    );
  }

  async endMeeting(publicId: string): Promise<void> {
    await this.request(`/meetings/${publicId}/end`, { method: 'POST' });
  }

  async getParticipants(publicId: string): Promise<{ participants: any[] }> {
    return this.request<{ participants: any[] }>(`/meetings/${publicId}/participants`, { method: 'GET' });
  }

  // ================= CLOUDFLARE CALLS SFU & TURN =================
  async createCallsSession(publicId: string): Promise<{ sessionId: string }> {
    return this.request<{ sessionId: string }>(`/meetings/${publicId}/realtime/session`, { method: 'POST' });
  }

  async updateCallsTracks(
    publicId: string,
    sessionId: string,
    data: { sessionDescription?: any; tracks?: any[] }
  ): Promise<any> {
    return this.request(`/meetings/${publicId}/realtime/tracks/new`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, ...data }),
    });
  }

  async closeCallsTracks(publicId: string, sessionId: string, trackNames: string[]): Promise<void> {
    await this.request(`/meetings/${publicId}/realtime/tracks/close`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, trackNames }),
    });
  }

  async getTurnCredentials(publicId: string): Promise<{ iceServers: RTCIceServer[]; ttl: number }> {
    return this.request<{ iceServers: RTCIceServer[]; ttl: number }>(`/meetings/${publicId}/realtime/turn`, {
      method: 'GET',
    });
  }

  // ================= R2 FILE SHARING =================
  async listFiles(publicId: string): Promise<{ files: MeetingFile[] }> {
    return this.request<{ files: MeetingFile[] }>(`/meetings/${publicId}/files`, { method: 'GET' });
  }

  async uploadFile(publicId: string, file: File): Promise<{ file: MeetingFile }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_BASE}/meetings/${publicId}/files`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json?.error?.message || 'File upload failed');
    }

    return json.data;
  }

  getFileDownloadUrl(publicId: string, fileId: string): string {
    return `${API_BASE}/meetings/${publicId}/files/${fileId}`;
  }

  // ================= PROFILE & AVATAR =================
  async updateProfile(data: { name: string }): Promise<{ user: User }> {
    return this.request<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async uploadAvatar(file: File): Promise<{ user: User; avatarKey: string }> {
    const headers = new Headers();
    headers.set('Content-Type', file.type);
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const buffer = await file.arrayBuffer();
    const response = await fetch(`${API_BASE}/users/me/avatar`, {
      method: 'PUT',
      headers,
      body: buffer,
      credentials: 'include',
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json?.error?.message || 'Avatar upload failed');
    }

    return json.data;
  }

  getAvatarUrl(): string {
    return `${API_BASE}/users/me/avatar?t=${Date.now()}`;
  }
}

export const api = new ApiClient();
