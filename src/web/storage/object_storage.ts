import {
  isBoth,
  isRecord,
  isString,
  matches,
  maybeUndefined,
  type Validator,
} from "@/web/utils/rpc/parsing";
import * as fs from "fs/promises";
import path from "path";

export interface StorageBlobId {
  id: string;
}

export namespace StorageBlobId {
  export const isMatch: (x: unknown) => x is StorageBlobId =
    matches<StorageBlobId>([["id", isString]]);
}

export interface StorageBlobData {
  data: string;
  metadata?: {
    [key: string]: string;
  };
}

export namespace StorageBlobData {
  export const isMatch: (x: unknown) => x is StorageBlobData =
    matches<StorageBlobData>([
      ["data", isString],
      ["metadata", maybeUndefined(isRecord(isString))],
    ]);
}

export interface StorageBlob extends StorageBlobId, StorageBlobData {}

export namespace StorageBlob {
  export const isMatch: Validator<StorageBlob> = isBoth(
    StorageBlobData.isMatch,
    StorageBlobId.isMatch
  );
}

export interface ObjectStorage {
  download(
    bucket: string,
    file: string,
    destination: NodeJS.WritableStream
  ): Promise<void>;

  upload(
    bucket: string,
    file: string,
    content: NodeJS.ReadableStream
  ): Promise<void>;
}

export namespace ObjectStorage {
  export const LOCAL: ObjectStorage = {
    async download(bucket, file, destination): Promise<void> {
      const data = await fs.readFile(path.join(bucket, file));
      return new Promise((res, rej) => {
        destination.write(data, (err) => (err === null ? res() : rej(err)));
        destination.on("close", res);
      });
    },
    async upload(bucket, file, content): Promise<void> {
      await fs.mkdir(bucket, { recursive: true });
      return fs.writeFile(path.join(bucket, file), content.read());
    },
  };
}
