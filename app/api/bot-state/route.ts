export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { settings } from '@/db/schemas/settings';
import { eq } from 'drizzle-orm';

// Chaves usadas no banco
const KEY_TARGETS    = 'bot_targets';
const KEY_RUNNING    = 'bot_is_running';
const KEY_INTERVAL   = 'bot_interval_minutes';
const KEY_JITTER     = 'bot_jitter_percent';
const KEY_SCHED_EN   = 'bot_schedule_enabled';
const KEY_SCHED_ST   = 'bot_schedule_start';
const KEY_SCHED_END  = 'bot_schedule_end';
const KEY_STATUS_EN  = 'bot_status_enabled';
const KEY_GROUPS_EN  = 'bot_groups_enabled';
const KEY_CUR_IDX    = 'bot_current_index';

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

// GET /api/bot-state — retorna estado persistido
export async function GET() {
  try {
    const [
      targetsRaw, runningRaw, intervalRaw, jitterRaw,
      schedEnRaw, schedStRaw, schedEndRaw,
      statusEnRaw, groupsEnRaw, curIdxRaw,
    ] = await Promise.all([
      getSetting(KEY_TARGETS),
      getSetting(KEY_RUNNING),
      getSetting(KEY_INTERVAL),
      getSetting(KEY_JITTER),
      getSetting(KEY_SCHED_EN),
      getSetting(KEY_SCHED_ST),
      getSetting(KEY_SCHED_END),
      getSetting(KEY_STATUS_EN),
      getSetting(KEY_GROUPS_EN),
      getSetting(KEY_CUR_IDX),
    ]);

    return NextResponse.json({
      targets:         targetsRaw  ? JSON.parse(targetsRaw) : [],
      isRunning:       runningRaw  === 'true',
      running:         runningRaw  === 'true',   // alias usado pelo SchedulerPanel
      intervalMinutes: intervalRaw ? parseInt(intervalRaw) : 30,
      jitterPercent:   jitterRaw   ? parseInt(jitterRaw)   : 20,
      scheduleEnabled: schedEnRaw  === 'true',
      scheduleStart:   schedStRaw  ?? '08:00',
      scheduleEnd:     schedEndRaw ?? '22:00',
      statusEnabled:   statusEnRaw === 'true',
      groupsEnabled:   groupsEnRaw !== 'false', // default true
      currentIndex:    curIdxRaw   ? parseInt(curIdxRaw)   : 0,
    });
  } catch (err) {
    console.error('[bot-state] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/bot-state — salva estado
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      targets?:         { id: string; name: string }[];
      isRunning?:       boolean;
      running?:         boolean;   // alias do SchedulerPanel
      intervalMinutes?: number;
      jitterPercent?:   number;
      scheduleEnabled?: boolean;
      scheduleStart?:   string;
      scheduleEnd?:     string;
      statusEnabled?:   boolean;
      groupsEnabled?:   boolean;
      currentIndex?:    number;
    };

    // Aceita tanto isRunning quanto running
    const runningVal = body.running ?? body.isRunning;

    const ops: Promise<unknown>[] = [];
    if (body.targets         !== undefined) ops.push(setSetting(KEY_TARGETS,   JSON.stringify(body.targets)));
    if (runningVal           !== undefined) ops.push(setSetting(KEY_RUNNING,   String(runningVal)));
    if (body.intervalMinutes !== undefined) ops.push(setSetting(KEY_INTERVAL,  String(body.intervalMinutes)));
    if (body.jitterPercent   !== undefined) ops.push(setSetting(KEY_JITTER,    String(body.jitterPercent)));
    if (body.scheduleEnabled !== undefined) ops.push(setSetting(KEY_SCHED_EN,  String(body.scheduleEnabled)));
    if (body.scheduleStart   !== undefined) ops.push(setSetting(KEY_SCHED_ST,  body.scheduleStart));
    if (body.scheduleEnd     !== undefined) ops.push(setSetting(KEY_SCHED_END, body.scheduleEnd));
    if (body.statusEnabled   !== undefined) ops.push(setSetting(KEY_STATUS_EN, String(body.statusEnabled)));
    if (body.groupsEnabled   !== undefined) ops.push(setSetting(KEY_GROUPS_EN, String(body.groupsEnabled)));
    if (body.currentIndex    !== undefined) ops.push(setSetting(KEY_CUR_IDX,   String(body.currentIndex)));

    await Promise.all(ops);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bot-state] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
