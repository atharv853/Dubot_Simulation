import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, SESSION_COOKIE_NAME } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  try {
    let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        username: payload.username,
        role: payload.role,
        sessionId: payload.sessionId,
      },
      token,
    });
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
