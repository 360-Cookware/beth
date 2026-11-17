import db from '../db.server';

/** Readiness: the database answers. No data, no auth. */
export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
