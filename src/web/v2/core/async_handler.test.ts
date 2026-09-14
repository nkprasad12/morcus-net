import express, { Request, Response } from "express";
import request from "supertest";
import {
  asyncHandler,
  createAsyncRegistrars,
} from "@/web/v2/core/async_handler.server";

describe("async_handler.server", () => {
  test("forwards async rejections to Express next() error middleware", async () => {
    const app = express();
    const router = express.Router();
    const { getAsync } = createAsyncRegistrars(router);

    getAsync("/error-async", async () => {
      await Promise.resolve();
      throw new Error("async explosion");
    });

    app.use(router);
    // Express error handler
    app.use(
      (
        err: Error,
        _req: Request,
        res: Response,
        _next: express.NextFunction
      ) => {
        res.status(500).json({ caught: err.message });
      }
    );

    const res = await request(app).get("/error-async");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ caught: "async explosion" });
  });

  test("forwards synchronous throws in async handler to Express next()", async () => {
    const app = express();
    const router = express.Router();
    const { postAsync } = createAsyncRegistrars(router);

    postAsync("/error-sync", async () => {
      throw new Error("sync explosion");
    });

    app.use(router);
    app.use(
      (
        err: Error,
        _req: Request,
        res: Response,
        _next: express.NextFunction
      ) => {
        res.status(500).json({ caught: err.message });
      }
    );

    const res = await request(app).post("/error-sync");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ caught: "sync explosion" });
  });

  test("does not call next() when handler succeeds", async () => {
    const app = express();
    const router = express.Router();
    router.get(
      "/ok",
      asyncHandler(async (_req, res) => {
        res.status(200).send("all good");
      })
    );
    app.use(router);

    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
    expect(res.text).toBe("all good");
  });
});
