"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MeetingRoom = void 0;
/**
 * Cloudflare Durable Object: MeetingRoom
 *
 * Each meeting has a deterministic Durable Object instance identified by its public ID.
 * The MeetingRoom coordinates ephemeral room state, presence, lobby/waiting room,
 * chat messages, host permissions, and signaling for Cloudflare Calls SFU tracks.
 */
class MeetingRoom {
  // Active WebSocket connections: Map of WebSocket -> participantId
  sockets = new Map();

  // In-room active participants: participantId -> state
  participants = new Map();

  // Waiting room queue: participantId -> state
  waitingQueue = new Map();

  // Ephemeral chat messages in the room
  chatMessages = [];

  // Room Metadata
  meetingPublicId = '';
  meetingTitle = '';
  hostUserId = '';
  settings = {
    waitingRoom: false,
    muteOnJoin: false,
    videoOffOnJoin: false,
    allowScreenShare: true,
    allowChat: true,
    allowFileUploads: true
  };
  isEnded = false;
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Internal initialization / settings sync
    if (url.pathname === '/init' && request.method === 'POST') {
      const data = await request.json();
      this.meetingPublicId = data.publicId || this.meetingPublicId;
      this.meetingTitle = data.title || this.meetingTitle;
      this.hostUserId = data.hostUserId || this.hostUserId;
      if (data.settings) {
        this.settings = {
          ...this.settings,
          ...data.settings
        };
      }
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // 2. Internal meeting end notification
    if (url.pathname === '/end' && request.method === 'POST') {
      this.isEnded = true;
      this.broadcast({
        type: 'meeting_ended'
      });
      for (const socket of this.sockets.keys()) {
        try {
          socket.close(1000, 'Meeting ended by host');
        } catch (_) {}
      }
      this.sockets.clear();
      this.participants.clear();
      this.waitingQueue.clear();
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // 3. Status inspection
    if (url.pathname === '/state' && request.method === 'GET') {
      return new Response(JSON.stringify({
        publicId: this.meetingPublicId,
        title: this.meetingTitle,
        isEnded: this.isEnded,
        participantCount: this.participants.size,
        waitingCount: this.waitingQueue.size,
        participants: Array.from(this.participants.values())
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // 4. WebSocket upgrade for realtime room connection
    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', {
          status: 426
        });
      }
      if (this.isEnded) {
        return new Response('Meeting has already ended', {
          status: 410
        });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleWebSocketSession(server);
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }
    return new Response('Not Found', {
      status: 404
    });
  }

  /**
   * Handle an individual WebSocket connection for a participant.
   */
  handleWebSocketSession(socket) {
    socket.accept();
    let participantId = null;
    socket.addEventListener('message', async event => {
      try {
        const rawData = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg = JSON.parse(rawData);
        switch (msg.type) {
          case 'ping':
            {
              this.sendTo(socket, {
                type: 'pong'
              });
              break;
            }
          case 'join':
            {
              participantId = msg.participantId || crypto.randomUUID();
              this.sockets.set(socket, participantId);
              const isHost = msg.userId === this.hostUserId;
              const role = isHost ? 'host' : 'participant';
              const participantState = {
                participantId,
                userId: msg.userId,
                name: msg.name.trim() || (isHost ? 'Host' : 'Participant'),
                role,
                status: 'in_room',
                audioEnabled: this.settings.muteOnJoin ? false : msg.audioEnabled ?? true,
                videoEnabled: this.settings.videoOffOnJoin ? false : msg.videoEnabled ?? true,
                screenSharing: false,
                speaking: false,
                callsTrackIds: {},
                joinedAt: Date.now()
              };

              // Check Waiting Room / Lobby
              if (this.settings.waitingRoom && !isHost) {
                participantState.status = 'waiting';
                this.waitingQueue.set(participantId, participantState);

                // Notify participant that they are in the waiting room
                this.sendTo(socket, {
                  type: 'waiting_room',
                  message: 'Please wait, the meeting host will let you in soon.'
                });

                // Notify host(s) that someone is waiting
                this.broadcastToHosts({
                  type: 'waiting_participant_joined',
                  participant: participantState
                });
                return;
              }

              // User admitted directly to the room
              this.participants.set(participantId, participantState);

              // Send welcome payload with full room state
              this.sendTo(socket, {
                type: 'welcome',
                participant: participantState,
                participants: Array.from(this.participants.values()),
                waitingParticipants: isHost ? Array.from(this.waitingQueue.values()) : [],
                settings: this.settings,
                meetingTitle: this.meetingTitle
              });

              // Broadcast join to other participants
              this.broadcastExcept(participantId, {
                type: 'participant_joined',
                participant: participantState
              });
              break;
            }
          case 'state_update':
            {
              if (!participantId || !this.participants.has(participantId)) return;
              const current = this.participants.get(participantId);
              if (msg.audioEnabled !== undefined) current.audioEnabled = msg.audioEnabled;
              if (msg.videoEnabled !== undefined) current.videoEnabled = msg.videoEnabled;
              if (msg.screenSharing !== undefined) current.screenSharing = msg.screenSharing;
              if (msg.speaking !== undefined) current.speaking = msg.speaking;
              this.participants.set(participantId, current);
              this.broadcast({
                type: 'participant_updated',
                participant: current
              });
              break;
            }
          case 'calls_session_registered':
            {
              if (!participantId || !this.participants.has(participantId)) return;
              const current = this.participants.get(participantId);
              current.callsSessionId = msg.callsSessionId;
              current.callsTrackIds = {
                ...current.callsTrackIds,
                ...msg.tracks
              };
              this.participants.set(participantId, current);

              // Broadcast published tracks so peers can pull them via Cloudflare Calls SFU
              if (msg.tracks.audio) {
                this.broadcastExcept(participantId, {
                  type: 'track_published',
                  participantId,
                  callsSessionId: msg.callsSessionId,
                  trackType: 'audio',
                  trackId: msg.tracks.audio
                });
              }
              if (msg.tracks.video) {
                this.broadcastExcept(participantId, {
                  type: 'track_published',
                  participantId,
                  callsSessionId: msg.callsSessionId,
                  trackType: 'video',
                  trackId: msg.tracks.video
                });
              }
              if (msg.tracks.screen) {
                this.broadcastExcept(participantId, {
                  type: 'track_published',
                  participantId,
                  callsSessionId: msg.callsSessionId,
                  trackType: 'screen',
                  trackId: msg.tracks.screen
                });
              }
              this.broadcast({
                type: 'participant_updated',
                participant: current
              });
              break;
            }
          case 'chat_message':
            {
              if (!participantId || !this.participants.has(participantId)) return;
              if (!this.settings.allowChat) {
                this.sendTo(socket, {
                  type: 'error',
                  message: 'Chat is disabled for this meeting'
                });
                return;
              }
              const sender = this.participants.get(participantId);
              const sanitizedText = (msg.message || '').trim().slice(0, 1000);
              if (!sanitizedText) return;
              const chatMsg = {
                id: crypto.randomUUID(),
                meetingId: this.meetingPublicId,
                senderId: sender.userId,
                senderName: sender.name,
                message: sanitizedText,
                timestamp: Date.now()
              };
              this.chatMessages.push(chatMsg);
              if (this.chatMessages.length > 200) {
                this.chatMessages.shift(); // Keep last 200 messages in memory
              }

              this.broadcast({
                type: 'chat_message',
                message: chatMsg
              });
              break;
            }

          // ===== Host Controls =====

          case 'admit_participant':
            {
              if (!participantId || !this.isHost(participantId)) return;
              const target = this.waitingQueue.get(msg.targetParticipantId);
              if (!target) return;
              this.waitingQueue.delete(msg.targetParticipantId);
              target.status = 'in_room';
              this.participants.set(msg.targetParticipantId, target);

              // Find target's socket
              const targetSocket = this.findSocketByParticipantId(msg.targetParticipantId);
              if (targetSocket) {
                this.sendTo(targetSocket, {
                  type: 'admitted',
                  participants: Array.from(this.participants.values()),
                  settings: this.settings
                });
              }
              this.broadcast({
                type: 'participant_joined',
                participant: target
              });
              break;
            }
          case 'deny_participant':
            {
              if (!participantId || !this.isHost(participantId)) return;
              const target = this.waitingQueue.get(msg.targetParticipantId);
              if (!target) return;
              this.waitingQueue.delete(msg.targetParticipantId);
              const targetSocket = this.findSocketByParticipantId(msg.targetParticipantId);
              if (targetSocket) {
                this.sendTo(targetSocket, {
                  type: 'denied',
                  reason: 'The host has denied entry to the meeting.'
                });
                try {
                  targetSocket.close(1000, 'Denied by host');
                } catch (_) {}
                this.sockets.delete(targetSocket);
              }
              this.broadcastToHosts({
                type: 'waiting_participant_left',
                participantId: msg.targetParticipantId
              });
              break;
            }
          case 'mute_participant':
            {
              if (!participantId || !this.isHost(participantId)) return;
              const target = this.participants.get(msg.targetParticipantId);
              if (!target) return;
              target.audioEnabled = false;
              target.speaking = false;
              this.participants.set(msg.targetParticipantId, target);
              const targetSocket = this.findSocketByParticipantId(msg.targetParticipantId);
              if (targetSocket) {
                this.sendTo(targetSocket, {
                  type: 'host_muted_you'
                });
              }
              this.broadcast({
                type: 'participant_updated',
                participant: target
              });
              break;
            }
          case 'remove_participant':
            {
              if (!participantId || !this.isHost(participantId)) return;
              const target = this.participants.get(msg.targetParticipantId);
              if (!target) return;
              const targetSocket = this.findSocketByParticipantId(msg.targetParticipantId);
              if (targetSocket) {
                this.sendTo(targetSocket, {
                  type: 'removed_by_host',
                  reason: 'You were removed from the meeting by the host.'
                });
                try {
                  targetSocket.close(1000, 'Removed by host');
                } catch (_) {}
                this.sockets.delete(targetSocket);
              }
              this.participants.delete(msg.targetParticipantId);
              this.broadcast({
                type: 'participant_left',
                participantId: msg.targetParticipantId
              });
              break;
            }
          case 'end_meeting':
            {
              if (!participantId || !this.isHost(participantId)) return;
              this.isEnded = true;
              this.broadcast({
                type: 'meeting_ended'
              });
              for (const sock of this.sockets.keys()) {
                try {
                  sock.close(1000, 'Meeting ended by host');
                } catch (_) {}
              }
              this.sockets.clear();
              this.participants.clear();
              this.waitingQueue.clear();
              break;
            }
        }
      } catch (err) {
        this.sendTo(socket, {
          type: 'error',
          message: err.message || 'Invalid message format'
        });
      }
    });
    const cleanup = () => {
      if (!participantId) return;
      this.sockets.delete(socket);
      if (this.participants.has(participantId)) {
        this.participants.delete(participantId);
        this.broadcast({
          type: 'participant_left',
          participantId
        });
      } else if (this.waitingQueue.has(participantId)) {
        this.waitingQueue.delete(participantId);
        this.broadcastToHosts({
          type: 'waiting_participant_left',
          participantId
        });
      }
    };
    socket.addEventListener('close', cleanup);
    socket.addEventListener('error', cleanup);
  }
  isHost(participantId) {
    const p = this.participants.get(participantId);
    return Boolean(p && p.role === 'host');
  }
  findSocketByParticipantId(participantId) {
    for (const [sock, id] of this.sockets.entries()) {
      if (id === participantId) return sock;
    }
    return undefined;
  }
  sendTo(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch (_) {}
  }
  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(serialized);
      } catch (_) {}
    }
  }
  broadcastExcept(excludedParticipantId, message) {
    const serialized = JSON.stringify(message);
    for (const [socket, id] of this.sockets.entries()) {
      if (id !== excludedParticipantId) {
        try {
          socket.send(serialized);
        } catch (_) {}
      }
    }
  }
  broadcastToHosts(message) {
    const serialized = JSON.stringify(message);
    for (const [socket, id] of this.sockets.entries()) {
      const p = this.participants.get(id);
      if (p && p.role === 'host') {
        try {
          socket.send(serialized);
        } catch (_) {}
      }
    }
  }
}
exports.MeetingRoom = MeetingRoom;