import { createClient } from '@supabase/supabase-js';
import type { RealtimeClientOptions } from '@supabase/realtime-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getRealtimeOptions(): RealtimeClientOptions | undefined {
	if (typeof window !== 'undefined') {
		return undefined;
	}

	if (typeof globalThis.WebSocket !== 'undefined') {
		return undefined;
	}

	const wsModule = require('ws') as { WebSocket?: RealtimeClientOptions['transport'] } | RealtimeClientOptions['transport'];
	const transport = (wsModule as { WebSocket?: RealtimeClientOptions['transport'] }).WebSocket || (wsModule as RealtimeClientOptions['transport']);
	return { transport };
}

const realtime = getRealtimeOptions();
const options = realtime ? { realtime } : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);
