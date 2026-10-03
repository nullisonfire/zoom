import { useState, useEffect, useRef, useCallback } from 'react';
import { MediaDeviceState, DeviceInfo } from '../lib/types';

export function useMediaDevices() {
  const [deviceState, setDeviceState] = useState<MediaDeviceState>({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
    selectedAudioInput: '',
    selectedVideoInput: '',
    selectedAudioOutput: '',
    hasPermissions: false,
  });

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const enumerateDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs: DeviceInfo[] = [];
      const videoInputs: DeviceInfo[] = [];
      const audioOutputs: DeviceInfo[] = [];

      devices.forEach((d) => {
        const item: DeviceInfo = {
          deviceId: d.deviceId,
          label: d.label || `${d.kind} (${d.deviceId.slice(0, 5)})`,
        };
        if (d.kind === 'audioinput') audioInputs.push(item);
        else if (d.kind === 'videoinput') videoInputs.push(item);
        else if (d.kind === 'audiooutput') audioOutputs.push(item);
      });

      setDeviceState((prev) => ({
        ...prev,
        audioInputs,
        videoInputs,
        audioOutputs,
        selectedAudioInput: prev.selectedAudioInput || audioInputs[0]?.deviceId || '',
        selectedVideoInput: prev.selectedVideoInput || videoInputs[0]?.deviceId || '',
        selectedAudioOutput: prev.selectedAudioOutput || audioOutputs[0]?.deviceId || '',
      }));
    } catch (err) {
      console.warn('[useMediaDevices] Failed to enumerate devices:', err);
    }
  }, []);

  const setupAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    try {
      const audioTrack = mediaStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));

        setAudioLevel(normalized);
        setIsSpeaking(normalized > 12);

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('[useMediaDevices] Audio analyser setup failed:', err);
    }
  }, []);

  const startMedia = useCallback(
    async (options: { audio?: boolean; video?: boolean } = { audio: true, video: true }) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return null;
      }

      // Stop previous stream
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: options.audio
            ? deviceState.selectedAudioInput
              ? { deviceId: { exact: deviceState.selectedAudioInput } }
              : true
            : false,
          video: options.video
            ? deviceState.selectedVideoInput
              ? { deviceId: { exact: deviceState.selectedVideoInput }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        setDeviceState((prev) => ({ ...prev, hasPermissions: true }));

        await enumerateDevices();

        if (options.audio && newStream.getAudioTracks().length > 0) {
          setupAudioAnalyser(newStream);
        }

        return newStream;
      } catch (err) {
        console.warn('[useMediaDevices] getUserMedia error:', err);
        return null;
      }
    },
    [deviceState.selectedAudioInput, deviceState.selectedVideoInput, stream, enumerateDevices, setupAudioAnalyser]
  );

  const stopMedia = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setAudioLevel(0);
    setIsSpeaking(false);
  }, [stream]);

  useEffect(() => {
    enumerateDevices();
    return () => {
      stopMedia();
    };
  }, []);

  return {
    stream,
    deviceState,
    audioLevel,
    isSpeaking,
    startMedia,
    stopMedia,
    enumerateDevices,
    setDeviceState,
  };
}
