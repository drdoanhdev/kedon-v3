import type { MediaSignedUploadTarget } from './storage';

export function enrichUploadTargetForClient(
  uploadTarget: MediaSignedUploadTarget,
  mediaId: number,
  proxyBasePath: string
): MediaSignedUploadTarget {
  if (uploadTarget.driver !== 'r2') {
    return uploadTarget;
  }

  return {
    ...uploadTarget,
    proxyUrl: `${proxyBasePath}?id=${mediaId}`,
  };
}
