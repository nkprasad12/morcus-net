import type { Request, Response, NextFunction, Router } from "express";

export type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Adapts an async route handler to the signature Express 4 expects.
 *
 * Express 4 ignores a handler's return value, so a rejection escapes as an unhandled
 * rejection — which Node terminates the process over. Synchronous throws and
 * rejected promises are caught and forwarded to next().
 */
export function asyncHandler(
  handler: AsyncRouteHandler
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/**
 * Creates convenience registrars that hug callbacks under Prettier
 * while satisfying ESLint @typescript-eslint/no-misused-promises.
 */
export function createAsyncRegistrars(router: Router) {
  return {
    getAsync: (path: string, handler: AsyncRouteHandler) =>
      router.get(path, asyncHandler(handler)),
    postAsync: (path: string, handler: AsyncRouteHandler) =>
      router.post(path, asyncHandler(handler)),
  };
}
