import { NextRequest, NextResponse } from 'next/server';
import { updateHostState, getAuthoritativeState, touchController, popPendingCommands } from '@/lib/realtime/serverlessRelay';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state, isHost } = body;

    if (isHost && state) {
      const updated = updateHostState(state);
      // Host immediately receives any pending commands submitted by the controller
      const pendingCommands = popPendingCommands();
      return NextResponse.json({ success: true, state: updated, pendingCommands });
    }

    return NextResponse.json({ success: false, error: 'Invalid state payload' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role');
  if (role === 'controller') {
    touchController();
  }

  const state = getAuthoritativeState();
  return NextResponse.json({ success: true, state });
}
