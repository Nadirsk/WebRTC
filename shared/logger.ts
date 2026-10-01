type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? order.info;

/** Structured one-line JSON logs, ready for Loki or any log shipper. */
export function createLogger(scope: string) {
  const write = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    if (order[level] < minLevel) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...fields });
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  };
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
