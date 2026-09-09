import type { FastifyRequest } from 'fastify';

/**
 * User identity.
 *
 * CyberLab runs locally for a single learner, so identity is intentionally
 * lightweight: a header (or a default) names the user, and all progress hangs
 * off that id. This is the one seam to widen for real auth later — every route
 * already funnels through `userIdFrom`, so adding sessions means changing this
 * one function, nothing else.
 */
export function userIdFrom(request: FastifyRequest): string {
  const header = request.headers['x-cyberlab-user'];
  if (typeof header === 'string' && header.trim().length > 0) return sanitize(header);
  return 'local';
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || 'local';
}
