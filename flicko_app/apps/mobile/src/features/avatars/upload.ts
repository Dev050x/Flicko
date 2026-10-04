import { File } from "expo-file-system";

import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/auth";

const contentTypeOf = (uri: string) =>
  /\.png$/i.test(uri)
    ? "image/png"
    : /\.webp$/i.test(uri)
      ? "image/webp"
      : "image/jpeg";

/*
 * Uploads a local photo as the profile picture: the server hands out a presigned PUT url,
 * the file goes straight to storage, then the server crops it and saves it on the user.
 * Returns the updated user (avatarUrl is the public, square copy).
 */
export const uploadAvatar = async (uri: string, token: string) => {
  const contentType = contentTypeOf(uri);
  const upload = await api<{
    uploadId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    maxBytes: number;
  }>("/me/avatar/upload", { method: "POST", body: { contentType }, token });

  const file = new File(uri);
  if (file.size > upload.maxBytes) {
    throw new ApiError(413, "That photo is too big. Pick one under 5 MB.");
  }
  const put = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file as unknown as Blob,
  });
  if (!put.ok) throw new ApiError(put.status, "upload failed");

  return (
    await api<{ user: User }>("/me/avatar", {
      method: "PUT",
      body: { uploadId: upload.uploadId },
      token,
    })
  ).user;
};
