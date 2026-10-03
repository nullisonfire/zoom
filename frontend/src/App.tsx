import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { MeetingsList } from './pages/MeetingsList';
import { Profile } from './pages/Profile';
import { MeetingRoom } from './pages/MeetingRoom';

function MainRouter() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'meetings' | 'profile' | 'meeting' | 'login' | 'register'>('dashboard');
  const [activeMeetingPublicId, setActiveMeetingPublicId] = useState<string | null>(null);

  // Parse path on initial load
  useEffect(() => {
    const path = window.location.pathname;
    const meetingMatch = path.match(/^\/meeting\/([a-zA-Z0-9_-]+)$/);

    if (meetingMatch) {
      setActiveMeetingPublicId(meetingMatch[1]);
      setCurrentView('meeting');
    } else if (path === '/register') {
      setCurrentView('register');
    } else if (path === '/login') {
      setCurrentView('login');
    } else if (path === '/meetings') {
      setCurrentView('meetings');
    } else if (path === '/profile') {
      setCurrentView('profile');
    } else {
      setCurrentView('dashboard');
    }
  }, []);

  const navigate = (view: string, meetingId?: string) => {
    if (view === 'meeting' && meetingId) {
      setActiveMeetingPublicId(meetingId);
      setCurrentView('meeting');
      window.history.pushState({}, '', `/meeting/${meetingId}`);
    } else {
      setActiveMeetingPublicId(null);
      setCurrentView(view as any);
      window.history.pushState({}, '', view === 'dashboard' ? '/' : `/${view}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400 text-sm font-medium">Initializing Cloudflare Meet...</span>
        </div>
      </div>
    );
  }

  // Meeting view can be accessed by authenticated users or guests
  if (currentView === 'meeting' && activeMeetingPublicId) {
    return (
      <MeetingRoom
        publicId={activeMeetingPublicId}
        onLeave={() => navigate('dashboard')}
      />
    );
  }

  // If not logged in, show Auth views
  if (!user) {
    if (currentView === 'register') {
      return <Register onNavigate={(v) => navigate(v)} />;
    }
    return <Login onNavigate={(v) => navigate(v)} />;
  }

  // Authenticated Main App
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100">
      <Header currentView={currentView} onNavigate={(v) => navigate(v)} />

      <main className="flex-1">
        {currentView === 'dashboard' && (
          <Dashboard
            onJoinMeeting={(publicId) => navigate('meeting', publicId)}
            onNavigate={(v) => navigate(v)}
          />
        )}

        {currentView === 'meetings' && (
          <MeetingsList
            onJoinMeeting={(publicId) => navigate('meeting', publicId)}
            onNavigate={(v) => navigate(v)}
          />
        )}

        {currentView === 'profile' && <Profile />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
