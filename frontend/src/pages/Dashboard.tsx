import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Meeting } from '../lib/types';

interface DashboardProps {
  onJoinMeeting: (publicId: string) => void;
  onNavigate: (view: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onJoinMeeting, onNavigate }) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');

  // Schedule Form State
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [schedulePassword, setSchedulePassword] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [muteOnJoin, setMuteOnJoin] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchMeetings = async () => {
    try {
      const res = await api.listMeetings();
      setMeetings(res.meetings);
    } catch (err) {
      console.warn('Failed to load meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleStartInstantMeeting = async () => {
    setCreating(true);
    try {
      const res = await api.createMeeting({
        title: `${user?.name || 'My'}'s Instant Meeting`,
        settings: {
          waitingRoom: false,
          muteOnJoin: false,
          allowChat: true,
          allowScreenShare: true,
          allowFileUploads: true,
        },
      });
      onJoinMeeting(res.meeting.public_id);
    } catch (err: any) {
      alert(err.message || 'Failed to start meeting');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');

    let code = joinInput.trim();
    if (!code) return;

    // Support full URLs: e.g. https://domain.com/meeting/abc-defg-hij
    if (code.includes('/meeting/')) {
      const parts = code.split('/meeting/');
      code = parts[1].split('?')[0].split('/')[0];
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
      setJoinError('Invalid meeting ID or URL format');
      return;
    }

    setShowJoinModal(false);
    onJoinMeeting(code);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      let scheduledAt: number | undefined;
      if (scheduleDate && scheduleTime) {
        scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
      }

      const res = await api.createMeeting({
        title: scheduleTitle.trim() || 'Scheduled Meeting',
        password: schedulePassword.trim() || undefined,
        scheduledAt,
        settings: {
          waitingRoom,
          muteOnJoin,
          allowChat: true,
          allowScreenShare: true,
          allowFileUploads: true,
        },
      });

      setShowScheduleModal(false);
      setScheduleTitle('');
      setSchedulePassword('');
      fetchMeetings();
      alert(`Meeting scheduled! ID: ${res.meeting.public_id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to schedule meeting');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <span className="text-orange-400 font-semibold text-xs uppercase tracking-wider block mb-2">
            Cloudflare Native Video Conferencing
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
            Ultra low-latency video meetings powered by Cloudflare Realtime SFU, Durable Objects, D1 relational database, and R2 object storage.
          </p>
        </div>
      </div>

      {/* 4 Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {/* Instant Meeting */}
        <button
          onClick={handleStartInstantMeeting}
          disabled={creating}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-2xl p-6 text-left shadow-lg shadow-orange-500/20 transition-all transform hover:-translate-y-1 group disabled:opacity-50"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4 text-white group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-1">New Meeting</h3>
          <p className="text-white/80 text-xs">Start an instant conference room</p>
        </button>

        {/* Join Meeting */}
        <button
          onClick={() => setShowJoinModal(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 hover:border-slate-700 rounded-2xl p-6 text-left shadow-xl transition-all transform hover:-translate-y-1 group"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-1">Join Meeting</h3>
          <p className="text-slate-400 text-xs">Enter a meeting ID or link</p>
        </button>

        {/* Schedule */}
        <button
          onClick={() => setShowScheduleModal(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 hover:border-slate-700 rounded-2xl p-6 text-left shadow-xl transition-all transform hover:-translate-y-1 group"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-1">Schedule</h3>
          <p className="text-slate-400 text-xs">Plan a future password-protected meeting</p>
        </button>

        {/* Meeting History */}
        <button
          onClick={() => onNavigate('meetings')}
          className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 hover:border-slate-700 rounded-2xl p-6 text-left shadow-xl transition-all transform hover:-translate-y-1 group"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-1">Recordings & Files</h3>
          <p className="text-slate-400 text-xs">View meeting history and assets</p>
        </button>
      </div>

      {/* Recent & Upcoming Meetings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Your Meetings</h2>
          <button
            onClick={fetchMeetings}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            You don't have any meetings yet. Click <strong>New Meeting</strong> above to get started!
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {meetings.slice(0, 8).map((m) => {
              const dateStr = new Date(m.created_at).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <div key={m.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-0.5">{m.title}</h4>
                    <div className="flex items-center space-x-3 text-xs text-slate-400">
                      <span className="font-mono text-orange-400">{m.public_id}</span>
                      <span>•</span>
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span
                        className={`capitalize font-medium ${
                          m.status === 'active'
                            ? 'text-emerald-400'
                            : m.status === 'scheduled'
                            ? 'text-purple-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/meeting/${m.public_id}`;
                        navigator.clipboard.writeText(url);
                        alert('Meeting link copied to clipboard!');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                    >
                      Copy Link
                    </button>
                    {m.status !== 'ended' && (
                      <button
                        onClick={() => onJoinMeeting(m.public_id)}
                        className="px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-colors"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Join a Meeting</h3>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Meeting ID or Invite Link
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. abc-defg-hij or full link"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                />
                {joinError && <p className="text-rose-400 text-xs mt-1">{joinError}</p>}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-500/20"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Schedule a Meeting</h3>
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Topic / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Cloudflare Architecture Sync"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Passcode (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave empty for public link"
                  value={schedulePassword}
                  onChange={(e) => setSchedulePassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Security options */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitingRoom}
                    onChange={(e) => setWaitingRoom(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Enable Waiting Room (Host must admit participants)
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={muteOnJoin}
                    onChange={(e) => setMuteOnJoin(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">Mute participants upon entry</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-500/20 disabled:opacity-50"
                >
                  {creating ? 'Scheduling...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
