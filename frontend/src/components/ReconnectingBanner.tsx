import React from 'react';

interface ReconnectingBannerProps {
  isReconnecting: boolean;
}

export const ReconnectingBanner: React.FC<ReconnectingBannerProps> = ({ isReconnecting }) => {
  if (!isReconnecting) return null;

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-amber-500 text-slate-950 px-5 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center space-x-2 animate-bounce">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <span>Connection lost. Reconnecting to meeting...</span>
    </div>
  );
};
