import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Play, Pause } from "lucide-react";

export type Recording = { blob: Blob; mimeType: string; durationMs: number };

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "audio/webm";
}

export function VoiceRecorder({
  recording,
  onChange,
  disabled,
}: {
  recording: Recording | null;
  onChange: (rec: Recording | null) => void;
  disabled?: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh playback URL when recording changes
  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (recording) {
      urlRef.current = URL.createObjectURL(recording.blob);
      if (audioRef.current) {
        audioRef.current.src = urlRef.current;
      }
    }
    setPlaying(false);
  }, [recording]);

  const stopStream = () => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationMs = Date.now() - startTsRef.current;
        stopStream();
        onChange({ blob, mimeType, durationMs });
        setIsRecording(false);
        if (tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
      };
      startTsRef.current = Date.now();
      mr.start();
      setIsRecording(true);
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startTsRef.current);
      }, 200);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in Safari settings."
          : "Could not access microphone.",
      );
      stopStream();
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
  };

  const reset = () => {
    onChange(null);
    setElapsed(0);
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isRecording && !recording && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-semibold text-white shadow-md transition hover:bg-red-700 disabled:opacity-60"
        >
          <Mic className="h-5 w-5" /> Record
        </button>
      )}
      {isRecording && (
        <>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-semibold text-white shadow-md transition hover:bg-red-700"
          >
            <Square className="h-5 w-5 fill-current" /> Stop
          </button>
          <span className="inline-flex items-center gap-2 rounded-md bg-red-100 px-3 py-2 text-sm font-mono font-semibold text-red-900">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
            {fmt(elapsed)}
          </span>
        </>
      )}
      {!isRecording && recording && (
        <>
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {playing ? "Pause" : "Play back"}
          </button>
          <span className="inline-flex items-center rounded-md bg-muted px-3 py-2 text-sm font-mono font-medium text-muted-foreground">
            {fmt(recording.durationMs)}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent disabled:opacity-60"
          >
            <RotateCcw className="h-5 w-5" /> Re-record
          </button>
        </>
      )}
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      {error && (
        <span className="text-sm font-medium text-red-700">{error}</span>
      )}
    </div>
  );
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
