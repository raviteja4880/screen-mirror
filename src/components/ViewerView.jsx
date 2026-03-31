/**
 * ViewerView — Screen Viewing Panel
 *
 * Allows the user to:
 * 1. Enter a room ID and join a broadcast
 * 2. Receive and display the WebRTC video stream
 * 3. View performance statistics (FPS, latency, bitrate)
 * 4. Handle disconnections and auto-reconnect
 * 5. Go fullscreen
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useViewerWebRTC } from '../hooks/useWebRTC';

const CONNECTION_STATES = {
  idle: { label: 'Not Connected', className: 'badge-disconnected' },
  connecting: { label: 'Connecting...', className: 'badge-connecting' },
  connected: { label: 'Connected', className: 'badge-connected' },
  reconnecting: { label: 'Reconnecting...', className: 'badge-connecting' },
  failed: { label: 'Failed', className: 'badge-disconnected' },
  disconnected: { label: 'Disconnected', className: 'badge-disconnected' },
};

export default function ViewerView({ socket, initialRoomId }) {
  const [roomInput, setRoomInput] = useState(initialRoomId || '');
  const [isJoined, setIsJoined] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [broadcasterOnline, setBroadcasterOnline] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef(null);
  const videoContainerRef = useRef(null);

  const {
    handleOffer,
    handleIceCandidate,
    cleanup,
    remoteStream,
    connectionState,
    stats,
  } = useViewerWebRTC(socket);

  // ── Attach stream to video element ──────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      videoRef.current.play().catch(err => {
        console.warn('[Viewer] Autoplay failed:', err.message);
      });
      setBroadcasterOnline(true);
    }
  }, [remoteStream]);

  // ── Socket event handlers ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Receive WebRTC offer from broadcaster
    const onOffer = (data) => {
      console.log('[Viewer] Received offer from broadcaster');
      handleOffer(data);
    };

    // Receive ICE candidates
    const onIceCandidate = (data) => {
      handleIceCandidate(data);
    };

    // Broadcaster left
    const onBroadcasterDisconnected = () => {
      console.log('[Viewer] Broadcaster disconnected');
      setBroadcasterOnline(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    // Broadcaster came back
    const onBroadcasterReconnected = () => {
      console.log('[Viewer] Broadcaster reconnected');
      setBroadcasterOnline(true);
    };

    // Error from server
    const onError = ({ message }) => {
      setJoinError(message);
      setIsJoined(false);
    };

    socket.on('offer', onOffer);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('broadcaster-disconnected', onBroadcasterDisconnected);
    socket.on('broadcaster-reconnected', onBroadcasterReconnected);
    socket.on('error', onError);

    return () => {
      socket.off('offer', onOffer);
      socket.off('ice-candidate', onIceCandidate);
      socket.off('broadcaster-disconnected', onBroadcasterDisconnected);
      socket.off('broadcaster-reconnected', onBroadcasterReconnected);
      socket.off('error', onError);
    };
  }, [socket, handleOffer, handleIceCandidate]);

  // ── Fullscreen listener ──────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
  }, []);

  // ── Join a broadcast room ────────────────────────────────────────────────
  const joinRoom = () => {
    const trimmed = roomInput.trim().toUpperCase();
    if (!trimmed) {
      setJoinError('Please enter a Room ID.');
      return;
    }
    if (!socket) {
      setJoinError('Not connected to server. Please wait...');
      return;
    }

    setJoinError(null);
    setIsJoined(true);

    // Tell the server we want to join this room as viewer
    socket.emit('viewer-join', { roomId: trimmed });
    console.log(`[Viewer] Joining room: ${trimmed}`);
  };

  // ── Leave the room ───────────────────────────────────────────────────────
  const leaveRoom = () => {
    cleanup();
    setIsJoined(false);
    setBroadcasterOnline(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // ── Toggle fullscreen ────────────────────────────────────────────────────
  const toggleFullscreen = async () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      await videoContainerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  // ── Handle Enter key in room input ──────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') joinRoom();
  };

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => () => cleanup(), [cleanup]);

  const stateInfo = CONNECTION_STATES[connectionState] || CONNECTION_STATES.idle;

  const getQualityColor = () => {
    switch (stats.quality) {
      case 'good': return 'var(--accent-success)';
      case 'fair': return 'var(--accent-warning)';
      case 'poor': return 'var(--accent-danger)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="viewer-view animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Join Panel ── */}
      {!isJoined ? (
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>
            📺 Join a Broadcast
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 24 }}>
            Enter the Room ID shared by your broadcaster
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input
              className="input"
              type="text"
              placeholder="Enter Room ID (e.g. A1B2C3D4)"
              value={roomInput}
              onChange={e => setRoomInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              maxLength={12}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="btn btn-primary"
              onClick={joinRoom}
              disabled={!socket || !roomInput.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              🔗 Join
            </button>
          </div>

          {joinError && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              color: '#f87171',
              fontSize: '0.875rem',
            }}>
              ⚠️ {joinError}
            </div>
          )}

          <div className="divider" />

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: 8, color: 'var(--text-secondary)' }}>
              How it works
            </h4>
            <ol style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Ask the broadcaster for their Room ID</li>
              <li>Paste it above and click Join</li>
              <li>The stream will appear automatically via WebRTC</li>
              <li>No plugin or software needed — works in your browser</li>
            </ol>
          </div>
        </div>

      ) : (
        /* ── Video Stream Panel ── */
        <div className="card animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>
                Watching Room <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{roomInput}</span>
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`badge ${stateInfo.className}`}>
                {connectionState === 'connected' && <span className="pulse-dot" />}
                {stateInfo.label}
              </span>
              <button className="btn btn-danger btn-sm" onClick={leaveRoom}>
                ✕ Leave
              </button>
            </div>
          </div>

          {/* Video */}
          <div className="video-wrapper" ref={videoContainerRef} style={{ minHeight: 300 }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
              onClick={toggleFullscreen}
            />

            {/* No stream overlay */}
            {!remoteStream && (
              <div className="video-overlay">
                {(connectionState === 'connecting' || connectionState === 'connecting') ? (
                  <>
                    <div className="spinner" />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 12 }}>
                      Connecting to broadcaster...
                    </p>
                  </>
                ) : !broadcasterOnline ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>📡</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', fontWeight: 600 }}>
                      Waiting for broadcast to start...
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 8 }}>
                      The broadcaster hasn't started streaming yet
                    </p>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div className="spinner" />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 12 }}>
                      Stream starting...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Broadcaster offline overlay */}
            {remoteStream && !broadcasterOnline && (
              <div className="video-overlay">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
                  <p style={{ color: '#fbbf24', fontWeight: 600 }}>Broadcaster disconnected</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
                    Waiting for them to reconnect...
                  </p>
                </div>
              </div>
            )}

            {/* Fullscreen hint */}
            {remoteStream && broadcasterOnline && (
              <div style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.6)',
              }}>
                Click for fullscreen
              </div>
            )}
          </div>

          {/* Performance Stats */}
          <div className="stats-grid" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>
                {stats.fps || 0}
              </span>
              <span className="stat-label">FPS</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                {stats.latency || '—'}
              </span>
              <span className="stat-label">Latency (ms)</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--accent-warning)' }}>
                {stats.bitrate || 0}
              </span>
              <span className="stat-label">Kbps</span>
            </div>
            <div className="stat-card">
              <span
                className="stat-value"
                style={{ color: getQualityColor(), textTransform: 'capitalize', fontSize: '0.9rem' }}
              >
                {stats.quality || '—'}
              </span>
              <span className="stat-label">Quality</span>
            </div>
          </div>

          {/* Fullscreen button */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={toggleFullscreen}
              style={{ flex: 1 }}
            >
              {isFullscreen ? '⊡ Exit Fullscreen' : '⛶ Fullscreen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
