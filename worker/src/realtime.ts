import { Env, CallsNewSessionResponse, CallsTracksNewRequest, CallsTracksNewResponse, CallsTurnCredentialsResponse } from './types';

/**
 * Cloudflare Calls (Realtime SFU) & TURN Service
 *
 * Cloudflare Calls provides serverless WebRTC media infrastructure.
 * This service handles server-to-server calls to Cloudflare's Calls API:
 * - Session creation
 * - Track publishing and subscription
 * - Track closure
 * - Short-lived TURN credentials
 *
 * All privileged Cloudflare API credentials (CALLS_APP_ID and CALLS_APP_SECRET)
 * are kept strictly on the Worker and never leaked to browser clients.
 */
export class RealtimeService {
  private appId: string;
  private appSecret: string;
  private turnKeyId: string;
  private turnKeyApiToken: string;
  private baseUrl: string;

  constructor(private env: Env) {
    this.appId = env.CALLS_APP_ID || '';
    this.appSecret = env.CALLS_APP_SECRET || '';
    this.turnKeyId = env.TURN_KEY_ID || '';
    this.turnKeyApiToken = env.TURN_KEY_API_TOKEN || '';
    this.baseUrl = `https://rtc.live.cloudflare.com/v1/apps/${this.appId}`;
  }

  get isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret && this.appId !== 'placeholder_app_id');
  }

  /**
   * Create a new WebRTC session with Cloudflare Calls SFU.
   */
  async createSession(): Promise<CallsNewSessionResponse> {
    if (!this.isConfigured) {
      // Mock / Local Development fallback when Cloudflare Calls credentials are not configured yet
      const mockSessionId = 'calls-sess-' + crypto.randomUUID();
      return { sessionId: mockSessionId };
    }

    const response = await fetch(`${this.baseUrl}/sessions/new`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.appSecret}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CALLS_API_ERROR: Failed to create session (${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * Publish local tracks or subscribe to remote tracks on a session.
   */
  async newTracks(sessionId: string, data: CallsTracksNewRequest): Promise<CallsTracksNewResponse> {
    if (!this.isConfigured) {
      // Mock response for local development
      return {
        sessionDescription: data.sessionDescription
          ? {
              type: 'answer',
              sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=MockCallsSFU\r\nt=0 0\r\na=sendrecv\r\n',
            }
          : undefined,
        tracks: (data.tracks || []).map((t) => ({
          location: t.location,
          mid: t.mid,
          trackName: t.trackName,
          sessionId: t.sessionId,
          status: 'active',
        })),
      };
    }

    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/tracks/new`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.appSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CALLS_API_ERROR: Failed to update tracks (${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * Close specific tracks on a session.
   */
  async renegotiate(sessionId: string, sessionDescription: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/renegotiate`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.appSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDescription }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CALLS_API_ERROR: Failed to renegotiate (${response.status}): ${errText}`);
    }
    return response.json();
  }

  async closeTracks(sessionId: string, tracks: any[]): Promise<void> {
    if (!this.isConfigured) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/tracks/close`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.appSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tracks }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CALLS_API_ERROR: Failed to close tracks (${response.status}): ${errText}`);
    }
  }

  /**
   * Generate short-lived Cloudflare TURN credentials.
   * TURN credentials allow clients behind strict NAT/firewalls to connect via Cloudflare TURN servers.
   */
  async getTurnCredentials(ttlSeconds: number = 86400): Promise<CallsTurnCredentialsResponse> {
    if (!this.turnKeyId || !this.turnKeyApiToken) {
      // Standard public STUN fallback for local development
      return {
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
        ttl: ttlSeconds,
      };
    }

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${this.turnKeyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.turnKeyApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: Math.min(ttlSeconds, 172800) }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CALLS_API_ERROR: Failed to get TURN credentials (${response.status}): ${errText}`);
    }

    return response.json();
  }
}
