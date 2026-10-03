import { api } from './api';

export interface CallsTrackInfo {
  participantId: string;
  callsSessionId: string;
  trackType: 'audio' | 'video' | 'screen';
  trackId: string;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', done);
      resolve();
    }, 8000);
  });
}

export class CallsWebRTCClient {
  private publicId: string;
  private publishSessionId: string | null = null;
  private subscribeSessionId: string | null = null;
  private pushPeer: RTCPeerConnection | null = null;
  private pullPeer: RTCPeerConnection | null = null;
  private iceServers: RTCIceServer[] = [];
  private remoteMidMap = new Map<string, { participantId: string; trackType: 'audio' | 'video' | 'screen' }>();
  private remoteTracks = new Map<string, { audio?: MediaStreamTrack; video?: MediaStreamTrack; screen?: MediaStreamTrack }>();
  private remoteStreams = new Map<string, MediaStream>();
  private subscriptionChain: Promise<void> = Promise.resolve();
  private subscribedPublications = new Set<string>();
  private screenTransceiver: RTCRtpTransceiver | null = null;

  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;

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

  async init(): Promise<string> {
    const turnData = await api.getTurnCredentials(this.publicId);
    this.iceServers = turnData.iceServers;

    const publish = await api.createCallsSession(this.publicId);
    const subscribe = await api.createCallsSession(this.publicId);
    this.publishSessionId = publish.sessionId;
    this.subscribeSessionId = subscribe.sessionId;

    this.pushPeer = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pullPeer = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pullPeer.ontrack = (event) => {
      const mid = event.transceiver?.mid;
      const mapping = mid ? this.remoteMidMap.get(mid) : undefined;
      if (!mapping) {
        console.warn('[CallsWebRTCClient] Received track with unknown mid', mid);
        return;
      }
      const { participantId, trackType } = mapping;
      const tracks = this.remoteTracks.get(participantId) || {};
      tracks[trackType] = event.track;
      this.remoteTracks.set(participantId, tracks);
      this.emitRemoteStream(participantId);

      event.track.onended = () => {
        const current = this.remoteTracks.get(participantId);
        if (!current) return;
        if (current[trackType]?.id === event.track.id) delete current[trackType];
        if (!current.audio && !current.video && !current.screen) {
          this.remoteTracks.delete(participantId);
          this.remoteStreams.delete(participantId);
          this.onRemoteTrackRemovedCallback?.(participantId);
        } else {
          this.remoteTracks.set(participantId, current);
          this.emitRemoteStream(participantId);
        }
      };
    };

    return this.publishSessionId!;
  }

  private emitRemoteStream(participantId: string): void {
    const tracks = this.remoteTracks.get(participantId);
    if (!tracks) return;
    const stream = new MediaStream();
    if (tracks.audio) stream.addTrack(tracks.audio);
    // Prefer screen video while screen sharing; otherwise camera video.
    if (tracks.screen) stream.addTrack(tracks.screen);
    else if (tracks.video) stream.addTrack(tracks.video);
    this.remoteStreams.set(participantId, stream);
    this.onRemoteTrackCallback?.(participantId, stream);
  }

  async publishLocalTracks(stream: MediaStream): Promise<{ audio?: string; video?: string }> {
    if (!this.pushPeer || !this.publishSessionId) throw new Error('CallsWebRTCClient not initialized');

    const tracks: Array<{ track: MediaStreamTrack; name: 'microphone' | 'camera'; key: 'audio' | 'video' }> = [];
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    if (audio) tracks.push({ track: audio, name: 'microphone', key: 'audio' });
    if (video) tracks.push({ track: video, name: 'camera', key: 'video' });
    if (!tracks.length) return {};

    const transceivers = tracks.map(({ track }) => this.pushPeer!.addTransceiver(track, { direction: 'sendonly' }));
    const offer = await this.pushPeer.createOffer();
    await this.pushPeer.setLocalDescription(offer);
    await waitForIceGatheringComplete(this.pushPeer);

    const registrations = tracks.map((item, i) => ({
      location: 'local' as const,
      mid: transceivers[i].mid,
      trackName: item.name,
    }));

    if (registrations.some((x) => !x.mid)) throw new Error('Cloudflare Calls did not assign media mids');

    const response = await api.updateCallsTracks(this.publicId, this.publishSessionId, {
      sessionDescription: this.pushPeer.localDescription,
      tracks: registrations,
    });

    if (response?.sessionDescription) {
      await this.pushPeer.setRemoteDescription(response.sessionDescription);
    }

    this.localAudioTrack = audio || null;
    this.localVideoTrack = video || null;
    return { audio: audio ? 'microphone' : undefined, video: video ? 'camera' : undefined };
  }

  async publishScreenTrack(screenTrack: MediaStreamTrack): Promise<string> {
    if (!this.pushPeer || !this.publishSessionId) throw new Error('CallsWebRTCClient not initialized');

    this.localScreenTrack = screenTrack;
    const transceiver = this.pushPeer.addTransceiver(screenTrack, { direction: 'sendonly' });
    this.screenTransceiver = transceiver;
    const offer = await this.pushPeer.createOffer();
    await this.pushPeer.setLocalDescription(offer);
    await waitForIceGatheringComplete(this.pushPeer);

    if (!transceiver.mid) throw new Error('Cloudflare Calls did not assign a screen-share mid');

    const response = await api.updateCallsTracks(this.publicId, this.publishSessionId, {
      sessionDescription: this.pushPeer.localDescription,
      tracks: [{ location: 'local', mid: transceiver.mid, trackName: 'screen' }],
    });

    if (response?.sessionDescription) await this.pushPeer.setRemoteDescription(response.sessionDescription);

    screenTrack.onended = () => { void this.unpublishScreenTrack(); };
    return 'screen';
  }

  async unpublishScreenTrack(): Promise<void> {
    if (!this.localScreenTrack || !this.pushPeer || !this.publishSessionId) return;
    this.localScreenTrack.stop();
    this.localScreenTrack = null;
    try {
      if (this.screenTransceiver?.mid) await api.closeCallsTracks(this.publicId, this.publishSessionId, [{ mid: this.screenTransceiver.mid }]);
      this.screenTransceiver = null;
    } catch (_) {}
  }

  async subscribeToTrack(trackInfo: CallsTrackInfo): Promise<void> {
    this.subscriptionChain = this.subscriptionChain.then(() => this.subscribeOne(trackInfo)).catch((err) => {
      console.warn('[CallsWebRTCClient] subscribeToTrack error:', err);
    });
    return this.subscriptionChain;
  }

  private async subscribeOne(trackInfo: CallsTrackInfo): Promise<void> {
    if (!this.pullPeer || !this.subscribeSessionId) return;

    // A publication is uniquely identified by its publisher session + track name.
    // Avoid requesting the same publication twice when room snapshots and
    // track_published events arrive close together.
    const publicationKey = `${trackInfo.callsSessionId}:${trackInfo.trackId}`;
    if (this.subscribedPublications.has(publicationKey)) return;

    const trackName = trackInfo.trackType === 'audio'
      ? 'microphone'
      : trackInfo.trackType === 'video'
        ? 'camera'
        : 'screen';

    // Cloudflare's receiving recipe intentionally sends tracks/new WITHOUT a
    // browser offer. The SFU creates the offer containing the receive m-line.
    const response = await api.updateCallsTracks(this.publicId, this.subscribeSessionId, {
      tracks: [{
        location: 'remote',
        sessionId: trackInfo.callsSessionId,
        trackName,
      }],
    });

    const result = response?.tracks?.find(
      (t: any) => t.location === 'remote' && t.status !== 'failed' && t.mid
    );
    if (!result?.mid) {
      throw new Error(`Cloudflare Calls did not allocate a receiving mid for ${trackName}`);
    }

    // Map the SFU's receiving mid BEFORE applying the SFU offer, because the
    // browser may fire ontrack as soon as setRemoteDescription completes.
    this.remoteMidMap.set(result.mid, {
      participantId: trackInfo.participantId,
      trackType: trackInfo.trackType,
    });

    if (!response?.sessionDescription) {
      throw new Error(`Cloudflare Calls returned no SDP offer for ${trackName}`);
    }

    if (response.sessionDescription.type !== 'offer') {
      throw new Error(`Expected an SFU offer for ${trackName}, received ${response.sessionDescription.type}`);
    }

    await this.pullPeer.setRemoteDescription(response.sessionDescription);
    const answer = await this.pullPeer.createAnswer();
    await this.pullPeer.setLocalDescription(answer);
    await waitForIceGatheringComplete(this.pullPeer);

    if (!this.pullPeer.localDescription) {
      throw new Error(`No local SDP answer was produced for ${trackName}`);
    }

    await api.renegotiateCallsSession(
      this.publicId,
      this.subscribeSessionId,
      this.pullPeer.localDescription,
    );

    this.subscribedPublications.add(publicationKey);
  }

  setAudioEnabled(enabled: boolean): void {
    if (this.localAudioTrack) this.localAudioTrack.enabled = enabled;
  }

  setVideoEnabled(enabled: boolean): void {
    if (this.localVideoTrack) this.localVideoTrack.enabled = enabled;
  }

  destroy(): void {
    this.localAudioTrack?.stop();
    this.localVideoTrack?.stop();
    this.localScreenTrack?.stop();
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.localScreenTrack = null;
    this.pushPeer?.close();
    this.pullPeer?.close();
    this.pushPeer = null;
    this.pullPeer = null;
    this.remoteStreams.clear();
    this.remoteTracks.clear();
    this.remoteMidMap.clear();
    this.subscribedPublications.clear();
  }
}
