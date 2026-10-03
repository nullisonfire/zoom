import React from 'react';
import { RoomParticipantState } from '../lib/types';

interface ParticipantsPanelProps {
  myParticipant: RoomParticipantState;
  participants: RoomParticipantState[];
  waitingParticipants: RoomParticipantState[];
  isHost: boolean;
  onAdmit: (participantId: string) => void;
  onDeny: (participantId: string) => void;
  onMute: (participantId: string) => void;
  onRemove: (participantId: string) => void;
  onClose: () => void;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  myParticipant,
  participants,
  waitingParticipants,
  isHost,
  onAdmit,
  onDeny,
  onMute,
  onRemove,
  onClose,
}) => {
  const allInRoom = [myParticipant, ...participants];

  return (
    <div className="w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-10 shadow-2xl">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="font-bold text-white text-base">Participants ({allInRoom.length})</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Waiting Room Section (Host Only) */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Waiting Room ({waitingParticipants.length})
              </span>
            </div>
            <div className="divide-y divide-amber-500/10">
              {waitingParticipants.map((wp) => (
                <div key={wp.participantId} className="pt-2 pb-2 first:pt-0 last:pb-0 flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate max-w-[140px]">{wp.name}</span>
                  <div className="flex space-x-1.5">
                    <button
                      onClick={() => onAdmit(wp.participantId)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                    >
                      Admit
                    </button>
                    <button
                      onClick={() => onDeny(wp.participantId)}
                      className="bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* In-Meeting Participants List */}
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
            In Meeting
          </span>
          <div className="space-y-1.5">
            {allInRoom.map((p) => {
              const isMe = p.participantId === myParticipant.participantId;

              return (
                <div
                  key={p.participantId}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <span className="text-sm font-medium text-slate-200 block truncate">
                        {p.name} {isMe && '(You)'}
                      </span>
                      {p.role === 'host' && (
                        <span className="text-[10px] text-orange-400 font-semibold block">Meeting Host</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Audio Status */}
                    <div
                      className={`p-1 rounded ${
                        p.audioEnabled ? 'text-slate-400' : 'text-rose-400 bg-rose-500/10'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {p.audioEnabled ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        )}
                      </svg>
                    </div>

                    {/* Video Status */}
                    <div
                      className={`p-1 rounded ${
                        p.videoEnabled ? 'text-slate-400' : 'text-rose-400 bg-rose-500/10'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {p.videoEnabled ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        )}
                      </svg>
                    </div>

                    {/* Host Action Buttons */}
                    {isHost && !isMe && (
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.audioEnabled && (
                          <button
                            onClick={() => onMute(p.participantId)}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                            title="Mute participant"
                          >
                            Mute
                          </button>
                        )}
                        <button
                          onClick={() => onRemove(p.participantId)}
                          className="text-[11px] bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white px-2 py-0.5 rounded border border-rose-800/40"
                          title="Remove participant from meeting"
                        >
                          Kick
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
