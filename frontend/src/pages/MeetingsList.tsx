import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Meeting } from '../lib/types';

interface MeetingsListProps {
  onJoinMeeting: (publicId: string) => void;
  onNavigate: (view: string) => void;
}

export const MeetingsList: React.FC<MeetingsListProps> = ({ onJoinMeeting, onNavigate }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'ended'>('all');

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

  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'all') return true;
    return m.status === filter;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Meeting History & Schedule</h1>
          <p className="text-slate-400 text-sm">Review past conference sessions, access shared files, and view scheduled calls.</p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'all' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({meetings.length})
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'scheduled' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setFilter('ended')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'ended' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Concluded
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading your conference records...</div>
      ) : filteredMeetings.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
          No meetings found in this view.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Title & ID</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Security</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredMeetings.map((m) => {
                  const date = new Date(m.scheduled_at || m.created_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white mb-0.5">{m.title}</div>
                        <code className="text-xs font-mono text-orange-400">{m.public_id}</code>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">{date}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                            m.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : m.status === 'scheduled'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {m.settings.requirePassword ? (
                          <span className="text-amber-400 flex items-center space-x-1">
                            <span>🔒 Password</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Public Link</span>
                        )}
                        {m.settings.waitingRoom && <div className="text-[11px] text-slate-500">Waiting Room Enabled</div>}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/meeting/${m.public_id}`;
                            navigator.clipboard.writeText(url);
                            alert('Link copied to clipboard!');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                        >
                          Copy
                        </button>
                        {m.status !== 'ended' && (
                          <button
                            onClick={() => onJoinMeeting(m.public_id)}
                            className="px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm shadow-orange-500/20 transition-colors"
                          >
                            Join
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
