// Domain types shared between API routes and UI.

export interface ChannelInfo {
  id: string;
  title: string;
  handle: string;
  thumbnail: string;
  uploadsPlaylistId: string;
}

export type ClipKind = "video" | "short";

export interface VideoSummary {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  durationSeconds: number;
  kind: ClipKind;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface CommentItem {
  id: string;
  author: string;
  authorThumbnail: string;
  text: string; // HTML from YouTube (sanitized-safe subset)
  likeCount: number;
  publishedAt: string;
}

export interface ApiError {
  error: string;
}
