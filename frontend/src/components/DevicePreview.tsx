import React, { useEffect, useRef, useState } from 'react';
import { Meeting } from '../lib/types';
import { useMediaDevices } from '../hooks/useMediaDevices';

interface DevicePreviewProps {
  meeting: Meeting;
  userName: string;
  onJoin: (options: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    password?: string;
    stream: MediaStream | null;
  }) => void;
  onCancel: () => void;
}

export const DevicePreview: React.FC<DevicePreviewProps> = ({
  meeting,
  userName,
  onJoin,
  onCancel,
}) => {
  const [audioEnabled, setAudioEnabled] = useState(!meeting.settings.muteOnJoin);
  const [videoEnabled, setVideoEnabled] = useState(!meeting.settings.videoOffOnJoin);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    stream,
    deviceState,
    audioLevel,
    startMedia,
    stopMedia,
    setDeviceState,
  } = useMediaDevices();

  // Start media preview on mount
  useEffect(() => {
    startMedia({ audio: audioEnabled, video: videoEnabled });
    return () => {
      stopMedia();
    };
  }, []);

  // Attach stream to video tag
  useEffect(() => {
    if (videoRef.current) {
      if (videoEnabled && stream && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, videoEnabled]);

  const toggleVideo = async () => {
    const next = !videoEnabled;
    setVideoEnabled(next);
    await startMedia({ audio: audioEnabled, video: next });
  };

  const toggleAudio = async () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    await startMedia({ audio: next, video: videoEnabled });
  };

  const handleDeviceChange = async (type: 'audio' | 'video', deviceId: string) => {
    if (type === 'audio') {
      setDeviceState((prev) => ({ ...prev, selectedAudioInput: deviceId }));
    } else {
      setDeviceState((prev) => ({ ...prev, selectedVideoInput: deviceId }));
    }
    await startMedia({ audio: audioEnabled, video: videoEnabled });
  };

  const handleJoinClick = () => {
    if (meeting.settings.requirePassword && !password) {
      setPasswordError('Meeting password is required');
      return;
    }
    setPasswordError('');
    onJoin({
      audioEnabled,
      videoEnabled,
      password: password || undefined,
      stream,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white mb-1">{meeting.title}</h1>
          <p className="text-slate-400 text-sm">
            Hosted by <span className="text-slate-200 font-medium">{meeting.host_name || 'Host'}</span> • ID:{' '}
            <code className="bg-slate-800 px-2 py-0.5 rounded text-orange-400 font-mono">{meeting.public_id}</code>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          {/* Video Preview Column */}
          <div className="lg:col-span-2">
            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
              {videoEnabled && stream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-3xl font-bold text-slate-300 shadow-xl">
                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="mt-3 text-sm text-slate-400 font-medium">Camera is off</span>
                </div>
              )}

              {/* Top status tag */}
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-slate-300 border border-slate-700 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Camera Preview</span>
              </div>

              {/* Bottom mic level indicator */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700/80 flex items-center space-x-2">
                  <svg
                    className={`w-4 h-4 ${audioEnabled ? 'text-emerald-400' : 'text-rose-400'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {audioEnabled ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    )}
                  </svg>
                  <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${audioEnabled ? audioLevel : 0}%` }}
                    />
                  </div>
                </div>

                <div className="flex space-x-2 pointer-events-auto">
                  <button
                    onClick={toggleAudio}
                    className={`p-3 rounded-full transition-all shadow-md ${
                      audioEnabled
                        ? 'bg-slate-800 hover:bg-slate-700 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                    title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          audioEnabled
                            ? 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
                            : 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
                        }
                      />
                    </svg>
                  </button>

                  <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full transition-all shadow-md ${
                      videoEnabled
                        ? 'bg-slate-800 hover:bg-slate-700 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                    title={videoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          videoEnabled
                            ? 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                            : 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
                        }
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Device selection dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Microphone
                </label>
                <select
                  value={deviceState.selectedAudioInput}
                  onChange={(e) => handleDeviceChange('audio', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  {deviceState.audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {deviceState.audioInputs.length === 0 && <option value="">Default Microphone</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Camera
                </label>
                <select
                  value={deviceState.selectedVideoInput}
                  onChange={(e) => handleDeviceChange('video', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  {deviceState.videoInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {deviceState.videoInputs.length === 0 && <option value="">Default Camera</option>}
                </select>
              </div>
            </div>
          </div>

          {/* Join Form Column */}
          <div className="space-y-6">
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
              <div>
                <span className="text-xs font-medium text-slate-400 block mb-1">Joining as</span>
                <div className="font-semibold text-white text-base flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <span>{userName}</span>
                </div>
              </div>

              {meeting.settings.requirePassword && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Meeting Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  />
                  {passwordError && <p className="text-rose-400 text-xs mt-1">{passwordError}</p>}
                </div>
              )}

              {meeting.settings.waitingRoom && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
                  ℹ️ This meeting has a <strong>Waiting Room</strong> enabled. The host will review your request to join.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={handleJoinClick}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-orange-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-2 text-base"
              >
                <span>Join Meeting</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              <button
                onClick={onCancel}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
