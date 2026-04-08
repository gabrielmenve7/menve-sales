"use client";

import { Mic, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "./inbox-utils";

const BAR_COUNT = 32;
const ACCENT = "#53bdeb";

function waveformHeights(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push(4 + (Math.abs(h) % 18));
  }
  return out;
}

function formatDur(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceMessagePlayer({
  src,
  mimeType,
  variant,
  messageId,
  wallClockTime,
  contactPhotoUrl,
  contactName,
}: {
  src: string;
  mimeType?: string | null;
  variant: "incoming" | "outgoing";
  messageId: string;
  wallClockTime: string;
  contactPhotoUrl?: string | null;
  contactName?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const heights = useMemo(() => waveformHeights(messageId), [messageId]);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  const sync = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    setDuration(el.duration || 0);
    setPlaying(!el.paused);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => {
      setDuration(el.duration || 0);
    };
    const onTime = () => setCurrent(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
    sync();
  }, [sync]);

  const onSeek = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const p = Math.max(0, Math.min(1, x / rect.width));
      el.currentTime = p * duration;
      setCurrent(el.currentTime);
    },
    [duration],
  );

  const incoming = variant === "incoming";

  return (
    <div
      className={cn(
        "min-w-[min(100%,280px)] max-w-full px-2.5 py-1.5 text-sm shadow-sm",
        incoming
          ? "rounded-br-lg rounded-tl-sm rounded-tr-lg rounded-bl-lg bg-muted/60 text-foreground dark:bg-muted/35"
          : "rounded-bl-lg rounded-br-lg rounded-tl-lg rounded-tr-sm bg-primary-solid text-primary-solid-fg",
      )}
    >
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} type={mimeType ?? "audio/ogg"} />
      </audio>

      <div className="flex items-stretch gap-2">
        <div className="flex w-10 shrink-0 flex-col items-center justify-between gap-1 pt-0.5">
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90",
              incoming
                ? "bg-foreground/10 text-foreground dark:bg-foreground/15"
                : "bg-primary-solid-fg/20 text-primary-solid-fg",
            )}
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? (
              <Pause className="size-4 fill-current" aria-hidden />
            ) : (
              <Play className="ml-0.5 size-4 fill-current" aria-hidden />
            )}
          </button>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              incoming ? "text-muted-foreground" : "text-primary-solid-fg/65",
            )}
          >
            {duration > 0 ? formatDur(duration) : "···"}
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <button
            type="button"
            className="relative flex h-9 w-full cursor-pointer items-center gap-[2px] rounded-md px-0.5"
            onClick={onSeek}
            aria-label="Posição na mensagem de voz"
          >
            {heights.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] shrink-0 rounded-full",
                  incoming
                    ? "bg-foreground/18 dark:bg-foreground/25"
                    : "bg-primary-solid-fg/35",
                )}
                style={{ height: h }}
              />
            ))}
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm",
                incoming
                  ? "ring-2 ring-background/80 dark:ring-background/60"
                  : "ring-2 ring-primary-solid/40",
              )}
              style={{
                left: `${progress * 100}%`,
                backgroundColor: ACCENT,
              }}
              aria-hidden
            />
          </button>
        </div>

        {incoming ? (
          <div className="relative shrink-0 self-start pt-0.5">
            {contactPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contactPhotoUrl}
                alt=""
                className="size-10 rounded-full object-cover ring-1 ring-border/60"
              />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full bg-muted-foreground/15 text-xs font-semibold text-foreground ring-1 ring-border/60">
                {initials(contactName ?? "?")}
              </span>
            )}
            <span
              className={cn(
                "absolute -bottom-0.5 -left-0.5 flex size-5 items-center justify-center rounded-full shadow-sm ring-2",
                incoming ? "ring-muted/60 dark:ring-muted/50" : "ring-primary-solid",
              )}
              style={{ backgroundColor: ACCENT }}
              aria-hidden
            >
              <Mic className="size-2.5 text-[#0b141a]" strokeWidth={2.5} />
            </span>
          </div>
        ) : (
          <div className="w-2 shrink-0" aria-hidden />
        )}
      </div>

      <div
        className={cn(
          "mt-0.5 flex justify-end pr-0.5 text-[11px] tabular-nums",
          incoming ? "text-muted-foreground" : "text-primary-solid-fg/65",
        )}
      >
        {wallClockTime}
      </div>
    </div>
  );
}
