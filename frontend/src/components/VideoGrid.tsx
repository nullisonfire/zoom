import React, { useState } from 'react';
import { RoomParticipantState } from '../lib/types';
import { ParticipantTile } from './ParticipantTile';

interface VideoGridProps {
  myParticipant: RoomParticipantState;
  myStream: MediaStream | null;
  remoteParticipants: RoomParticipantState[];
  remoteStreams: Map<string, MediaStream>;
  layoutMode: 'grid' | 'speaker';
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  myParticipant,
  myStream,
  remoteParticipants,
  remoteStreams,
  layoutMode,
}) => {
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);

  // All participants in the meeting (local + remote)
  const allParticipants = [myParticipant, ...remoteParticipants];

  // Helper to get stream for a participant
  const getStream = (p: RoomParticipantState): MediaStream | null => {
    if (p.participantId === myParticipant.participantId) {
      return myStream;
    }
    return remoteStreams.get(p.participantId) || null;
  };

  // Determine active speaker or pinned participant for speaker layout
  const pinnedParticipant =
    allParticipants.find((p) => p.participantId === pinnedParticipantId) ||
    allParticipants.find((p) => p.speaking) ||
    remoteParticipants[0] ||
    myParticipant;

  const otherParticipants = allParticipants.filter(
    (p) => p.participantId !== pinnedParticipant.participantId
  );

  // Compute CSS grid classes based on total participant count
  const getGridClasses = (count: number): string => {
    if (count === 1) return 'grid-cols-1 max-w-4xl max-h-[85vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    if (count <= 9) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-4';
  };

  if (layoutMode === 'speaker' && allParticipants.length > 1) {
    return (
      <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
        {/* Main Stage */}
        <div className="flex-1 h-full min-h-[350px]">
          <ParticipantTile
            participant={pinnedParticipant}
            isLocal={pinnedParticipant.participantId === myParticipant.participantId}
            stream={getStream(pinnedParticipant)}
            isPinned={Boolean(pinnedParticipantId)}
            onTogglePin={() =>
              setPinnedParticipantId(
                pinnedParticipantId === pinnedParticipant.participantId ? null : pinnedParticipant.participantId
              )
            }
          />
        </div>

        {/* Thumbnail Filmstrip */}
        <div className="w-full md:w-64 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto max-h-full pb-2 md:pb-0">
          {otherParticipants.map((p) => (
            <div key={p.participantId} className="w-48 md:w-full aspect-video flex-shrink-0 cursor-pointer">
              <ParticipantTile
                participant={p}
                isLocal={p.participantId === myParticipant.participantId}
                stream={getStream(p)}
                isPinned={false}
                onTogglePin={() => setPinnedParticipantId(p.participantId)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Grid View
  return (
    <div className="w-full h-full p-4 flex items-center justify-center overflow-auto">
      <div className={`grid gap-4 w-full h-full items-center justify-center ${getGridClasses(allParticipants.length)}`}>
        {allParticipants.map((p) => (
          <div key={p.participantId} className="aspect-video w-full h-full max-h-[75vh]">
            <ParticipantTile
              participant={p}
              isLocal={p.participantId === myParticipant.participantId}
              stream={getStream(p)}
              isPinned={p.participantId === pinnedParticipantId}
              onTogglePin={() =>
                setPinnedParticipantId(p.participantId === pinnedParticipantId ? null : p.participantId)
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
};
