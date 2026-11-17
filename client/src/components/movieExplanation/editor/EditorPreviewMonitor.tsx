// ============================================================
// Movie Explanation Editor — Pre-Render Full Video Preview Monitor
// High-performance HTML5/Canvas preview monitor with live transforms,
// color grading, filters, borders, text overlays, captions, and transport.
// Playback synchronization: Audio is master clock; video boundary seeks
// are throttled to shot changes to eliminate flashing, jumping, and reverting.
// ============================================================

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useMovieExplanationStore } from '../../../stores/movieExplanationStore.js';
import { api } from '../../../services/api.js';
import type {
  MovieTimelineShot,
  TimelineCaptionItem,
  TimelineTextOverlay,
  CaptionStyleSettings,
} from '@shared/types.js';

interface CaptionOverlayProps {
  caption: TimelineCaptionItem;
  timelineStyle?: CaptionStyleSettings;
  currentTime: number;
}

const CaptionOverlayItem: React.FC<CaptionOverlayProps> = ({
  caption,
  timelineStyle,
  currentTime,
}) => {
  const merged = {
    fontSize: caption.fontSize || timelineStyle?.fontSize || 15,
    fontFamily: caption.fontFamily || timelineStyle?.fontFamily || 'Inter, system-ui, sans-serif',
    fontWeight: caption.fontWeight || timelineStyle?.fontWeight || 600,
    fontColor: caption.fontColor || timelineStyle?.fontColor || '#ffffff',
    backgroundColor: caption.backgroundColor || timelineStyle?.backgroundColor || 'rgba(0,0,0,0.65)',
    backgroundOpacity: caption.backgroundOpacity ?? timelineStyle?.backgroundOpacity ?? 0.65,
    outlineColor: caption.outlineColor || timelineStyle?.outlineColor || 'rgba(0,0,0,0.85)',
    outlineThickness: caption.outlineThickness ?? timelineStyle?.outlineThickness ?? 2,
    shadow: caption.shadow ?? timelineStyle?.shadow ?? true,
    shadowColor: timelineStyle?.shadowColor || 'rgba(0,0,0,0.9)',
    align: caption.align || timelineStyle?.align || 'center',
    positionY: caption.positionY ?? timelineStyle?.positionY ?? 89,
    bottomMargin: caption.bottomMargin ?? timelineStyle?.bottomMargin ?? 24,
    maxWidth: caption.maxWidth ?? timelineStyle?.maxWidth ?? 75,
    lineSpacing: caption.lineSpacing ?? timelineStyle?.lineSpacing ?? 1.3,
    letterSpacing: caption.letterSpacing ?? timelineStyle?.letterSpacing ?? 0.2,
    animation: caption.animation || timelineStyle?.animation || 'none',
    highlightColor: caption.highlightColor || timelineStyle?.highlightColor || '#38bdf8',
  };

  // Duration & progress calculations
  const capDuration = Math.max(0.1, caption.endTime - caption.startTime);
  const elapsed = Math.max(0, currentTime - caption.startTime);
  const progress = Math.min(1.0, elapsed / capDuration);

  // Typewriter text animation
  let renderedText: React.ReactNode = caption.text;
  if (merged.animation === 'typewriter') {
    const charsToShow = Math.floor(progress * caption.text.length);
    renderedText = (
      <span>
        {caption.text.slice(0, Math.max(1, charsToShow))}
        <span style={{ opacity: 0.7, borderRight: '2px solid currentColor', marginLeft: '1px' }}></span>
      </span>
    );
  } else if (merged.animation === 'word_by_word' || merged.animation === 'karaoke') {
    const words = caption.text.split(' ');
    const activeWordIdx = Math.min(words.length - 1, Math.floor(progress * words.length));
    renderedText = words.map((w, idx) => {
      const isWordActive = idx === activeWordIdx;
      const isPast = idx < activeWordIdx;
      return (
        <span
          key={idx}
          style={{
            margin: '0 3px',
            color: isWordActive
              ? merged.highlightColor
              : isPast
              ? merged.fontColor
              : 'rgba(255,255,255,0.4)',
            fontWeight: isWordActive ? 800 : merged.fontWeight,
            transform: isWordActive ? 'scale(1.08)' : 'scale(1.0)',
            display: 'inline-block',
            transition: 'color 0.1s ease, transform 0.1s ease',
          }}
        >
          {w}
        </span>
      );
    });
  }

  // Fade animation opacity
  let opacity = 1.0;
  if (merged.animation === 'fade') {
    if (elapsed < 0.25) opacity = elapsed / 0.25;
    else if (caption.endTime - currentTime < 0.25) opacity = Math.max(0, (caption.endTime - currentTime) / 0.25);
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: `${Math.max(4, Math.min(90, 100 - merged.positionY))}%`,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: `${merged.maxWidth}%`,
        width: 'auto',
        textAlign: merged.align,
        zIndex: 22,
        pointerEvents: 'none',
        opacity,
        transition: 'opacity 0.15s ease',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          background: merged.backgroundColor !== 'transparent'
            ? merged.backgroundColor
            : undefined,
          color: merged.fontColor,
          fontFamily: merged.fontFamily,
          fontSize: `${merged.fontSize}px`,
          fontWeight: merged.fontWeight,
          letterSpacing: `${merged.letterSpacing}px`,
          lineHeight: merged.lineSpacing,
          padding: merged.backgroundColor !== 'transparent' ? '4px 12px' : '2px 6px',
          borderRadius: '5px',
          textShadow: merged.shadow
            ? `0 2px 4px ${merged.shadowColor}, 0 0 ${merged.outlineThickness}px ${merged.outlineColor}`
            : undefined,
          border: merged.backgroundColor !== 'transparent' ? '1px solid rgba(255,255,255,0.1)' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: merged.backgroundColor !== 'transparent' ? '0 2px 10px rgba(0,0,0,0.5)' : undefined,
        }}
      >
        {renderedText}
      </span>
    </div>
  );
};

export const EditorPreviewMonitor: React.FC = () => {
  const {
    project,
    currentTime,
    isPlaying,
    playbackSpeed,
    previewVolume,
    isMuted,
    previewMode,
    selectedShotId,
    inPoint,
    outPoint,
    captionsVisible,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
    setPreviewVolume,
    setIsMuted,
    setPreviewMode,
    setSelectedShotId,
    toggleCaptionsVisible,
  } = useMovieExplanationStore();

  const containerRef = useRef<HTMLDivElement>(null);
  // Priority 3: A/B Dual-Player Pre-Buffering Architecture to eliminate blank/grey frames
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const [activePlayer, setActivePlayer] = useState<'A' | 'B'>('A');
  const activePlayerRef = useRef<'A' | 'B'>('A');
  const preloadedShotIdRef = useRef<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(performance.now());
  const lastUpdateUiTimeRef = useRef<number>(0);

  // Playback state refs to prevent re-entrant seek thrashing
  const currentTimeRef = useRef<number>(currentTime);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const activeShotIdRef = useRef<string | null>(null);
  const previewModeRef = useRef(previewMode);
  const inPointRef = useRef(inPoint);
  const outPointRef = useRef(outPoint);
  const playbackSpeedRef = useRef(playbackSpeed);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sourceVideoError, setSourceVideoError] = useState(false);

  const timeline = project?.timeline;
  const shots = useMemo(() => timeline?.shots || [], [timeline?.shots]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const totalDuration = timeline?.duration || 0;
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

  // Keep refs synchronized
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    previewModeRef.current = previewMode;
    inPointRef.current = inPoint;
    outPointRef.current = outPoint;
    playbackSpeedRef.current = playbackSpeed;
  }, [isPlaying, previewMode, inPoint, outPoint, playbackSpeed]);

  // Active shot at current timecode
  const activeShot = useMemo(() => {
    if (shots.length === 0) return null;
    const found = shots.find(
      (s) => currentTime >= s.timelineStart && currentTime < s.timelineEnd
    );
    return found || shots[shots.length - 1];
  }, [shots, currentTime]);

  // Active captions at current timecode
  const activeCaption = useMemo(() => {
    const caps = timeline?.captions || [];
    return caps.find(
      (c) => currentTime >= c.startTime && currentTime <= c.endTime
    );
  }, [timeline?.captions, currentTime]);

  // Active text overlays at current timecode
  const activeTextOverlays = useMemo(() => {
    const overlays = timeline?.textOverlays || [];
    return overlays.filter(
      (t) => currentTime >= t.timelineStart && currentTime <= t.timelineEnd
    );
  }, [timeline?.textOverlays, currentTime]);

  // Media URLs
  const videoStreamUrl = project?.projectId
    ? api.getMovieSourceVideoStreamUrl(project.projectId)
    : '';
  const audioStreamUrl = project?.projectId
    ? api.getMovieVoiceoverStreamUrl(project.projectId)
    : '';

  // Synchronize audio element settings
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackSpeed;
    audio.volume = isMuted ? 0 : previewVolume;
  }, [playbackSpeed, previewVolume, isMuted]);

  // Play/Pause transition handler
  useEffect(() => {
    const audio = audioRef.current;
    const activeVid = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
    const inactiveVid = activePlayerRef.current === 'A' ? videoRefB.current : videoRefA.current;

    if (isPlaying) {
      if (audio) {
        audio.playbackRate = playbackSpeed;
        audio.volume = isMuted ? 0 : previewVolume;
        if (Math.abs(audio.currentTime - currentTimeRef.current) > 0.15) {
          audio.currentTime = currentTimeRef.current;
        }
        audio.play().catch(() => {});
      }

      if (activeVid && activeShot) {
        activeVid.playbackRate = playbackSpeed * (activeShot.speedMultiplier || 1.0);
        activeVid.muted = true;
        const offset = (currentTimeRef.current - activeShot.timelineStart) * (activeShot.speedMultiplier || 1.0);
        const targetSource = Math.max(
          activeShot.sourceStart,
          Math.min(activeShot.sourceEnd, activeShot.sourceStart + offset)
        );
        activeVid.currentTime = targetSource;
        activeShotIdRef.current = activeShot.shotId;
        activeVid.play().catch(() => {});
      }

      // Preload next shot on inactive video element
      const nextShot = shots.find((s) => s.timelineStart >= (activeShot?.timelineEnd || 0));
      if (nextShot && inactiveVid && !nextShot.isScreenshot) {
        inactiveVid.currentTime = nextShot.sourceStart;
        inactiveVid.pause();
        preloadedShotIdRef.current = nextShot.shotId;
      }
    } else {
      if (audio) audio.pause();
      if (activeVid) activeVid.pause();
      if (inactiveVid) inactiveVid.pause();
    }
  }, [isPlaying]);

  // Non-playing seek sync (scrubbing, frame stepping, jumping)
  useEffect(() => {
    if (isPlaying) return; // Authoritative RAF loop controls playback when active

    const audio = audioRef.current;
    if (audio && Math.abs(audio.currentTime - currentTime) > 0.06) {
      audio.currentTime = currentTime;
    }

    const activeVid = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
    const inactiveVid = activePlayerRef.current === 'A' ? videoRefB.current : videoRefA.current;

    if (activeVid && activeShot) {
      activeVid.playbackRate = playbackSpeed * (activeShot.speedMultiplier || 1.0);
      activeVid.muted = true;
      const offset = (currentTime - activeShot.timelineStart) * (activeShot.speedMultiplier || 1.0);
      const targetSource = Math.max(
        activeShot.sourceStart,
        Math.min(activeShot.sourceEnd, activeShot.sourceStart + offset)
      );
      if (Math.abs(activeVid.currentTime - targetSource) > 0.04) {
        activeVid.currentTime = targetSource;
      }
      activeShotIdRef.current = activeShot.shotId;
    }

    // Preload adjacent shot on inactive video element
    const nextShot = shots.find((s) => s.timelineStart >= (activeShot?.timelineEnd || 0));
    if (nextShot && inactiveVid && !nextShot.isScreenshot) {
      inactiveVid.currentTime = nextShot.sourceStart;
      inactiveVid.pause();
      preloadedShotIdRef.current = nextShot.shotId;
    }
  }, [currentTime, isPlaying, activeShot, playbackSpeed, shots]);

  // Main high-performance playback loop (authoritative, never stutters or resets)
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    lastTickTimeRef.current = performance.now();

    const loop = (now: number) => {
      if (!isPlayingRef.current) return;

      const audio = audioRef.current;
      const video = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
      const curShots = shotsRef.current;
      const speed = playbackSpeedRef.current;

      let nextTime: number;

      // Audio element is the authoritative master clock when playing narration audio
      if (audio && !audio.paused && audio.duration > 0 && !isNaN(audio.currentTime)) {
        nextTime = audio.currentTime;
      } else {
        const dt = (now - lastTickTimeRef.current) / 1000;
        nextTime = currentTimeRef.current + dt * speed;
      }
      lastTickTimeRef.current = now;

      // Boundary check & loop scope
      const currentActiveShot = curShots.find(
        (s) => nextTime >= s.timelineStart && nextTime < s.timelineEnd
      ) || curShots[curShots.length - 1];

      if (previewModeRef.current === 'clip' && currentActiveShot) {
        if (nextTime >= currentActiveShot.timelineEnd) {
          nextTime = currentActiveShot.timelineStart;
          if (audio) audio.currentTime = nextTime;
          if (video) {
            video.currentTime = currentActiveShot.sourceStart;
            video.play().catch(() => {});
          }
        }
      } else if (previewModeRef.current === 'range' && inPointRef.current !== null && outPointRef.current !== null) {
        if (nextTime >= outPointRef.current) {
          nextTime = inPointRef.current;
          if (audio) audio.currentTime = nextTime;
        }
      } else if (nextTime >= totalDurationRef.current && totalDurationRef.current > 0) {
        nextTime = totalDurationRef.current;
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
        setIsPlaying(false);
        return;
      }

      currentTimeRef.current = nextTime;

      // Seamless A/B dual-player video shot transitions (Pre-buffered zero blank frames)
      if (currentActiveShot) {
        const curActive = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
        const curInactive = activePlayerRef.current === 'A' ? videoRefB.current : videoRefA.current;

        if (currentActiveShot.shotId !== activeShotIdRef.current) {
          // ENTERING NEW SHOT BOUNDARY
          activeShotIdRef.current = currentActiveShot.shotId;
          const offset = (nextTime - currentActiveShot.timelineStart) * (currentActiveShot.speedMultiplier || 1.0);
          const targetSource = Math.max(
            currentActiveShot.sourceStart,
            Math.min(currentActiveShot.sourceEnd, currentActiveShot.sourceStart + offset)
          );

          if (curInactive && preloadedShotIdRef.current === currentActiveShot.shotId) {
            // Instant seamless switch to pre-buffered player!
            const newActive = activePlayerRef.current === 'A' ? 'B' : 'A';
            activePlayerRef.current = newActive;
            setActivePlayer(newActive);
            curInactive.playbackRate = speed * (currentActiveShot.speedMultiplier || 1.0);
            curInactive.play().catch(() => {});

            if (curActive) curActive.pause();
          } else if (curActive) {
            // Active player seeks directly
            curActive.currentTime = targetSource;
            curActive.playbackRate = speed * (currentActiveShot.speedMultiplier || 1.0);
            curActive.play().catch(() => {});
          }

          // Preload upcoming shot on inactive player
          const nextShot = curShots.find((s) => s.timelineStart >= currentActiveShot.timelineEnd);
          const nextInactive = activePlayerRef.current === 'A' ? videoRefB.current : videoRefA.current;
          if (nextShot && nextInactive && !nextShot.isScreenshot && preloadedShotIdRef.current !== nextShot.shotId) {
            nextInactive.currentTime = nextShot.sourceStart;
            nextInactive.pause();
            preloadedShotIdRef.current = nextShot.shotId;
          }
        } else if (curActive) {
          // INSIDE SAME SHOT: Continuous natural playback without seek thrashing
          if (!curActive.seeking && !curActive.paused) {
            const expected = currentActiveShot.sourceStart + (nextTime - currentActiveShot.timelineStart) * (currentActiveShot.speedMultiplier || 1.0);
            if (Math.abs(curActive.currentTime - expected) > 1.2) {
              curActive.currentTime = expected;
            }
          }

          // Pre-buffer next shot when approaching boundary (within 1.0s)
          if (nextTime >= currentActiveShot.timelineEnd - 1.0) {
            const nextShot = curShots.find((s) => s.timelineStart >= currentActiveShot.timelineEnd);
            const nextInactive = activePlayerRef.current === 'A' ? videoRefB.current : videoRefA.current;
            if (nextShot && nextInactive && !nextShot.isScreenshot && preloadedShotIdRef.current !== nextShot.shotId) {
              nextInactive.currentTime = nextShot.sourceStart;
              nextInactive.pause();
              preloadedShotIdRef.current = nextShot.shotId;
            }
          }
        }
      }

      // Smoothly broadcast playhead timecode to UI
      if (now - lastUpdateUiTimeRef.current >= 33) {
        lastUpdateUiTimeRef.current = now;
        setCurrentTime(nextTime);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  // Keyboard shortcut listeners (Space = play/pause, Left/Right = stepping)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFrames(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFrames(1);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seekSeconds(-2);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        seekSeconds(2);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleCaptionsVisible();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime]);

  // Stepping & Seeking controls
  const stepFrames = (frames: number) => {
    const fps = timeline?.outputFps || 30;
    const dt = frames / fps;
    const target = Math.max(0, Math.min(totalDuration, currentTime + dt));
    setCurrentTime(target);
    if (audioRef.current) audioRef.current.currentTime = target;
  };

  const seekSeconds = (secs: number) => {
    const target = Math.max(0, Math.min(totalDuration, currentTime + secs));
    setCurrentTime(target);
    if (audioRef.current) audioRef.current.currentTime = target;
  };

  const jumpToPreviousShot = () => {
    if (!activeShot || shots.length === 0) return;
    const idx = shots.findIndex((s) => s.shotId === activeShot.shotId);
    if (idx > 0) {
      const prev = shots[idx - 1];
      setCurrentTime(prev.timelineStart);
      setSelectedShotId(prev.shotId);
    } else {
      setCurrentTime(0);
    }
  };

  const jumpToNextShot = () => {
    if (!activeShot || shots.length === 0) return;
    const idx = shots.findIndex((s) => s.shotId === activeShot.shotId);
    if (idx >= 0 && idx < shots.length - 1) {
      const next = shots[idx + 1];
      setCurrentTime(next.timelineStart);
      setSelectedShotId(next.shotId);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Format timecode HH:MM:SS:FF
  const formatTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const frames = Math.floor((s % 1) * (timeline?.outputFps || 30));
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  // Compute CSS styles for Transform, Color, Filter, Border on the active shot
  const computedVisualStyles = useMemo(() => {
    if (!activeShot) return {};

    const t = activeShot.transform;
    const cg = activeShot.colorGrading;
    const fx = activeShot.filterEffect;
    const b = activeShot.border;

    // 1. Transform: Zoom, Scale, Position, Crop, Rotation, Flip
    const scale = ((t?.scale ?? 100) / 100) * (t?.zoom ?? activeShot.zoomLevel ?? 1.0);
    const posX = t?.positionX ?? 0;
    const posY = t?.positionY ?? 0;
    const rot = t?.rotation ?? 0;
    const flip = activeShot.isFlipped ? -1 : 1;

    const transformStr = `translate(${posX}%, ${posY}%) scale(${scale * flip}, ${scale}) rotate(${rot}deg)`;

    // 2. Crop
    const cropTop = t?.cropTop ?? 0;
    const cropRight = t?.cropRight ?? 0;
    const cropBottom = t?.cropBottom ?? 0;
    const cropLeft = t?.cropLeft ?? 0;
    const clipPathStr = (cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0)
      ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`
      : undefined;

    // 3. Color Grading & Effects filters
    const filterParts: string[] = [];

    if (cg) {
      const bright = 1.0 + (cg.brightness || 0) + (cg.exposure || 0) * 0.1;
      const contrast = cg.contrast ?? 1.0;
      const saturate = cg.saturation ?? 1.0;
      const hue = (cg.tint || 0) * 0.5;

      filterParts.push(`brightness(${bright.toFixed(2)})`);
      filterParts.push(`contrast(${contrast.toFixed(2)})`);
      filterParts.push(`saturate(${saturate.toFixed(2)})`);
      if (Math.abs(hue) > 1) filterParts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }

    if (fx && fx.enabled && fx.type !== 'none') {
      const intensity = fx.intensity ?? 0.8;
      if (fx.type === 'bw') filterParts.push(`grayscale(${intensity}) contrast(1.1)`);
      if (fx.type === 'vintage') filterParts.push(`sepia(${0.5 * intensity}) contrast(1.05)`);
      if (fx.type === 'warm') filterParts.push(`sepia(${0.25 * intensity}) saturate(1.2)`);
      if (fx.type === 'cool') filterParts.push(`hue-rotate(${25 * intensity}deg) saturate(1.1)`);
      if (fx.type === 'cinematic') filterParts.push(`contrast(${1.0 + 0.15 * intensity}) saturate(${1.0 + 0.15 * intensity})`);
      if (fx.type === 'blur') filterParts.push(`blur(${4 * intensity}px)`);
      if (fx.type === 'soft_contrast') filterParts.push(`contrast(${1.0 - 0.15 * intensity})`);
    }

    // 4. Border
    let borderStr: string | undefined = undefined;
    let borderRadiusStr: string | undefined = undefined;
    let boxShadowStr: string | undefined = undefined;

    if (b && b.enabled && b.style !== 'none') {
      const col = b.color || '#ffffff';
      const thick = b.thickness || 4;
      borderStr = `${thick}px solid ${col}`;
      if (b.borderRadius) borderRadiusStr = `${b.borderRadius}px`;
      if (b.shadow) boxShadowStr = `0 4px 20px ${b.shadowColor || 'rgba(0,0,0,0.6)'}`;
    }

    return {
      transform: transformStr,
      clipPath: clipPathStr,
      filter: filterParts.length > 0 ? filterParts.join(' ') : undefined,
      border: borderStr,
      borderRadius: borderRadiusStr,
      boxShadow: boxShadowStr,
      transition: isPlaying ? 'none' : 'transform 0.15s ease, filter 0.15s ease',
    };
  }, [activeShot, isPlaying]);

  return (
    <div
      ref={containerRef}
      className={`mex-preview-monitor ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        background: '#090d16',
        borderRadius: isFullscreen ? '0px' : '10px',
        border: isFullscreen ? 'none' : '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Hidden Master Audio Track ── */}
      <audio
        ref={audioRef}
        src={audioStreamUrl}
        preload="auto"
        onEnded={() => setIsPlaying(false)}
      />

      {/* ── Screen Stage / Video Canvas Monitor ── */}
      <div
        className="mex-monitor-stage"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: timeline?.outputAspectRatio === '9:16' ? '9/16' : '16/9',
          maxHeight: isFullscreen ? 'calc(100vh - 70px)' : '460px',
          background: timeline?.globalCanvas?.backgroundColor || '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Aspect Ratio & Live Status Indicator */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.74rem',
            color: '#cbd5e1',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPlaying ? '#10b981' : '#f59e0b' }} />
          <span>{isPlaying ? 'PLAYING' : 'PAUSED'}</span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{timeline?.outputAspectRatio || '16:9'}</span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{activeShot ? `${activeShot.sceneId} (${activeShot.duration.toFixed(1)}s)` : 'Timeline'}</span>
        </div>

        {/* Captions Visibility Quick Toggle in Stage Header */}
        <button
          onClick={toggleCaptionsVisible}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: captionsVisible ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0,0,0,0.65)',
            border: captionsVisible ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
            borderRadius: '20px',
            padding: '4px 10px',
            fontSize: '0.74rem',
            color: captionsVisible ? '#38bdf8' : '#94a3b8',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
          title={captionsVisible ? 'Captions ON (Click or press C to Hide)' : 'Captions OFF (Click or press C to Show)'}
        >
          <span>💬</span>
          <span>{captionsVisible ? 'Captions ON' : 'Captions OFF'}</span>
        </button>

        {/* Global Canvas Border Overlay (if configured) */}
        {timeline?.globalCanvas?.globalBorder?.enabled && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              pointerEvents: 'none',
              border: `${timeline.globalCanvas.globalBorder.thickness || 4}px solid ${timeline.globalCanvas.globalBorder.color || '#ffffff'}`,
            }}
          />
        )}

        {/* Video / Visual Asset Layer */}
        {activeShot ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              ...computedVisualStyles,
            }}
          >
            {/* Underlying crisp thumbnail poster for zero-blank-frame guarantee */}
            {activeShot.thumbnailUrl && (
              <img
                src={activeShot.thumbnailUrl}
                alt="Scene frame"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: activeShot.framingMode === 'fit' ? 'contain' : 'cover',
                  zIndex: 0,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Priority 3: Dual Video Player A */}
            {!sourceVideoError && videoStreamUrl && (
              <video
                ref={videoRefA}
                src={videoStreamUrl}
                preload="auto"
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: activeShot.framingMode === 'fit' ? 'contain' : 'cover',
                  opacity: activePlayer === 'A' ? 1 : 0,
                  zIndex: activePlayer === 'A' ? 2 : 1,
                  pointerEvents: activePlayer === 'A' ? 'auto' : 'none',
                  transition: 'opacity 0.04s ease-out',
                }}
                onError={() => setSourceVideoError(true)}
              />
            )}

            {/* Priority 3: Dual Video Player B */}
            {!sourceVideoError && videoStreamUrl && (
              <video
                ref={videoRefB}
                src={videoStreamUrl}
                preload="auto"
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: activeShot.framingMode === 'fit' ? 'contain' : 'cover',
                  opacity: activePlayer === 'B' ? 1 : 0,
                  zIndex: activePlayer === 'B' ? 2 : 1,
                  pointerEvents: activePlayer === 'B' ? 'auto' : 'none',
                  transition: 'opacity 0.04s ease-out',
                }}
                onError={() => setSourceVideoError(true)}
              />
            )}

            {/* Film Grain CSS Overlay */}
            {activeShot.filterEffect?.enabled && activeShot.filterEffect.type === 'film_grain' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  opacity: 0.15,
                  backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`,
                  backgroundSize: '4px 4px',
                  mixBlendMode: 'overlay',
                }}
              />
            )}

            {/* Vignette CSS Mask */}
            {((activeShot.colorGrading?.vignette ?? 0) > 0 || (activeShot.filterEffect?.enabled && activeShot.filterEffect.type === 'vignette')) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
                }}
              />
            )}
          </div>
        ) : (
          <div style={{ color: '#475569', fontSize: '0.9rem' }}>
            No visual shot assigned
          </div>
        )}

        {/* ── Text & Titles Overlay Layer ── */}
        {activeTextOverlays.map((txt) => (
          <div
            key={txt.id}
            style={{
              position: 'absolute',
              left: `${txt.positionX || 50}%`,
              top: `${txt.positionY || 20}%`,
              transform: `translate(-50%, -50%) rotate(${txt.rotation || 0}deg)`,
              color: txt.fontColor || '#ffffff',
              fontSize: `${txt.fontSize || 28}px`,
              fontFamily: txt.fontFamily || 'Inter, sans-serif',
              fontWeight: txt.fontWeight || '700',
              backgroundColor: txt.backgroundColor || 'transparent',
              padding: txt.backgroundColor ? '4px 12px' : '0px',
              borderRadius: '6px',
              textShadow: txt.outlineColor ? `0 0 4px ${txt.outlineColor}, 0 2px 8px rgba(0,0,0,0.8)` : '0 2px 8px rgba(0,0,0,0.8)',
              opacity: txt.opacity ?? 1.0,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            {txt.text}
          </div>
        ))}

        {/* ── Real-Time Synchronized Captions Layer (with compact safe-margin default & animation) ── */}
        {captionsVisible && activeCaption && (
          <CaptionOverlayItem
            caption={activeCaption}
            timelineStyle={timeline?.captionStyle}
            currentTime={currentTime}
          />
        )}
      </div>

      {/* ── Transport Bar & Playback Controls ── */}
      <div
        style={{
          padding: '10px 16px',
          background: '#0d131f',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Scrubber Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
          <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#38bdf8', minWidth: '90px' }}>
            {formatTimecode(currentTime)}
          </span>

          <input
            type="range"
            min={0}
            max={Math.max(1, totalDuration)}
            step={0.033}
            value={currentTime}
            onChange={(e) => {
              const t = parseFloat(e.target.value);
              setCurrentTime(t);
              if (audioRef.current) audioRef.current.currentTime = t;
            }}
            style={{
              flex: 1,
              accentColor: '#38bdf8',
              cursor: 'pointer',
              height: '6px',
            }}
          />

          <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#94a3b8', minWidth: '90px', textAlign: 'right' }}>
            {formatTimecode(totalDuration)}
          </span>
        </div>

        {/* Controls Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          {/* Left Transport: Jump, Step, Play/Pause */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-ghost btn-xs"
              onClick={jumpToPreviousShot}
              title="Jump to Previous Clip"
              style={{ fontSize: '0.9rem', padding: '4px 8px' }}
            >
              ⏮
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => stepFrames(-1)}
              title="Step -1 Frame (Left Arrow)"
              style={{ fontSize: '0.8rem', padding: '4px 6px' }}
            >
              ◀ 1F
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => seekSeconds(-1)}
              title="Step -1s"
              style={{ fontSize: '0.8rem', padding: '4px 6px' }}
            >
              -1s
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isPlaying ? '#38bdf8' : '#2563eb',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
              }}
              title="Play/Pause (Space)"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button
              className="btn btn-ghost btn-xs"
              onClick={() => seekSeconds(1)}
              title="Step +1s"
              style={{ fontSize: '0.8rem', padding: '4px 6px' }}
            >
              +1s
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => stepFrames(1)}
              title="Step +1 Frame (Right Arrow)"
              style={{ fontSize: '0.8rem', padding: '4px 6px' }}
            >
              1F ▶
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={jumpToNextShot}
              title="Jump to Next Clip"
              style={{ fontSize: '0.9rem', padding: '4px 8px' }}
            >
              ⏭
            </button>
          </div>

          {/* Center: Preview Scope Mode Buttons + Captions Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: '6px' }}>
            <button
              className={`btn btn-xs ${previewMode === 'full' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPreviewMode('full')}
              title="Preview entire sequence from beginning to end"
              style={{ fontSize: '0.72rem' }}
            >
              Full Video
            </button>
            <button
              className={`btn btn-xs ${previewMode === 'clip' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setPreviewMode('clip');
                if (activeShot) setCurrentTime(activeShot.timelineStart);
              }}
              title="Loop preview of selected clip only"
              style={{ fontSize: '0.72rem' }}
            >
              Selected Clip
            </button>
            <button
              className={`btn btn-xs ${previewMode === 'range' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setPreviewMode('range');
                if (inPoint !== null) setCurrentTime(inPoint);
              }}
              title="Preview marked In/Out range"
              style={{ fontSize: '0.72rem' }}
            >
              In/Out Range
            </button>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            <button
              className={`btn btn-xs ${captionsVisible ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleCaptionsVisible}
              title={captionsVisible ? 'Captions ON (Click to Hide)' : 'Captions OFF (Click to Show)'}
              style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
            >
              <span>💬</span>
              <span>{captionsVisible ? 'CC ON' : 'CC OFF'}</span>
            </button>
          </div>

          {/* Right: Speed, Volume, Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Speed Selector */}
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.74rem',
                cursor: 'pointer',
              }}
              title="Playback Speed"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2.0">2.0x</option>
            </select>

            {/* Volume Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Unmute' : 'Mute'}
                style={{ fontSize: '0.85rem' }}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : previewVolume}
                onChange={(e) => {
                  setPreviewVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                style={{ width: '60px', accentColor: '#38bdf8', cursor: 'pointer' }}
                title="Preview Audio Volume"
              />
            </div>

            {/* Fullscreen Button */}
            <button
              className="btn btn-ghost btn-xs"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
              style={{ fontSize: '0.9rem' }}
            >
              {isFullscreen ? '⤦' : '⛶'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
