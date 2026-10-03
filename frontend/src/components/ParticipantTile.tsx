import React, { useEffect, useRef } from 'react';
import { RoomParticipantState } from '../lib/types';

interface ParticipantTileProps {
  participant: RoomParticipantState;
  isLocal?: boolean;
  stream?: MediaStream | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isLocal = false,
  stream,
  isPinned = false,
  onTogglePin,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (participant.videoEnabled && stream && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, participant.videoEnabled]);

  const initials = participant.name
    ? participant.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div
      className={`relative w-full h-full bg-slate-900 rounded-xl overflow-hidden border transition-all duration-200 group flex items-center justify-center select-none ${
        participant.speaking
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/50'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Video Stream */}
      {participant.videoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Mute local audio to prevent feedback loop
          className={`w-full h-full object-cover ${isLocal && !participant.screenSharing ? 'transform -scale-x-100' : ''}`}
        />
      ) : (
        /* Camera Off Avatar */
        <div className="flex flex-col items-center justify-center p-4">
          <div
            className={`w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border-2 border-slate-600 flex items-center justify-center text-2xl md:text-3xl font-bold text-white shadow-xl transition-transform ${
              participant.speaking ? 'scale-110 border-emerald-400' : ''
            }`}
          >
            {initials}
          </div>
        </div>
      )}

      {/* Screen Sharing Badge */}
      {participant.screenSharing && (
        <div className="absolute top-3 left-3 bg-amber-500/90 backdrop-blur text-slate-950 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 shadow-md">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span>Sharing Screen</span>
        </div>
      )}

      {/* Pin Button on hover */}
      {onTogglePin && (
        <button
          onClick={onTogglePin}
          className={`absolute top-3 right-3 p-1.5 rounded-lg bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white ${
            isPinned ? 'opacity-100 text-orange-400 border-orange-500/50' : ''
          }`}
          title={isPinned ? 'Unpin' : 'Pin to main view'}
        >
          <svg className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      )}

      {/* Bottom Name & Mic Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-md border border-slate-800/80 flex items-center space-x-2 text-xs font-medium text-white max-w-[85%] truncate">
          <span className="truncate">
            {participant.name} {isLocal && '(You)'}
          </span>
          {participant.role === 'host' && (
            <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase">
              Host
            </span>
          )}
        </div>

        {/* Microphone status icon */}
        <div
          className={`p-1.5 rounded-md backdrop-blur border text-white ${
            participant.audioEnabled
              ? 'bg-slate-900/80 border-slate-700 text-slate-300'
              : 'bg-rose-600/90 border-rose-500 text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {participant.audioEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
