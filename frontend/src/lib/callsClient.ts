import { api } from './api';

export interface CallsTrackInfo {
  participantId: string;
  callsSessionId: string;
  trackType: 'audio' | 'video' | 'screen';
  trackId: string;
}

export class CallsWebRTCClient {
  private publicId: string;
  private sessionId: string | null = null;
  private pushPeer: RTCPeerConnection | null = null;
  private pullPeer: RTCPeerConnection | null = null;
  private iceServers: RTCIceServer[] = [];

  // Local tracks
  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;

  // Remote streams: participantId -> MediaStream
  private remoteStreams = new Map<string, MediaStream>();
  private onRemoteTrackCallback?: (participantId: string, stream: MediaStream) => void;
  private onRemoteTrackRemovedCallback?: (participantId: string) => void;

  constructor(publicId: string) {
    this.publicId = publicId;
  }

  setCallbacks(callbacks: {
    onRemoteTrack: (participantId: string, stream: MediaStream) => void;
    onRemoteTrackRemoved: (participantId: string) => void;
  }) {
    this.onRemoteTrackCallback = callbacks.onRemoteTrack;
    this.onRemoteTrackRemovedCallback = callbacks.onRemoteTrackRemoved;
  }

  /**
   * Initialize WebRTC connections and Cloudflare Calls Session
   */
  async init(): Promise<string> {
    // 1. Fetch short-lived TURN credentials from Cloudflare
    try {
      const turnData = await api.getTurnCredentials(this.publicId);
      this.iceServers = turnData.iceServers;
    } catch (_) {
      this.iceServers = [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
      ];
    }

    // 2. Create Calls session on Cloudflare
    const sessionRes = await api.createCallsSession(this.publicId);
    this.sessionId = sessionRes.sessionId;

    // 3. Initialize RTCPeerConnection for publishing
    this.pushPeer = new RTCPeerConnection({ iceServers: this.iceServers });

    // 4. Initialize RTCPeerConnection for subscribing
    this.pullPeer = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pullPeer.ontrack = (event) => {
      // Find or create remote stream for incoming tracks
      const stream = event.streams[0] || new MediaStream([event.track]);
      const trackId = event.track.id;

      // Extract participant mapping if available
      // The stream is assigned to participant
      if (this.onRemoteTrackCallback) {
        // Will be associated via participantId registry
        this.onRemoteTrackCallback(trackId, stream);
      }
    };

    return this.sessionId;
  }

  /**
   * Publish local audio and video tracks to Cloudflare Calls SFU
   */
  async publishLocalTracks(
    stream: MediaStream
  ): Promise<{ audio?: string; video?: string }> {
    if (!this.pushPeer || !this.sessionId) {
      throw new Error('CallsWebRTCClient not initialized');
    }

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    const tracksToRegister: any[] = [];

    if (audioTrack) {
      this.localAudioTrack = audioTrack;
      const audioSender = this.pushPeer.addTrack(audioTrack, stream);
      tracksToRegister.push({
        location: 'local',
        mid: audioSender.transport ? '0' : 'audio',
        trackName: 'audio',
      });
    }

    if (videoTrack) {
      this.localVideoTrack = videoTrack;
      const videoSender = this.pushPeer.addTrack(videoTrack, stream);
      tracksToRegister.push({
        location: 'local',
        mid: videoSender.transport ? '1' : 'video',
        trackName: 'video',
      });
    }

    if (tracksToRegister.length === 0) {
      return {};
    }

    // Create SDP offer
    const offer = await this.pushPeer.createOffer();
    await this.pushPeer.setLocalDescription(offer);

    // Send offer to Cloudflare Calls SFU
    const response = await api.updateCallsTracks(this.publicId, this.sessionId, {
      sessionDescription: {
        sdp: offer.sdp!,
        type: 'offer',
      },
      tracks: tracksToRegister,
    });

    // Set SFU's answer SDP
    if (response?.sessionDescription?.sdp) {
      await this.pushPeer.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: response.sessionDescription.sdp,
        })
      );
    }

    return {
      audio: audioTrack ? 'audio' : undefined,
      video: videoTrack ? 'video' : undefined,
    };
  }

  /**
   * Publish or replace screen sharing track
   */
  async publishScreenTrack(screenTrack: MediaStreamTrack): Promise<string> {
    if (!this.pushPeer || !this.sessionId) {
      throw new Error('CallsWebRTCClient not initialized');
    }

    this.localScreenTrack = screenTrack;
    const stream = new MediaStream([screenTrack]);
    this.pushPeer.addTrack(screenTrack, stream);

    const offer = await this.pushPeer.createOffer();
    await this.pushPeer.setLocalDescription(offer);

    const response = await api.updateCallsTracks(this.publicId, this.sessionId, {
      sessionDescription: {
        sdp: offer.sdp!,
        type: 'offer',
      },
      tracks: [
        {
          location: 'local',
          trackName: 'screen',
        },
      ],
    });

    if (response?.sessionDescription?.sdp) {
      await this.pushPeer.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: response.sessionDescription.sdp,
        })
      );
    }

    screenTrack.onended = () => {
      this.unpublishScreenTrack();
    };

    return 'screen';
  }

  async unpublishScreenTrack(): Promise<void> {
    if (this.localScreenTrack && this.sessionId) {
      this.localScreenTrack.stop();
      this.localScreenTrack = null;
      try {
        await api.closeCallsTracks(this.publicId, this.sessionId, ['screen']);
      } catch (_) {}
    }
  }

  /**
   * Subscribe to a remote participant's track via Cloudflare Calls SFU
   */
  async subscribeToTrack(trackInfo: CallsTrackInfo): Promise<void> {
    if (!this.pullPeer || !this.sessionId) return;

    try {
      const response = await api.updateCallsTracks(this.publicId, this.sessionId, {
        tracks: [
          {
            location: 'remote',
            sessionId: trackInfo.callsSessionId,
            trackName: trackInfo.trackType,
          },
        ],
      });

      if (response?.sessionDescription?.sdp) {
        await this.pullPeer.setRemoteDescription(
          new RTCSessionDescription({
            type: response.sessionDescription.type,
            sdp: response.sessionDescription.sdp,
          })
        );

        const answer = await this.pullPeer.createAnswer();
        await this.pullPeer.setLocalDescription(answer);

        // Send answer back to SFU if renegotiation needed
        await api.updateCallsTracks(this.publicId, this.sessionId, {
          sessionDescription: {
            type: 'answer',
            sdp: answer.sdp!,
          },
        });
      }
    } catch (err) {
      console.warn('[CallsWebRTCClient] subscribeToTrack error:', err);
    }
  }

  /**
   * Mute or unmute local audio
   */
  setAudioEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.enabled = enabled;
    }
  }

  /**
   * Enable or disable local video
   */
  setVideoEnabled(enabled: boolean): void {
    if (this.localVideoTrack) {
      this.localVideoTrack.enabled = enabled;
    }
  }

  /**
   * Close all WebRTC connections and clean up
   */
  destroy(): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
    if (this.localScreenTrack) {
      this.localScreenTrack.stop();
      this.localScreenTrack = null;
    }
    if (this.pushPeer) {
      this.pushPeer.close();
      this.pushPeer = null;
    }
    if (this.pullPeer) {
      this.pullPeer.close();
      this.pullPeer = null;
    }
    this.remoteStreams.clear();
  }
}
