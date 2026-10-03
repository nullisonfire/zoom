import React from 'react';
import { useAuth } from '../hooks/useAuth';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate }) => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onNavigate('dashboard')}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
            Cloudflare Meet
          </span>
          <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
            Realtime SFU
          </span>
        </div>
      </div>

      {user && (
        <nav className="flex items-center space-x-6">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`text-sm font-medium transition-colors ${
              currentView === 'dashboard' ? 'text-orange-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onNavigate('meetings')}
            className={`text-sm font-medium transition-colors ${
              currentView === 'meetings' ? 'text-orange-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            History & Schedule
          </button>
          <button
            onClick={() => onNavigate('profile')}
            className={`text-sm font-medium transition-colors ${
              currentView === 'profile' ? 'text-orange-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Profile
          </button>

          <div className="flex items-center pl-4 border-l border-slate-800 space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-200">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-slate-300 hidden md:inline">{user.name}</span>
            <button
              onClick={() => logout()}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
            >
              Sign out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
};
