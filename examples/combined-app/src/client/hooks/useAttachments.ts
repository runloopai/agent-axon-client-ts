import { useState, useCallback } from "react";
import type { Attachment, AttachmentContentItem } from "../types.js";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type);
}

export interface UseAttachmentsReturn {
  attachments: Attachment[];
  addFiles: (files: File[]) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  toContentPayload: (text: string) => AttachmentContentItem[];
  hasContent: (text: string) => boolean;
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addFiles = useCallback(async (files: File[]) => {
    const newAttachments: Attachment[] = [];

    for (const file of files) {
      if (isImageFile(file)) {
        const data = await readFileAsBase64(file);
        newAttachments.push({
          type: "image",
          data,
          mimeType: file.type,
          name: file.name,
          preview: URL.createObjectURL(file),
        });
      } else {
        const text = await readFileAsText(file);
        newAttachments.push({
          type: "file",
          name: file.name,
          text,
          mimeType: file.type || "text/plain",
        });
      }
    }

    setAttachments((prev: Attachment[]) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev: Attachment[]) => {
      const removed = prev[index];
      if (removed?.type === "image") URL.revokeObjectURL(removed.preview);
      return prev.filter((_: Attachment, i: number) => i !== index);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev: Attachment[]) => {
      for (const a of prev) {
        if (a.type === "image") URL.revokeObjectURL(a.preview);
      }
      return [];
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles],
  );

  const toContentPayload = useCallback(
    (text: string): AttachmentContentItem[] => {
      const items: AttachmentContentItem[] = [];
      if (text.trim()) {
        items.push({ type: "text", text });
      }
      for (const a of attachments) {
        if (a.type === "image") {
          items.push({ type: "image", data: a.data, mimeType: a.mimeType });
        } else {
          items.push({
            type: "file",
            name: a.name,
            text: a.text,
            mimeType: a.mimeType,
          });
        }
      }
      return items;
    },
    [attachments],
  );

  const hasContent = useCallback(
    (text: string): boolean => {
      return text.trim().length > 0 || attachments.length > 0;
    },
    [attachments],
  );

  return {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    handlePaste,
    toContentPayload,
    hasContent,
  };
}
