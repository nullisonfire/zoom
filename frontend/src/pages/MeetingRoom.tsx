import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Meeting } from '../lib/types';
import { DevicePreview } from '../components/DevicePreview';
import { VideoGrid } from '../components/VideoGrid';
import { ControlBar } from '../components/ControlBar';
import { ChatPanel } from '../components/ChatPanel';
import { ParticipantsPanel } from '../components/ParticipantsPanel';
import { FilesPanel } from '../components/FilesPanel';
import { WaitingRoomOverlay } from '../components/WaitingRoomOverlay';
import { ReconnectingBanner } from '../components/ReconnectingBanner';
import { useRoomWebSocket } from '../hooks/useRoomWebSocket';
import { CallsWebRTCClient } from '../lib/callsClient';

interface MeetingRoomProps {
  publicId: string;
  onLeave: () => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ publicId, onLeave }) => {
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-join vs In-Meeting stage
  const [joined, setJoined] = useState(false);
  const [initialAudio, setInitialAudio] = useState(true);
  const [initialVideo, setInitialVideo] = useState(true);
  const [joinPassword, setJoinPassword] = useState<string | undefined>(undefined);
  const [guestName, setGuestName] = useState('Guest');

  // Active side panel
  const [activePanel, setActivePanel] = useState<'participants' | 'chat' | 'files' | null>(null);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'speaker'>('grid');
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Local media stream & screen share
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // WebRTC Calls Client Ref
  const callsClientRef = useRef<CallsWebRTCClient | null>(null);

  // Fetch meeting metadata
  useEffect(() => {
    let isMounted = true;
    api
      .getMeeting(publicId)
      .then((res) => {
        if (isMounted) {
          setMeeting(res.meeting);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Could not load meeting');
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [publicId]);

  // Handle incoming remote WebRTC track from Cloudflare Calls SFU
  const handleRemoteTrackPublished = useCallback(
    async (trackInfo: {
      participantId: string;
      callsSessionId: string;
      trackType: 'audio' | 'video' | 'screen';
      trackId: string;
    }) => {
      if (callsClientRef.current) {
        await callsClientRef.current.subscribeToTrack(trackInfo);
      }
    },
    []
  );

  // Connect to Durable Object room WebSocket
  const {
    isConnected,
    isReconnecting,
    isInWaitingRoom,
    waitingRoomMessage,
    myParticipant,
    participants,
    waitingParticipants,
    chatMessages,
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
  } = useRoomWebSocket({
    publicId,
    userId: user?.id || 'guest',
    userName: user?.name || guestName || 'Guest',
    initialAudioEnabled: initialAudio,
    initialVideoEnabled: initialVideo,
    password: joinPassword,
    enabled: joined,
    onTrackPublished: handleRemoteTrackPublished,
  });

  // Track unread chat messages when chat panel is closed
  useEffect(() => {
    if (activePanel !== 'chat' && chatMessages.length > 0) {
      setUnreadChatCount((prev) => prev + 1);
    }
  }, [chatMessages, activePanel]);

  // Reset unread chat when opening chat panel
  const handleTogglePanel = (panel: 'participants' | 'chat' | 'files') => {
    if (activePanel === panel) {
      setActivePanel(null);
    } else {
      setActivePanel(panel);
      if (panel === 'chat') {
        setUnreadChatCount(0);
      }
    }
  };

  // Called when user clicks "Join Meeting" from preview
  const handlePreJoinConfirm = async (options: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    password?: string;
    stream: MediaStream | null;
    name: string;
  }) => {
    try {
      setInitialAudio(options.audioEnabled);
      setInitialVideo(options.videoEnabled);
      setJoinPassword(options.password);
      setGuestName(options.name || 'Guest');
      setLocalStream(options.stream);

      // Verify password and authorize the guest/registered participant for the meeting.
      await api.joinMeeting(publicId, options.password, options.name);

      // Initialize Cloudflare Calls WebRTC client
      const callsClient = new CallsWebRTCClient(publicId);
      callsClientRef.current = callsClient;

      callsClient.setCallbacks({
        onRemoteTrack: (participantId, stream) => {
          setRemoteStreams((prev) => new Map(prev).set(participantId, stream));
        },
        onRemoteTrackRemoved: (participantId) => {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(participantId);
            return next;
          });
        },
      });

      const callsSessionId = await callsClient.init();

      // Publish local media stream tracks to Cloudflare Calls SFU
      if (options.stream) {
        const publishedTracks = await callsClient.publishLocalTracks(options.stream);
        registerCallsSession(callsSessionId, publishedTracks);
      }

      setJoined(true);
    } catch (err: any) {
      alert(err.message || 'Could not join meeting');
    }
  };

  // Control Bar action: Toggle Microphone
  const handleToggleAudio = () => {
    if (!myParticipant) return;
    const next = !myParticipant.audioEnabled;

    if (callsClientRef.current) {
      callsClientRef.current.setAudioEnabled(next);
    }
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    }
    updateState({ audioEnabled: next });
  };

  // Control Bar action: Toggle Camera
  const handleToggleVideo = () => {
    if (!myParticipant) return;
    const next = !myParticipant.videoEnabled;

    if (callsClientRef.current) {
      callsClientRef.current.setVideoEnabled(next);
    }
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    }
    updateState({ videoEnabled: next });
  };

  // Control Bar action: Toggle Screen Share
  const handleToggleScreenShare = async () => {
    if (!myParticipant) return;

    if (myParticipant.screenSharing) {
      // Stop screen sharing
      if (screenTrack) {
        screenTrack.stop();
        setScreenTrack(null);
      }
      if (callsClientRef.current) {
        await callsClientRef.current.unpublishScreenTrack();
      }
      updateState({ screenSharing: false });
    } else {
      // Start screen sharing via getDisplayMedia
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const track = displayStream.getVideoTracks()[0];
        setScreenTrack(track);

        if (callsClientRef.current) {
          await callsClientRef.current.publishScreenTrack(track);
        }

        updateState({ screenSharing: true });

        track.onended = () => {
          setScreenTrack(null);
          if (callsClientRef.current) {
            callsClientRef.current.unpublishScreenTrack();
          }
          updateState({ screenSharing: false });
        };
      } catch (err) {
        console.warn('Screen share canceled or failed:', err);
      }
    }
  };

  // End meeting for everyone (Host Only)
  const handleEndMeetingForAll = async () => {
    if (window.confirm('Are you sure you want to end the meeting for all participants?')) {
      try {
        await api.endMeeting(publicId);
        endMeeting();
      } catch (err: any) {
        alert(err.message || 'Failed to end meeting');
      }
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (callsClientRef.current) {
        callsClientRef.current.destroy();
        callsClientRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (screenTrack) {
        screenTrack.stop();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400 text-sm font-medium">Connecting to Cloudflare Meet...</span>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Meeting Unavailable</h2>
          <p className="text-slate-400 text-sm">{error || 'This meeting does not exist or has ended.'}</p>
          <button
            onClick={onLeave}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Pre-Join Device Preview
  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center py-10">
        <DevicePreview
          meeting={meeting}
          userName={user?.name || guestName || 'Guest'}
          canEditName={!Boolean(user)}
          onJoin={handlePreJoinConfirm}
          onCancel={onLeave}
        />
      </div>
    );
  }

  // Waiting Room state
  if (isInWaitingRoom) {
    return (
      <WaitingRoomOverlay
        meetingTitle={meeting.title}
        message={waitingRoomMessage}
        onLeave={onLeave}
      />
    );
  }

  // Ended or Removed Overlays
  if (hasEnded) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 z-50">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 text-orange-400 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Meeting Ended</h2>
          <p className="text-slate-400 text-sm">The host has ended this meeting for all participants.</p>
          <button
            onClick={onLeave}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (removedReason) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 z-50">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Disconnected</h2>
          <p className="text-slate-400 text-sm">{removedReason}</p>
          <button
            onClick={onLeave}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-sm"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Main In-Meeting Interface
  const isHost = myParticipant?.role === 'host';

  return (
    <div className="relative h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Reconnecting banner if network drops */}
      <ReconnectingBanner isReconnecting={isReconnecting} />

      {/* Main Video Stage & Side Panels */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 h-full overflow-hidden flex items-center justify-center">
          {myParticipant ? (
            <VideoGrid
              myParticipant={myParticipant}
              myStream={localStream}
              remoteParticipants={participants}
              remoteStreams={remoteStreams}
              layoutMode={layoutMode}
            />
          ) : (
            <div className="text-slate-500 text-sm">Joining room...</div>
          )}
        </main>

        {/* Side Drawers */}
        {activePanel === 'chat' && (
          <ChatPanel
            messages={chatMessages}
            currentUserId={user?.id || ''}
            onSendMessage={sendChatMessage}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'participants' && myParticipant && (
          <ParticipantsPanel
            myParticipant={myParticipant}
            participants={participants}
            waitingParticipants={waitingParticipants}
            isHost={isHost}
            onAdmit={admitParticipant}
            onDeny={denyParticipant}
            onMute={muteParticipant}
            onRemove={removeParticipant}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'files' && (
          <FilesPanel meetingPublicId={publicId} onClose={() => setActivePanel(null)} canUpload={Boolean(user)} />
        )}
      </div>

      {/* Bottom Control Bar */}
      <ControlBar
        meetingTitle={meeting.title}
        meetingPublicId={meeting.public_id}
        audioEnabled={myParticipant?.audioEnabled ?? false}
        videoEnabled={myParticipant?.videoEnabled ?? false}
        screenSharing={myParticipant?.screenSharing ?? false}
        layoutMode={layoutMode}
        isHost={isHost}
        participantsCount={participants.length + 1}
        unreadChatCount={unreadChatCount}
        activePanel={activePanel}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleLayout={() => setLayoutMode((prev) => (prev === 'grid' ? 'speaker' : 'grid'))}
        onTogglePanel={handleTogglePanel}
        onOpenSettings={() => alert('Device settings available in pre-join preview and browser permissions')}
        onLeaveMeeting={onLeave}
        onEndMeetingForAll={isHost ? handleEndMeetingForAll : undefined}
      />
    </div>
  );
};
