import type { Request, Response, NextFunction } from 'express';
import { createHttpResponseBuilder } from '@memoflow/transport-contracts/result';

const responseBuilder = createHttpResponseBuilder();
type RequestWithOptionalRoles = Request & {
  user?: {
    roles?: unknown;
    role?: unknown;
  };
};

function normalizeRoles(input: unknown): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [String(input).trim()].filter(Boolean);
}

function getRolesFromRequest(req: Request): string[] {
  const requestWithRoles = req as RequestWithOptionalRoles;
  const userRoles = normalizeRoles(requestWithRoles.user?.roles ?? requestWithRoles.user?.role);
  const headerRoles = normalizeRoles(
    req.headers['x-user-role'] ?? req.headers['x-user-roles'] ?? req.headers['x-roles'],
  );

  return [...new Set([...userRoles, ...headerRoles])];
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roles = getRolesFromRequest(req);

    if (roles.length === 0) {
      res.status(403).json(responseBuilder.forbidden('Missing required role'));
      return;
    }

    const hasRole = roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json(responseBuilder.forbidden('Insufficient role permissions'));
      return;
    }

    next();
  };
}
