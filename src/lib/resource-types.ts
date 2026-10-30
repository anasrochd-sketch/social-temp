import type { MessageKey } from "@/i18n/messages/en";

export const RESOURCE_TYPES = ["Article", "Video", "Cheatsheet", "Tool", "Book", "Exercise"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, MessageKey> = {
  Article: "resources.type.Article",
  Video: "resources.type.Video",
  Cheatsheet: "resources.type.Cheatsheet",
  Tool: "resources.type.Tool",
  Book: "resources.type.Book",
  Exercise: "resources.type.Exercise",
};

export function resourceTypeLabel(type: string): MessageKey {
  return RESOURCE_TYPE_LABELS[type as ResourceType] ?? "resources.type.Article";
}
