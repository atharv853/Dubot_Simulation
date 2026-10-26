import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getRealtimeServerUrl(): string {
  // 1. Explicit environment variable
  if (process.env.NEXT_PUBLIC_REALTIME_SERVER_URL) {
    return process.env.NEXT_PUBLIC_REALTIME_SERVER_URL;
  }

  // 2. Client-side dynamic detection
  if (typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;
    // If running on local dev port (e.g. 3000), default relay is on 3002
    if (port === '3000' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return `${protocol}//${hostname}:3002`;
    }
    // If deployed on Vercel (serverless), route WebSockets to persistent Render backend
    if (hostname.includes('vercel.app')) {
      return 'https://dubot-simulation.onrender.com';
    }
    // In production on Render or custom domain
    return `${protocol}//${hostname}`;
  }

  return 'http://localhost:3002';
}

export function getSocket(token?: string | null, userRole?: string, username?: string): Socket {
  // Reuse existing socket instance without tearing it down during connection handshake
  if (socketInstance) {
    if (token && socketInstance.auth) (socketInstance.auth as any).token = token;
    if (userRole && socketInstance.auth) (socketInstance.auth as any).role = userRole;
    if (username && socketInstance.auth) (socketInstance.auth as any).username = username;

    if (!socketInstance.connected && socketInstance.disconnected) {
      socketInstance.connect();
    }
    return socketInstance;
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
    timeout: 6000,
    autoConnect: true,
  });

  socketInstance.on('connect_error', (err) => {
    // Expected on Vercel when an external persistent WebSocket backend is not configured yet
    console.debug('[REALTIME CLIENT] Socket.IO connection note:', err.message);
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
