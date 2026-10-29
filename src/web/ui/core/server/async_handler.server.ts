import type { Request, Response, NextFunction, Router } from "express";

type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Adapts an async route handler to an Express RequestHandler signature.
 *
 * Express 5 forwards rejections to `next` itself; this wrapper exists for
 * lint/typing ergonomics (`@typescript-eslint/no-misused-promises`) and as an
 * explicit choke point.
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
