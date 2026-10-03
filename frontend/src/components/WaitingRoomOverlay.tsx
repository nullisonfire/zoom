import React from 'react';

interface WaitingRoomOverlayProps {
  meetingTitle: string;
  message?: string;
  onLeave: () => void;
}

export const WaitingRoomOverlay: React.FC<WaitingRoomOverlayProps> = ({
  meetingTitle,
  message = 'Please wait, the meeting host will let you in soon.',
  onLeave,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center animate-pulse">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white mb-2">{meetingTitle}</h2>
          <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
        </div>

        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>Waiting for host admission...</span>
        </div>

        <button
          onClick={onLeave}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm"
        >
          Leave Meeting
        </button>
      </div>
    </div>
  );
};
