import {
  isBoth,
  isRecord,
  isString,
  matchesObject,
  maybeUndefined,
  type Validator,
} from "@/web/utils/rpc/parsing";
import * as fs from "fs/promises";
import path from "path";

export interface StorageBlobId {
  id: string;
}

export namespace StorageBlobId {
  export const isMatch = matchesObject<StorageBlobId>({ id: isString });
}

export interface StorageBlobData {
  data: string;
  metadata?: {
    [key: string]: string;
  };
}

export namespace StorageBlobData {
  export const isMatch = matchesObject<StorageBlobData>({
    data: isString,
    metadata: maybeUndefined(isRecord(isString)),
  });
}

export interface StorageBlob extends StorageBlobId, StorageBlobData {}

export namespace StorageBlob {
  export const isMatch: Validator<StorageBlob> = isBoth(
    StorageBlobData.isMatch,
    StorageBlobId.isMatch
  );
}

export interface ObjectStorage {
  download(file: string): Promise<string>;
  upload(file: string, content: string): Promise<void>;
}

export namespace ObjectStorage {
  export function local(dir: string): ObjectStorage {
    return {
      download: (file) =>
        fs.readFile(path.join(dir, file), { encoding: "utf8" }),
      upload: async (file, content) => {
        await fs.mkdir(dir, { recursive: true });
        const target = path.join(dir, file);
        await fs.writeFile(target, content, { encoding: "utf8" });
      },
    };
  }
}
