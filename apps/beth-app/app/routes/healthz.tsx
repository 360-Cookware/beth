/** Liveness: the process is up. No data, no auth. */
export const loader = () => Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
