/**
 * App — Root Application Component
 *
 * Manages the tab system (Broadcast / Watch) and provides
 * the shared socket connection to child views.
 *
 * Architecture:
 * ┌─────────────────────────────────────────┐
 * │                  App                     │
 * │  ┌──────────┐   Socket.io connection     │
 * │  │  Header  │   ──────────────────────── │
 * │  └──────────┘                            │
 * │  ┌──────────┬──────────┐                 │
 * │  │Broadcast │  Watch   │ ← Tab selector  │
 * │  └──────────┴──────────┘                 │
 * │  ┌────────────────────────────────────┐  │
 * │  │  BroadcasterView  │  ViewerView   │  │
 * │  └────────────────────────────────────┘  │
 * └─────────────────────────────────────────┘
 */

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Header from './components/Header';
import BroadcasterView from './components/BroadcasterView';
import ViewerView from './components/ViewerView';
import { ToastProvider } from './components/Toast';

// Backend URL — update this when deploying
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function App() {
  const [activeTab, setActiveTab] = useState('broadcast'); // 'broadcast' | 'watch'
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState('');
  const socketRef = useRef(null);

  // ── Initialize Socket.io connection ────────────────────────────────────
  useEffect(() => {
    setConnecting(true);

    const sock = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });

    socketRef.current = sock;

    sock.on('connect', () => {
      console.log(`[App] Socket connected: ${sock.id}`);
      setConnected(true);
      setConnecting(false);
      setSocket(sock);
    });

    sock.on('disconnect', (reason) => {
      console.log(`[App] Socket disconnected: ${reason}`);
      setConnected(false);
    });

    sock.on('reconnect', () => {
      setConnected(true);
      setConnecting(false);
    });

    sock.on('reconnect_attempt', () => {
      setConnecting(true);
    });

    sock.on('connect_error', () => {
      setConnecting(false);
    });

    // Set socket immediately so components can render
    // (they'll handle the disconnected state gracefully)
    setSocket(sock);

    return () => {
      sock.disconnect();
    };
  }, []);

  // ── Tab styles ──────────────────────────────────────────────────────────
  const tabStyle = (isActive) => ({
    flex: 1,
    padding: '12px 24px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.9375rem',
    fontWeight: 600,
    transition: 'var(--transition)',
    background: isActive
      ? 'var(--gradient-primary)'
      : 'transparent',
    color: isActive ? 'white' : 'var(--text-muted)',
    boxShadow: isActive ? '0 4px 15px rgba(99,102,241,0.35)' : 'none',
  });

  return (
    <ToastProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Sticky Header */}
        <Header connected={connected} connecting={connecting} />

        {/* Main Content */}
        <main style={{
          flex: 1,
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
          padding: '32px 20px 48px',
        }}>

          {/* ── Hero Section ── */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 16px',
              marginBottom: 20,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--accent-primary)', fontWeight: 500, letterSpacing: '0.05em' }}>
                Powered by WebRTC — Peer-to-Peer
              </span>
            </div>

            <h1 style={{
              background: 'var(--gradient-primary)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 16,
              letterSpacing: '-0.03em',
            }}>
              Real-Time Screen Sharing
            </h1>

            <p style={{
              color: 'var(--text-secondary)',
              maxWidth: 520,
              margin: '0 auto',
              fontSize: '1.0625rem',
              lineHeight: 1.7,
            }}>
              Share your screen instantly with anyone using WebRTC peer-to-peer technology.
              No plugins. No lag. No limits.
            </p>
          </div>

          {/* ── Feature Pills ── */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 48,
          }}>
            {[
              { icon: '⚡', label: 'Ultra Low Latency' },
              { icon: '🔒', label: 'End-to-End Encrypted' },
              { icon: '🌐', label: 'Browser Native' },
              { icon: '👥', label: 'Multi-Viewer Support' },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)',
                padding: '8px 16px',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}>
                {icon} {label}
              </div>
            ))}
          </div>

          {/* ── Tab Selector ── */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 6,
            display: 'flex',
            gap: 4,
            marginBottom: 28,
          }}>
            <button style={tabStyle(activeTab === 'broadcast')} onClick={() => setActiveTab('broadcast')}>
              🔴 Start Broadcasting
            </button>
            <button style={tabStyle(activeTab === 'watch')} onClick={() => setActiveTab('watch')}>
              📺 Watch Stream
            </button>
          </div>

          {/* ── Active View ── */}
          {activeTab === 'broadcast' ? (
            <BroadcasterView
              socket={socket}
              roomId={currentRoomId}
              onRoomCreated={setCurrentRoomId}
            />
          ) : (
            <ViewerView
              socket={socket}
              initialRoomId={currentRoomId}
            />
          )}

          {/* ── WebRTC Flow Explainer ── */}
          <div className="card" style={{ marginTop: 48 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 16, color: 'var(--text-secondary)' }}>
              🔄 How WebRTC Works Here
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { step: '1', title: 'Screen Capture', desc: 'Browser captures your display using getDisplayMedia API', color: 'var(--accent-primary)' },
                { step: '2', title: 'Signaling', desc: 'Socket.io server exchanges SDP offer/answer between peers', color: 'var(--accent-secondary)' },
                { step: '3', title: 'ICE Negotiation', desc: 'STUN servers help peers discover their public IPs', color: 'var(--accent-cyan)' },
                { step: '4', title: 'P2P Streaming', desc: 'Video flows directly between peers without server relay', color: 'var(--accent-success)' },
              ].map(({ step, title, desc, color }) => (
                <div key={step} style={{
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: color,
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}>{step}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          padding: '20px 24px',
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          fontSize: '0.8125rem',
        }}>
          ScreenCast · Built with React + Socket.io + WebRTC · All P2P, no servers relay your video
        </footer>
      </div>
    </ToastProvider>
  );
}
