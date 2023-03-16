import { Workers } from "@/web/workers/worker_types";

export interface Identifiable {
  id: string;
}

export interface Message<T> extends Identifiable {
  content: T;
}

export interface WorkRequest<T> extends Message<T> {
  category: Workers.Category;
}

export interface WorkHandler<I, O> {
  process: (request: WorkRequest<I>) => Promise<Message<O>>;
}

export interface QueuedWorkHandler<I, O> extends WorkHandler<I, O> {
  numPending: () => number;
}

export interface WorkProcessor<I, O> {
  readonly category: Workers.Category;
  setup: () => Promise<void>;
  process: (input: Message<I>) => Promise<O>;
  teardown: () => void;
}
