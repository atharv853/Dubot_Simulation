# Deployment & Multi-Device Remote Control Guide

This guide describes how to configure, deploy, and test real-time multi-device teleoperation between **Atharv (Host - Laptop)** and **Test (Remote Controller - Smartphone)** for the DOBOT Magician Simulator.

---

## 1. System Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │    PERSISTENT REAL-TIME BACKEND      │
                      │    (Socket.IO / Node.js WSS)        │
                      │  Hosted on Render / Railway / VPS    │
                      └──────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
          WSS Connection                                  WSS Connection
         State Updates & Commands                        Commands & State
                 │                                               │
                 ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │      USER 1: ATHARV    │                     │      USER 2: TEST      │
     │         (HOST)         │                     │      (CONTROLLER)      │
     │   Laptop / Desktop     │                     │       Smartphone       │
     │ Full 3D Robot Simulator│                     │ Mobile-Only Controller │
     │  Kinematics Authority  │                     │   Zero 3D Rendering    │
     └────────────────────────┘                     └────────────────────────┘
```

### Why a Separate Persistent WebSocket Service?
The frontend is hosted on **Vercel**. Serverless environments terminate connections after HTTP request cycles (10-15s timeouts) and do not sustain stateful bidirectional WebSocket connections.

Therefore, the real-time coordination is separated into a lightweight, high-performance Node.js Socket.IO server (`server/index.js`).

---

## 2. Environment Variables Reference

| Variable | Description | Default (Dev) | Production Example |
| :--- | :--- | :--- | :--- |
| `AUTH_SECRET` | Secret key used for signing & verifying JWT tokens | `dobot-magician-secret-key-2024-secure-jwt` | Strong 64-char random string |
| `HOST_USERNAME` | Username for User 1 (Host) | `atharv` | `atharv` |
| `HOST_PASSWORD` | Password for User 1 | `atharv123` | `YourHostStrongPassword!` |
| `CONTROLLER_USERNAME` | Username for User 2 (Controller) | `test` | `test` |
| `CONTROLLER_PASSWORD` | Password for User 2 | `test123` | `YourControllerPassword!` |
| `NEXT_PUBLIC_REALTIME_SERVER_URL` | WebSocket backend URL accessed by client browsers | `http://localhost:3002` | `https://dobot-realtime.onrender.com` |
| `PORT` | Port for the persistent real-time backend | `3002` | `3002` (assigned by provider) |

---

## 3. Step-by-Step Production Deployment

### Step A: Deploy the Real-Time Backend (Free on Render, Railway, or Fly.io)

#### Option 1: Render (Recommended, 1-Click Free Tier)
1. Go to [Render.com](https://render.com) and create a free account.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`Dubot_Simulation`).
4. Set the following settings:
   - **Name**: `dobot-realtime-relay`
   - **Environment**: `Node`
   - **Build Command**: `npm ci --omit=dev`
   - **Start Command**: `node server/index.js`
   - **Plan**: `Free`
5. Under **Environment Variables**, add:
   - `PORT`: `3002` (or let Render set standard `PORT`)
   - `AUTH_SECRET`: Generate a random secret string.
   - `HOST_USERNAME`: `atharv`
   - `HOST_PASSWORD`: `atharv123`
   - `CONTROLLER_USERNAME`: `test`
   - `CONTROLLER_PASSWORD`: `test123`
6. Click **Create Web Service**.
7. Note down your backend service URL (e.g., `https://dobot-realtime-relay.onrender.com`).

#### Option 2: Railway or Fly.io
Deploy directly using the included `Dockerfile`:
```bash
fly launch
# or via Railway CLI:
railway up
```

---

### Step B: Deploy the Next.js Frontend to Vercel

1. In the [Vercel Dashboard](https://vercel.com), open your project `dubot-simulation`.
2. Go to **Settings** -> **Environment Variables**.
3. Add the following variables:
   - `AUTH_SECRET`: (Matches the value configured on the real-time server)
   - `HOST_USERNAME`: `atharv`
   - `HOST_PASSWORD`: `atharv123`
   - `CONTROLLER_USERNAME`: `test`
   - `CONTROLLER_PASSWORD`: `test123`
   - `NEXT_PUBLIC_REALTIME_SERVER_URL`: `https://dobot-realtime-relay.onrender.com` (Your Render/Railway URL)
4. Trigger a deployment by pushing to `main` or clicking **Redeploy**.

---

## 4. Local Testing Across Two Devices (LAN or 2 Browser Windows)

### Testing in 2 Browser Windows on Same Machine:
1. Start both servers:
   ```bash
   npm run dev:all
   ```
   *(Or in separate terminals: `npm run server` and `npm run dev`)*
2. Open **Window 1 (Laptop / Host)**:
   - Navigate to: `http://localhost:3000/login`
   - Click **Quick Login as Atharv (Host)**.
   - Redirects to `/`.
   - The 3D robot simulator appears with the top status indicator: `atharv (HOST)`.
3. Open **Window 2 (Incognito / Mobile Emulation)**:
   - Press `F12` and switch to Mobile Device Emulation (e.g., iPhone 14 Pro or Pixel 7).
   - Navigate to: `http://localhost:3000/login`
   - Click **Quick Login as Test (Remote Controller)**.
   - Redirects to `/controller`.
   - The mobile-first control interface appears (Zero 3D scene loaded).
4. On Window 2 (Phone), press **X+**, **Y+**, or enter coordinates `X: 240, Y: 100, Z: 35` and press **Move**:
   - The 3D robot arm on Window 1 (Laptop) physically animates in real-time.
   - Window 2 receives live updated coordinates and operation status.

### Testing with a Real Smartphone over Local Wi-Fi:
1. Find your laptop's local IP address on your Wi-Fi network (e.g. `192.168.1.50`).
2. Update `.env.local`:
   ```env
   NEXT_PUBLIC_REALTIME_SERVER_URL="http://192.168.1.50:3002"
   ```
3. Run `npm run dev:all`.
4. On your Laptop, open: `http://localhost:3000` (Log in as `atharv`).
5. On your Phone connected to the same Wi-Fi, open: `http://192.168.1.50:3000` (Log in as `test`).
6. You now have true physical multi-device teleoperation!

---

## 5. Security & Safety Checklist

- [x] **Salted Password Hashing**: Passwords are never stored in plaintext and never bundled into frontend client code.
- [x] **Role-Based Routing Middleware**: User 2 (`test` / controller) is strictly prevented from accessing or loading the full 3D simulator route.
- [x] **Workspace Limits Validation**: Out-of-bounds coordinates (e.g. `X > 330` or `Z < -60`) are safely rejected prior to execution.
- [x] **Concurrency & Command Queue Locks**: New movement commands are rejected while the robot is actively moving, preventing collision glitches.
- [x] **Instant Emergency Stop**: `EMERGENCY_STOP` bypasses all queues and freezes all motion immediately across all devices.
- [x] **Host Offline Handling**: If Host disconnects, the controller displays "Host Offline" and movement commands are safely rejected.
