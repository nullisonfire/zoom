import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RoomParticipantState,
  ChatMessage,
  MeetingSettings,
  ClientMessage,
  ServerMessage,
} from '../lib/types';

interface UseRoomWebSocketProps {
  publicId: string;
  userId: string;
  userName: string;
  initialAudioEnabled: boolean;
  initialVideoEnabled: boolean;
  password?: string;
  onTrackPublished?: (trackInfo: {
    participantId: string;
    callsSessionId: string;
    trackType: 'audio' | 'video' | 'screen';
    trackId: string;
  }) => void;
}

export function useRoomWebSocket({
  publicId,
  userId,
  userName,
  initialAudioEnabled,
  initialVideoEnabled,
  password,
  onTrackPublished,
}: UseRoomWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  const [waitingRoomMessage, setWaitingRoomMessage] = useState('Waiting for host admission...');
  const [myParticipant, setMyParticipant] = useState<RoomParticipantState | null>(null);
  const [participants, setParticipants] = useState<RoomParticipantState[]>([]);
  const [waitingParticipants, setWaitingParticipants] = useState<RoomParticipantState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<MeetingSettings | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [hasEnded, setHasEnded] = useState(false);
  const [removedReason, setRemovedReason] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef(0);
  const isDestroyedRef = useRef(false);
  const participantIdRef = useRef(crypto.randomUUID());

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (isDestroyedRef.current) return;

    // Clean up existing socket
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (_) {}
      socketRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/rooms/${publicId}/websocket`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;

      // Start ping heartbeat
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);

      // Send join request
      sendMessage({
        type: 'join',
        participantId: participantIdRef.current,
        userId,
        name: userName,
        audioEnabled: initialAudioEnabled,
        videoEnabled: initialVideoEnabled,
        password,
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;

        switch (msg.type) {
          case 'welcome': {
            setMyParticipant(msg.participant);
            // Filter out self from others list
            setParticipants(msg.participants.filter((p) => p.participantId !== msg.participant.participantId));
            setWaitingParticipants(msg.waitingParticipants || []);
            setSettings(msg.settings);
            setMeetingTitle(msg.meetingTitle);
            setIsInWaitingRoom(false);
            break;
          }

          case 'waiting_room': {
            setIsInWaitingRoom(true);
            setWaitingRoomMessage(msg.message);
            break;
          }

          case 'admitted': {
            setIsInWaitingRoom(false);
            setParticipants(msg.participants.filter((p) => p.participantId !== participantIdRef.current));
            if (msg.settings) setSettings(msg.settings);
            break;
          }

          case 'denied': {
            setIsInWaitingRoom(false);
            setRemovedReason(msg.reason || 'Entry was denied by the meeting host.');
            break;
          }

          case 'participant_joined': {
            setParticipants((prev) => {
              if (prev.some((p) => p.participantId === msg.participant.participantId)) return prev;
              return [...prev, msg.participant];
            });
            break;
          }

          case 'participant_updated': {
            if (msg.participant.participantId === participantIdRef.current) {
              setMyParticipant(msg.participant);
            } else {
              setParticipants((prev) =>
                prev.map((p) => (p.participantId === msg.participant.participantId ? msg.participant : p))
              );
            }
            break;
          }

          case 'participant_left': {
            setParticipants((prev) => prev.filter((p) => p.participantId !== msg.participantId));
            break;
          }

          case 'waiting_participant_joined': {
            setWaitingParticipants((prev) => {
              if (prev.some((p) => p.participantId === msg.participant.participantId)) return prev;
              return [...prev, msg.participant];
            });
            break;
          }

          case 'waiting_participant_left': {
            setWaitingParticipants((prev) => prev.filter((p) => p.participantId !== msg.participantId));
            break;
          }

          case 'chat_message': {
            setChatMessages((prev) => [...prev, msg.message]);
            break;
          }

          case 'host_muted_you': {
            setMyParticipant((prev) => (prev ? { ...prev, audioEnabled: false, speaking: false } : null));
            break;
          }

          case 'removed_by_host': {
            setRemovedReason(msg.reason);
            break;
          }

          case 'meeting_ended': {
            setHasEnded(true);
            break;
          }

          case 'track_published': {
            if (onTrackPublished) {
              onTrackPublished(msg);
            }
            break;
          }

          case 'pong':
            break;
        }
      } catch (err) {
        console.warn('[useRoomWebSocket] Failed to parse server message:', err);
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      if (isDestroyedRef.current || hasEnded || removedReason) {
        return;
      }

      // Reconnection with backoff
      if (reconnectAttemptsRef.current < 8) {
        setIsReconnecting(true);
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [publicId, userId, userName, initialAudioEnabled, initialVideoEnabled, password, hasEnded, removedReason, sendMessage, onTrackPublished]);

  useEffect(() => {
    isDestroyedRef.current = false;
    connect();

    return () => {
      isDestroyedRef.current = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Actions
  const updateState = useCallback(
    (updates: { audioEnabled?: boolean; videoEnabled?: boolean; screenSharing?: boolean; speaking?: boolean }) => {
      sendMessage({ type: 'state_update', ...updates });
      setMyParticipant((prev) => (prev ? { ...prev, ...updates } : null));
    },
    [sendMessage]
  );

  const sendChatMessage = useCallback(
    (message: string) => {
      sendMessage({ type: 'chat_message', message });
    },
    [sendMessage]
  );

  const admitParticipant = useCallback(
    (targetParticipantId: string) => {
      sendMessage({ type: 'admit_participant', targetParticipantId });
      setWaitingParticipants((prev) => prev.filter((p) => p.participantId !== targetParticipantId));
    },
    [sendMessage]
  );

  const denyParticipant = useCallback(
    (targetParticipantId: string) => {
      sendMessage({ type: 'deny_participant', targetParticipantId });
      setWaitingParticipants((prev) => prev.filter((p) => p.participantId !== targetParticipantId));
    },
    [sendMessage]
  );

  const muteParticipant = useCallback(
    (targetParticipantId: string) => {
      sendMessage({ type: 'mute_participant', targetParticipantId });
    },
    [sendMessage]
  );

  const removeParticipant = useCallback(
    (targetParticipantId: string) => {
      sendMessage({ type: 'remove_participant', targetParticipantId });
    },
    [sendMessage]
  );

  const endMeeting = useCallback(() => {
    sendMessage({ type: 'end_meeting' });
    setHasEnded(true);
  }, [sendMessage]);

  const registerCallsSession = useCallback(
    (callsSessionId: string, tracks: { audio?: string; video?: string; screen?: string }) => {
      sendMessage({ type: 'calls_session_registered', callsSessionId, tracks });
    },
    [sendMessage]
  );

  return {
    isConnected,
    isReconnecting,
    isInWaitingRoom,
    waitingRoomMessage,
    myParticipant,
    participants,
    waitingParticipants,
    chatMessages,
    settings,
    meetingTitle,
    hasEnded,
    removedReason,
    updateState,
    sendChatMessage,
    admitParticipant,
    denyParticipant,
    muteParticipant,
    removeParticipant,
    endMeeting,
    registerCallsSession,
  };
}
