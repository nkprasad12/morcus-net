import { servesImage } from "@/scripts/helper_images/docker";

const IMAGE =
  "sha256:095dccb20d5d25b9159a1f1bc7e312787851204cf837c03990c1c998d4a82190";
const OTHER_IMAGE =
  "sha256:434e908f74f3c6a3d6b1f0e5c0f1d1a1b1c1d1e1f1a1b1c1d1e1f1a1b1c1d1e1";
const LIST =
  "sha256:5cca7228f65b7211f26adb9f9d7ca485497f63141ffedc278ae634f92d8f6dc6";

function imageManifest(): string {
  return JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    config: { digest: "sha256:a36beadb8c2d" },
    layers: [],
  });
}

const DOCKER_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
const OCI_INDEX = "application/vnd.oci.image.index.v1+json";

function manifestList(...digests: string[]): string {
  return listOfType(DOCKER_LIST, ...digests);
}

function listOfType(mediaType: string, ...digests: string[]): string {
  return JSON.stringify({
    schemaVersion: 2,
    mediaType,
    manifests: digests.map((digest) => ({
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      digest,
      size: 1783,
      platform: { architecture: "amd64", os: "linux" },
    })),
  });
}

describe("servesImage", () => {
  test("accepts the image manifest itself", () => {
    expect(servesImage(IMAGE, imageManifest(), IMAGE)).toBe(true);
  });

  test("rejects a different image manifest", () => {
    expect(servesImage(OTHER_IMAGE, imageManifest(), IMAGE)).toBe(false);
  });

  test("accepts a one-entry manifest list wrapping the image", () => {
    // What `imagetools create -t <latest> <image>` makes from a
    // single-platform image: a list with its own digest.
    expect(servesImage(LIST, manifestList(IMAGE), IMAGE)).toBe(true);
  });

  test("accepts a one-entry OCI image index wrapping the image", () => {
    expect(servesImage(LIST, listOfType(OCI_INDEX, IMAGE), IMAGE)).toBe(true);
  });

  test("rejects a one-entry manifest list wrapping another image", () => {
    expect(servesImage(LIST, manifestList(OTHER_IMAGE), IMAGE)).toBe(false);
  });

  test("rejects a multi-entry manifest list that includes the image", () => {
    expect(servesImage(LIST, manifestList(IMAGE, OTHER_IMAGE), IMAGE)).toBe(
      false
    );
  });

  test("rejects an empty manifest list", () => {
    expect(servesImage(LIST, manifestList(), IMAGE)).toBe(false);
  });

  test("rejects unparseable or unexpected JSON", () => {
    expect(servesImage(LIST, "not json", IMAGE)).toBe(false);
    expect(servesImage(LIST, "null", IMAGE)).toBe(false);
    expect(servesImage(LIST, '{"manifests": [null]}', IMAGE)).toBe(false);
  });
});
