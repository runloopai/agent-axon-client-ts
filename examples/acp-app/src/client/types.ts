export type Attachment =
  | { type: "image"; data: string; mimeType: string; name: string; preview: string }
  | { type: "file"; name: string; text: string; mimeType: string };

export type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "file"; name: string; text: string; mimeType: string };
