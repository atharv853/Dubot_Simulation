import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getRealtimeServerUrl(): string {
  // 1. Explicit environment variable
  if (process.env.NEXT_PUBLIC_REALTIME_SERVER_URL) {
    return process.env.NEXT_PUBLIC_REALTIME_SERVER_URL;
  }

  // 2. Client-side dynamic detection
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    // Local development or LAN testing
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return `${protocol}//${hostname}:3002`;
    }
    // In production on custom domain or Vercel, if reverse proxy or same domain configured
    return `${protocol}//${hostname}`;
  }

  return 'http://localhost:3002';
}

export function getSocket(token?: string | null, userRole?: string, username?: string): Socket {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  const serverUrl = getRealtimeServerUrl();
  const authToken =
    token || (typeof window !== 'undefined' ? localStorage.getItem('dobot_auth_token') : null);

  socketInstance = io(serverUrl, {
    auth: {
      token: authToken,
      role: userRole,
      username: username,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
  });

  socketInstance.on('connect_error', (err) => {
    console.warn('[REALTIME CLIENT] Connection error:', err.message);
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
