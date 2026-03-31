/**
 * Header — Application Navigation Bar
 *
 * Shows the app branding and connection status indicator.
 */

import React from 'react';

export default function Header({ connected, connecting }) {
  return (
    <header style={{
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(8, 11, 18, 0.8)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--gradient-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.125rem',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
        }}>
          📡
        </div>
        <div>
          <div style={{
            fontSize: '1.0625rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            ScreenCast
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            WebRTC Streaming
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: connected
            ? 'var(--accent-success)'
            : connecting
              ? 'var(--accent-warning)'
              : 'var(--accent-danger)',
          boxShadow: connected
            ? '0 0 8px var(--accent-success)'
            : connecting
              ? '0 0 8px var(--accent-warning)'
              : 'none',
          animation: (connected || connecting) ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {connected ? 'Connected to server' : connecting ? 'Connecting...' : 'Disconnected'}
        </span>
      </div>
    </header>
  );
}
