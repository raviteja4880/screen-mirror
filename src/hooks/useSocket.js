/**
 * useSocket — Socket.io Connection Manager
 *
 * Manages the Socket.io connection lifecycle with:
 * - Auto-reconnection with exponential backoff
 * - Connection state tracking
 * - Event listener cleanup
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Backend URL — change this to your deployed backend URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const listenersRef = useRef([]);

  useEffect(() => {
    setConnecting(true);

    // Initialize Socket.io connection
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Socket] Connected: ${socket.id}`);
      setConnected(true);
      setConnecting(false);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${reason}`);
      setConnected(false);
    });

    socket.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempts`);
      setConnected(true);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnect attempt #${attempt}`);
      setConnecting(true);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      setConnecting(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * Emit an event to the server.
   */
  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn(`[Socket] Cannot emit "${event}" — not connected`);
    }
  }, []);

  /**
   * Register a one-time or persistent event listener.
   * Tracked so they can be cleaned up.
   */
  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    listenersRef.current.push({ event, handler });
  }, []);

  /**
   * Remove an event listener.
   */
  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  return {
    socket: socketRef.current,
    socketRef,
    connected,
    connecting,
    emit,
    on,
    off,
  };
}
