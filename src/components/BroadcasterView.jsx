/**
 * BroadcasterView — Screen Sharing Panel
 *
 * Allows the user to:
 * 1. Generate a room ID
 * 2. Start capturing their screen
 * 3. Stream to multiple connected viewers via WebRTC
 * 4. Monitor viewer count and performance stats
 * 5. Control stream quality (Low/Medium/High/Ultra)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBroadcasterWebRTC, QUALITY_PRESETS } from '../hooks/useWebRTC';

const ICONS = {
  monitor: '🖥️',
  stop: '⏹️',
  copy: '📋',
  check: '✓',
  users: '👥',
  wifi: '📶',
  record: '🔴',
  settings: '⚙️',
  mic: '🎙️',
  nomic: '🔇',
};

export default function BroadcasterView({ socket, roomId, onRoomCreated }) {
  const [isSharing, setIsSharing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [quality, setQuality] = useState('medium');
  const [shareAudio, setShareAudio] = useState(false);
  const [localRoomId, setLocalRoomId] = useState(roomId || '');
  const [broadcastError, setBroadcastError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const previewVideoRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const {
    startCapture,
    makeOffer,
    handleAnswer,
    handleIceCandidate,
    applyQuality,
    startStatsCollection,
    removePeer,
    cleanup,
    stats,
  } = useBroadcasterWebRTC(socket);

  // Stable refs for socket event handlers — prevents re-registering listeners
  // every time these callbacks change reference (which caused duplicate offers)
  const makeOfferRef = useRef(makeOffer);
  const handleAnswerRef = useRef(handleAnswer);
  const handleIceCandidateRef = useRef(handleIceCandidate);
  makeOfferRef.current = makeOffer;
  handleAnswerRef.current = handleAnswer;
  handleIceCandidateRef.current = handleIceCandidate;

  // ── Generate a new room ID ──────────────────────────────────────────────
  const generateRoom = useCallback(async () => {
    try {
      const res = await fetch('/create-room');
      const data = await res.json();
      setLocalRoomId(data.roomId);
      if (onRoomCreated) onRoomCreated(data.roomId);
    } catch {
      // Fallback: generate locally
      const id = Math.random().toString(36).substr(2, 8).toUpperCase();
      setLocalRoomId(id);
      if (onRoomCreated) onRoomCreated(id);
    }
  }, [onRoomCreated]);

  // Auto-generate room on mount if none provided
  useEffect(() => {
    if (!localRoomId) generateRoom();
  }, []);

  // ── Socket event handlers ───────────────────────────────────────────────
  // Depend only on [socket] so this runs exactly once per socket instance.
  // Callbacks read from refs so they're always current without triggering re-runs.
  useEffect(() => {
    if (!socket) return;

    const onViewerJoined = ({ viewerId, viewerCount: count }) => {
      console.log(`[Broadcaster] Viewer joined: ${viewerId}`);
      setViewerCount(count);
      makeOfferRef.current(viewerId);   // use ref — avoids stale closure & dep loop
    };

    const onAnswer = ({ answer, viewerId }) => {
      handleAnswerRef.current({ answer, viewerId });
    };

    const onIceCandidate = ({ candidate, fromId }) => {
      handleIceCandidateRef.current({ candidate, fromId });
    };

    const onViewerDisconnected = ({ viewerCount: count }) => {
      setViewerCount(count);
    };

    const onViewerCountUpdate = ({ count }) => {
      setViewerCount(count);
    };

    socket.on('viewer-joined', onViewerJoined);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('viewer-disconnected', onViewerDisconnected);
    socket.on('viewer-count-update', onViewerCountUpdate);

    return () => {
      socket.off('viewer-joined', onViewerJoined);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onIceCandidate);
      socket.off('viewer-disconnected', onViewerDisconnected);
      socket.off('viewer-count-update', onViewerCountUpdate);
    };
  }, [socket]); // ← only socket, not makeOffer/handleAnswer (avoids duplicate handlers)

  // ── Start broadcasting ──────────────────────────────────────────────────
  const startBroadcast = async () => {
    setBroadcastError(null);
    try {
      if (!localRoomId) {
        await generateRoom();
      }

      // Capture screen
      const stream = await startCapture(quality);

      // Show preview
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.muted = true;
        previewVideoRef.current.play().catch(() => {});
      }

      // Register as broadcaster in the room
      socket.emit('broadcaster-join', { roomId: localRoomId });

      // Handle stream ended by user (OS screen share dialog)
      stream.getVideoTracks()[0].onended = () => {
        stopBroadcast();
      };

      setIsSharing(true);

      // Start elapsed timer
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Begin collecting performance stats
      startStatsCollection();

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setBroadcastError('Permission denied. Please allow screen sharing when prompted.');
      } else {
        setBroadcastError(`Failed to start: ${err.message}`);
      }
      console.error('[Broadcaster] Start failed:', err);
    }
  };

  // ── Stop broadcasting ───────────────────────────────────────────────────
  const stopBroadcast = () => {
    cleanup();
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsSharing(false);
    setViewerCount(0);
    setElapsedTime(0);
  };

  // ── Copy room ID ────────────────────────────────────────────────────────
  const copyRoomId = async () => {
    if (!localRoomId) return;
    await navigator.clipboard.writeText(localRoomId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cleanup]);

  // ── Quality change handler ──────────────────────────────────────────────
  const handleQualityChange = async (newQuality) => {
    setQuality(newQuality);
    if (isSharing) await applyQuality(newQuality);
  };

  // ── Elapsed time formatter ──────────────────────────────────────────────
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="broadcaster-view animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Room Setup Panel ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>
              {ICONS.monitor} Your Screen Studio
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Share your Room ID with viewers to let them watch your screen
            </p>
          </div>
          {isSharing && (
            <span className="badge badge-live">
              <span className="pulse-dot" /> LIVE
            </span>
          )}
        </div>

        <div className="divider" />

        {/* Room ID */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
            Room ID
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="room-code" style={{ flex: 1 }}>
              {localRoomId || '—'}
            </div>
            <button
              className="btn btn-secondary btn-icon"
              onClick={copyRoomId}
              title="Copy Room ID"
              style={{ width: 48, height: 48 }}
            >
              {isCopied ? ICONS.check : ICONS.copy}
            </button>
            {!isSharing && (
              <button className="btn btn-secondary btn-sm" onClick={generateRoom}>
                New ID
              </button>
            )}
          </div>
        </div>

        {/* Quality & Audio Settings */}
        {!isSharing && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                Stream Quality
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.keys(QUALITY_PRESETS).map(q => (
                  <button
                    key={q}
                    className={`btn btn-sm ${quality === q ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleQualityChange(q)}
                    style={{ textTransform: 'capitalize', flex: 1 }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {broadcastError && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: '#f87171',
            fontSize: '0.875rem',
            marginBottom: 16,
          }}>
            ⚠️ {broadcastError}
          </div>
        )}

        {/* Start / Stop Button */}
        <div style={{ display: 'flex', gap: 12 }}>
          {!isSharing ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={startBroadcast}
              disabled={!socket}
              style={{ flex: 1 }}
            >
              🔴 Start Broadcasting
            </button>
          ) : (
            <button
              className="btn btn-danger btn-lg"
              onClick={stopBroadcast}
              style={{ flex: 1 }}
            >
              {ICONS.stop} Stop Broadcast
            </button>
          )}
        </div>
      </div>

      {/* ── Live Preview ── */}
      {isSharing && (
        <div className="card animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Live Preview</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)', fontSize: '0.875rem' }}>
                ⏱ {formatTime(elapsedTime)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {ICONS.users} {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="video-wrapper">
            <video
              ref={previewVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {viewerCount === 0 && (
              <div className="video-overlay" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Waiting for viewers to join...
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
                    Share the Room ID: <strong style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{localRoomId}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Performance Stats */}
          <div className="stats-grid" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.fps || 0}</span>
              <span className="stat-label">FPS</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{stats.bitrate || 0}</span>
              <span className="stat-label">Kbps</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-success)' }}>{viewerCount}</span>
              <span className="stat-label">Viewers</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-warning)', textTransform: 'capitalize', fontSize: '1rem' }}>
                {quality}
              </span>
              <span className="stat-label">Quality</span>
            </div>
          </div>

          {/* Live Quality Switching */}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              Adjust Quality Live
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(QUALITY_PRESETS).map(q => (
                <button
                  key={q}
                  className={`btn btn-sm ${quality === q ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleQualityChange(q)}
                  style={{ flex: 1, textTransform: 'capitalize' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
