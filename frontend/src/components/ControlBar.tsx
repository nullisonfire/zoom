import React, { useState } from 'react';

interface ControlBarProps {
  meetingTitle: string;
  meetingPublicId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  layoutMode: 'grid' | 'speaker';
  isHost: boolean;
  participantsCount: number;
  unreadChatCount: number;
  activePanel: 'participants' | 'chat' | 'files' | null;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleLayout: () => void;
  onTogglePanel: (panel: 'participants' | 'chat' | 'files') => void;
  onOpenSettings: () => void;
  onLeaveMeeting: () => void;
  onEndMeetingForAll?: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  meetingTitle,
  meetingPublicId,
  audioEnabled,
  videoEnabled,
  screenSharing,
  layoutMode,
  isHost,
  participantsCount,
  unreadChatCount,
  activePanel,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleLayout,
  onTogglePanel,
  onOpenSettings,
  onLeaveMeeting,
  onEndMeetingForAll,
}) => {
  const [copied, setCopied] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

  const copyInviteLink = () => {
    const url = `${window.location.origin}/meeting/${meetingPublicId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer className="h-20 bg-slate-900 border-t border-slate-800 px-4 md:px-6 flex items-center justify-between z-20 select-none">
      {/* Left: Meeting Info & Copy Link */}
      <div className="hidden lg:flex items-center space-x-3 min-w-[200px]">
        <div>
          <h2 className="text-white font-semibold text-sm truncate max-w-[180px]">{meetingTitle}</h2>
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span className="font-mono text-slate-300">{meetingPublicId}</span>
            <button
              onClick={copyInviteLink}
              className="text-orange-400 hover:text-orange-300 transition-colors flex items-center space-x-1"
              title="Copy meeting link"
            >
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Center: Main Controls */}
      <div className="flex items-center space-x-2 md:space-x-3 mx-auto">
        {/* Microphone */}
        <button
          onClick={onToggleAudio}
          className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            audioEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-500/50'
          }`}
          title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {audioEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            )}
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">{audioEnabled ? 'Mute' : 'Unmute'}</span>
        </button>

        {/* Camera */}
        <button
          onClick={onToggleVideo}
          className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            videoEnabled
              ? 'bg-slate-800 hover:bg-slate-700 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-500/50'
          }`}
          title={videoEnabled ? 'Stop Video' : 'Start Video'}
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {videoEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            )}
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">{videoEnabled ? 'Stop Cam' : 'Start Cam'}</span>
        </button>

        {/* Screen Share */}
        <button
          onClick={onToggleScreenShare}
          className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            screenSharing
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-500/50'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title={screenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">{screenSharing ? 'Sharing' : 'Share'}</span>
        </button>

        {/* Layout Toggle */}
        <button
          onClick={onToggleLayout}
          className="flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all shadow-md"
          title={`Switch to ${layoutMode === 'grid' ? 'Speaker' : 'Grid'} view`}
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {layoutMode === 'grid' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            )}
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">{layoutMode === 'grid' ? 'Grid' : 'Speaker'}</span>
        </button>

        <div className="h-8 w-px bg-slate-800 my-auto hidden sm:block" />

        {/* Participants Panel Button */}
        <button
          onClick={() => onTogglePanel('participants')}
          className={`relative flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            activePanel === 'participants'
              ? 'bg-orange-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title="Participants"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">People</span>
          <span className="absolute -top-1 -right-1 bg-slate-900 border border-slate-700 text-orange-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
            {participantsCount}
          </span>
        </button>

        {/* Chat Panel Button */}
        <button
          onClick={() => onTogglePanel('chat')}
          className={`relative flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            activePanel === 'chat'
              ? 'bg-orange-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title="Chat"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">Chat</span>
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full animate-bounce">
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Files Panel Button */}
        <button
          onClick={() => onTogglePanel('files')}
          className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all shadow-md ${
            activePanel === 'files'
              ? 'bg-orange-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title="Shared Files"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">Files</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all shadow-md"
          title="Audio & Video Settings"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] mt-0.5 font-medium">Settings</span>
        </button>
      </div>

      {/* Right: Leave / End Meeting */}
      <div className="flex items-center min-w-[120px] justify-end relative">
        <button
          onClick={() => {
            if (isHost && onEndMeetingForAll) {
              setShowEndDialog(true);
            } else {
              onLeaveMeeting();
            }
          }}
          className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-md shadow-rose-600/20 text-sm flex items-center space-x-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{isHost ? 'End' : 'Leave'}</span>
        </button>

        {/* Host End Dialog */}
        {showEndDialog && (
          <div className="absolute right-0 bottom-full mb-3 w-56 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl space-y-1">
            <button
              onClick={() => {
                setShowEndDialog(false);
                if (onEndMeetingForAll) onEndMeetingForAll();
              }}
              className="w-full text-left px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
            >
              End Meeting for All
            </button>
            <button
              onClick={() => {
                setShowEndDialog(false);
                onLeaveMeeting();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-700 text-slate-200 text-xs font-medium"
            >
              Leave Meeting Only
            </button>
            <button
              onClick={() => setShowEndDialog(false)}
              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-700 text-slate-400 text-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </footer>
  );
};
