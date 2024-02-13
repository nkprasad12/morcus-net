import { assertEqual } from "@/common/assert";
import {
  StorageBlobData,
  StorageBlobId,
  StorageBlob,
  type ObjectStorage,
} from "@/web/storage/object_storage";
import type { ApiRoute } from "@/web/utils/rpc/rpc";
import { RouteDefinition } from "@/web/utils/rpc/server_rpc";
import { randomUUID } from "crypto";

export const CreateBlob: ApiRoute<StorageBlobData, StorageBlobId> = {
  path: "/api/blob/create",
  method: "POST",
  inputValidator: StorageBlobData.isMatch,
  outputValidator: StorageBlobId.isMatch,
};

export const GetBlob: ApiRoute<StorageBlobId, StorageBlob> = {
  path: "/api/blob/get",
  method: "GET",
  inputValidator: StorageBlobId.isMatch,
  outputValidator: StorageBlob.isMatch,
};

interface BlobHandler {
  create(data: StorageBlobData): Promise<StorageBlobId>;
  get(id: StorageBlobId): Promise<StorageBlob>;
}

namespace BlobHandler {
  export function forStorage(storage: ObjectStorage): BlobHandler {
    return {
      async create(data) {
        const id = randomUUID();
        const result: StorageBlob = { ...data, id };
        await storage.upload(id, JSON.stringify(result));
        return { id };
      },
      async get(id) {
        const stored = await storage.download(id.id);
        const blob = JSON.parse(stored);
        assertEqual(StorageBlob.isMatch(blob), true);
        return blob;
      },
    };
  }
}

export function storageRoutes(
  storage: ObjectStorage
): [
  RouteDefinition<StorageBlobData, StorageBlobId>,
  RouteDefinition<StorageBlobId, StorageBlob>
] {
  const handler = BlobHandler.forStorage(storage);
  return [
    RouteDefinition.create(CreateBlob, handler.create),
    RouteDefinition.create(GetBlob, handler.get),
  ];
}
