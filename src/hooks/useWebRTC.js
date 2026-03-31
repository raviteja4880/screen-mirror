/**
 * useWebRTC — Core WebRTC Logic Hook
 *
 * Manages all WebRTC peer connections for the broadcaster side.
 * Handles multiple viewers simultaneously by maintaining a Map of
 * RTCPeerConnection instances keyed by viewer socket ID.
 *
 * WebRTC Flow (Broadcaster perspective):
 * 1. Broadcaster gets screen stream via getDisplayMedia
 * 2. When viewer joins → create RTCPeerConnection for that viewer
 * 3. Add stream tracks to peer connection
 * 4. Create SDP offer → set local description → send to viewer via signaling
 * 5. Receive SDP answer → set remote description
 * 6. Exchange ICE candidates bidirectionally
 */

import { useRef, useCallback, useState } from 'react';

// ── STUN Server Configuration ──────────────────────────────────────────────
// Using Google's public STUN servers (free, no auth required)
// These help peers discover their public IPs for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ── Video Quality Presets ─────────────────────────────────────────────────
export const QUALITY_PRESETS = {
  low:    { width: 1280, height: 720,  frameRate: 15, bitrate: 1_000_000  },
  medium: { width: 1920, height: 1080, frameRate: 30, bitrate: 3_000_000  },
  high:   { width: 2560, height: 1440, frameRate: 60, bitrate: 8_000_000  },
  ultra:  { width: 3840, height: 2160, frameRate: 60, bitrate: 15_000_000 },
};

export function useBroadcasterWebRTC(socket) {
  // Map of viewerId → RTCPeerConnection
  const peersRef = useRef(new Map());
  const streamRef = useRef(null);
  // Keep a ref to the socket so closures always read the latest socket
  // without needing socket in their dependency arrays (avoids re-creating
  // callbacks on every render which caused duplicate offer loops).
  const socketRef = useRef(socket);
  const [stats, setStats] = useState({ fps: 0, bitrate: 0, viewers: 0 });
  const statsIntervalRef = useRef(null);

  // Keep socketRef in sync whenever the socket prop changes
  socketRef.current = socket;

  /**
   * Capture the screen using the browser's Screen Capture API.
   * Returns a MediaStream or throws if permission denied.
   */
  const startCapture = useCallback(async (quality = 'medium') => {
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
        width:     { ideal: preset.width },
        height:    { ideal: preset.height },
        frameRate: { ideal: preset.frameRate },
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100,
      }
    });

    streamRef.current = stream;
    return stream;
  }, []);

  /**
   * Create a new RTCPeerConnection for a specific viewer.
   * Closes any existing connection for that viewer first to avoid duplicates.
   */
  const createPeerForViewer = useCallback((viewerId) => {
    // Close existing connection for this viewer to avoid duplicates
    const existing = peersRef.current.get(viewerId);
    if (existing) {
      existing.close();
      peersRef.current.delete(viewerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add all current tracks to this peer connection
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current);
      });
    }

    // Relay ICE candidates to this specific viewer via signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { targetId: viewerId, candidate });
      }
    };

    // Log connection state changes for debugging
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Viewer ${viewerId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    peersRef.current.set(viewerId, pc);
    return pc;
  }, []); // no deps — reads from refs only

  /**
   * Create and send a WebRTC offer to a specific viewer.
   * Guards against sending duplicate offers if one is already in-flight.
   */
  const makeOffer = useCallback(async (viewerId) => {
    // Guard: skip if we already have an active/pending connection for this viewer
    const existing = peersRef.current.get(viewerId);
    if (existing && ['connecting', 'connected', 'have-local-offer'].includes(
      existing.connectionState || existing.signalingState
    )) {
      console.log(`[WebRTC] Skipping duplicate offer for ${viewerId} (state: ${existing.signalingState})`);
      return;
    }

    const pc = createPeerForViewer(viewerId);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });

      await pc.setLocalDescription(offer);

      if (socketRef.current) {
        socketRef.current.emit('offer', { targetId: viewerId, offer: pc.localDescription });
      }

      console.log(`[WebRTC] Offer sent to viewer: ${viewerId}`);
    } catch (err) {
      console.error('[WebRTC] Failed to create offer:', err);
    }
  }, [createPeerForViewer]);

  /**
   * Handle SDP answer received from a viewer.
   * This completes the offer/answer handshake.
   */
  const handleAnswer = useCallback(async ({ answer, viewerId }) => {
    const pc = peersRef.current.get(viewerId);
    if (!pc) {
      console.warn(`[WebRTC] No peer connection for viewer: ${viewerId}`);
      return;
    }

    try {
      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`[WebRTC] Unexpected state ${pc.signalingState} for answer`);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[WebRTC] Answer received from viewer: ${viewerId}`);
    } catch (err) {
      console.error('[WebRTC] Failed to set remote description:', err);
    }
  }, []);

  /**
   * Handle ICE candidate from a viewer.
   * Adds the candidate to the correct peer connection.
   */
  const handleIceCandidate = useCallback(async ({ candidate, fromId }) => {
    const pc = peersRef.current.get(fromId);
    if (!pc || !candidate) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Often harmless if remote description not yet set
      if (!err.message.includes('Unknown ufrag')) {
        console.warn('[WebRTC] ICE candidate error:', err.message);
      }
    }
  }, []);

  /**
   * Apply adaptive bitrate settings to all active peer connections.
   * Adjusts video encoder parameters based on quality preset.
   */
  const applyQuality = useCallback(async (quality) => {
    const preset = QUALITY_PRESETS[quality];
    if (!preset) return;

    for (const [, pc] of peersRef.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (!sender) continue;

      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = preset.bitrate;
      params.encodings[0].maxFramerate = preset.frameRate;

      try {
        await sender.setParameters(params);
      } catch (e) {
        console.warn('[WebRTC] Could not apply quality params:', e.message);
      }
    }
  }, []);

  /**
   * Collect performance stats from all active peer connections.
   * Returns aggregated FPS, bitrate, and connection states.
   */
  const startStatsCollection = useCallback((onStats) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    statsIntervalRef.current = setInterval(async () => {
      let totalBitrate = 0;
      let fps = 0;
      let connectedCount = 0;

      for (const [, pc] of peersRef.current) {
        if (pc.connectionState === 'connected') {
          connectedCount++;
          try {
            const reports = await pc.getStats();
            reports.forEach(report => {
              if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                // Calculate bitrate from bytes sent
                if (report.bytesSent && report.timestamp) {
                  totalBitrate += (report.bytesSent * 8) / 1000; // kbps approx
                }
                if (report.framesPerSecond) {
                  fps = Math.max(fps, report.framesPerSecond);
                }
              }
            });
          } catch (e) { /* ignore stats errors */ }
        }
      }

      const statsData = {
        fps: Math.round(fps),
        bitrate: Math.round(totalBitrate),
        viewers: connectedCount,
        peerCount: peersRef.current.size,
      };

      setStats(statsData);
      if (onStats) onStats(statsData);
    }, 2000);
  }, []);

  /**
   * Clean up a single viewer's peer connection.
   */
  const removePeer = useCallback((viewerId) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(viewerId);
    }
  }, []);

  /**
   * Full cleanup: stop stream, close all peers, clear intervals.
   */
  const cleanup = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    for (const [, pc] of peersRef.current) {
      pc.close();
    }
    peersRef.current.clear();
    setStats({ fps: 0, bitrate: 0, viewers: 0 });
  }, []);

  return {
    startCapture,
    makeOffer,
    handleAnswer,
    handleIceCandidate,
    applyQuality,
    startStatsCollection,
    removePeer,
    cleanup,
    streamRef,
    peersRef,
    stats,
  };
}


/**
 * useViewerWebRTC — WebRTC logic for the viewer side.
 *
 * WebRTC Flow (Viewer perspective):
 * 1. Server notifies viewer about broadcaster
 * 2. Receive SDP offer from broadcaster → set remote description
 * 3. Create SDP answer → set local description → send to broadcaster
 * 4. Exchange ICE candidates
 * 5. ontrack fires → attach MediaStream to video element
 */
export function useViewerWebRTC(socket) {
  const pcRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [stats, setStats] = useState({ fps: 0, latency: 0, quality: 'unknown' });
  const statsIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  /**
   * Create a new RTCPeerConnection for connecting to broadcaster.
   */
  const createPeerConnection = useCallback(() => {
    // Close any existing connection
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Capture incoming tracks (this fires when broadcaster sends video)
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      setRemoteStream(event.streams[0]);
    };

    // Relay ICE candidates to broadcaster via signaling
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socket) {
        const broadcasterId = socket._broadcasterId;
        if (broadcasterId) {
          socket.emit('ice-candidate', { targetId: broadcasterId, candidate });
        }
      }
    };

    // Track connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
      setConnectionState(pc.connectionState);

      if (pc.connectionState === 'connected') {
        startStatsCollection(pc);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setConnectionState('reconnecting');
        scheduleReconnect();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE] Connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  }, [socket]);

  /**
   * Handle incoming WebRTC offer from broadcaster.
   * Creates answer and returns it for sending via signaling.
   */
  const handleOffer = useCallback(async ({ offer, broadcasterId }) => {
    // Store broadcaster ID for ICE relay
    if (socket) socket._broadcasterId = broadcasterId;

    const pc = createPeerConnection();
    setConnectionState('connecting');

    try {
      // Set broadcaster's offer as remote description
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and set our answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer back to broadcaster
      socket.emit('answer', { targetId: broadcasterId, answer: pc.localDescription });

      console.log('[WebRTC] Answer sent to broadcaster');
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer:', err);
      setConnectionState('failed');
    }
  }, [createPeerConnection, socket]);

  /**
   * Handle incoming ICE candidate from broadcaster.
   */
  const handleIceCandidate = useCallback(async ({ candidate }) => {
    const pc = pcRef.current;
    if (!pc || !candidate) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      if (!err.message.includes('Unknown ufrag')) {
        console.warn('[WebRTC] ICE candidate error:', err.message);
      }
    }
  }, []);

  /**
   * Collect performance statistics from the receiver's perspective.
   * Measures inbound video FPS and jitter.
   */
  const startStatsCollection = useCallback((pc) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

    let lastBytesReceived = 0;
    let lastTimestamp = 0;

    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const reports = await pc.getStats();
        let fps = 0;
        let latency = 0;
        let bitrate = 0;

        reports.forEach(report => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            fps = report.framesPerSecond || 0;

            // Estimated bitrate
            if (lastBytesReceived > 0 && lastTimestamp > 0) {
              const dt = (report.timestamp - lastTimestamp) / 1000;
              bitrate = ((report.bytesReceived - lastBytesReceived) * 8) / dt / 1000;
            }
            lastBytesReceived = report.bytesReceived || 0;
            lastTimestamp = report.timestamp || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            latency = Math.round(report.currentRoundTripTime * 1000) || 0;
          }
        });

        setStats({
          fps: Math.round(fps),
          latency,
          bitrate: Math.round(bitrate),
          quality: fps >= 25 ? 'good' : fps >= 15 ? 'fair' : 'poor',
        });
      } catch (e) { /* ignore */ }
    }, 2000);
  }, []);

  /**
   * Schedule a reconnection attempt after a short delay.
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return; // Already scheduled
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (socket && socket._broadcasterId) {
        console.log('[WebRTC] Attempting reconnect...');
        socket.emit('request-reconnect', { broadcasterId: socket._broadcasterId });
      }
    }, 3000);
  }, [socket]);

  /**
   * Clean up all resources.
   */
  const cleanup = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setConnectionState('idle');
  }, []);

  return {
    handleOffer,
    handleIceCandidate,
    cleanup,
    remoteStream,
    connectionState,
    stats,
  };
}
