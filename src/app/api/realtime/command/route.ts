import { NextRequest, NextResponse } from 'next/server';
import { queueCommand, recordCommandResult, getCommandResult } from '@/lib/realtime/serverlessRelay';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Host reporting command result
    if (body.action === 'report_result' && body.result) {
      recordCommandResult(body.result);
      return NextResponse.json({ success: true });
    }

    // Controller submitting a command
    if (body.command) {
      const res = queueCommand(body.command);
      if (!res.accepted) {
        return NextResponse.json({ success: false, status: 'rejected', reason: res.reason }, { status: 400 });
      }
      return NextResponse.json({ success: true, status: 'accepted', commandId: body.command.commandId });
    }

    return NextResponse.json({ success: false, error: 'Invalid command request' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const commandId = req.nextUrl.searchParams.get('commandId');
  if (commandId) {
    const result = getCommandResult(commandId);
    return NextResponse.json({ success: true, result });
  }
  return NextResponse.json({ success: false, error: 'commandId parameter required' }, { status: 400 });
}
