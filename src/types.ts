export interface Header {
  name: string;
  value?: string;
}

export interface Message {
  type: string;
  url: string;
  headers?: Header[];
}

export type StreamingChoice = "play" | "download";

export interface VideoSource {
  url: string;
  format: string;
}

export interface BlockedTargetInfo {
  url: string;
  requestId: string;
}
