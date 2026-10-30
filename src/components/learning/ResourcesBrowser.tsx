"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bookmark, BookmarkCheck, FileText, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { matchesQuery } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase/client";
import { RESOURCE_TYPES, type ResourceType, resourceTypeLabel } from "@/lib/resource-types";
import { demoActions, useDemoState } from "@/lib/demo-store";

const BUCKET = "shared-resources";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const RESOURCE_TABS = ["All resources", "Saved"] as const;
const CREATABLE_RESOURCE_TYPES = RESOURCE_TYPES.filter((type) => type !== "Exercise");

function isResourceSetupError(error: unknown) {
  const details = error as { code?: string; message?: string } | null;
  return (
    details?.code === "42P01" ||
    details?.code === "PGRST205" ||
    /shared_resources|shared-resources|bucket not found/i.test(details?.message ?? "")
  );
}
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

type SharedResource = {
  id: string;
  title: string;
  type: ResourceType;
  description: string | null;
  category: string;
  minutes: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};

type CourseOption = { id: string; title: string };

export function ResourcesBrowser() {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const { bookmarks } = useDemoState();
  const [resources, setResources] = useState<SharedResource[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof RESOURCE_TABS)[number]>("All resources");
  const [typeFilter, setTypeFilter] = useState<ResourceType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"setup" | "generic" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("Article");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  const [ownedCourses, setOwnedCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState("");

  const loadResources = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await getSupabase()
        .from("shared_resources")
        .select("id,title,type,description,category,minutes,file_name,mime_type,file_size,storage_path,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setResources((data ?? []) as SharedResource[]);
    } catch (error) {
      console.error("Unable to load shared resources:", error);
      setLoadError(isResourceSetupError(error) ? "setup" : "generic");
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void loadResources();
  }, [loadResources]);

  async function openAddResourceForm() {
    setFormOpen(true);
    try {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data, error } = await supabase
        .from("courses")
        .select("id,title")
        .eq("created_by", authData.user.id)
        .order("title");
      if (error) throw error;
      setOwnedCourses((data ?? []) as CourseOption[]);
    } catch (error) {
      console.error("Unable to load owned courses for resource linking:", error);
    }
  }

  const savedCount = resources.filter((resource) => bookmarks.includes(resource.id)).length;
  const results = useMemo(
    () => resources.filter((resource) =>
      (tab === "All resources" || bookmarks.includes(resource.id)) &&
      (typeFilter === "all" || resource.type === typeFilter) &&
      matchesQuery(query, resource.title, resource.type, resource.description ?? "", resource.category, resource.file_name),
    ),
    [resources, bookmarks, query, tab, typeFilter],
  );

  function toggleSaved(resource: SharedResource) {
    const saved = bookmarks.includes(resource.id);
    demoActions.toggleBookmark(resource.id);
    toast.push(t(saved ? "resources.removedFromSaved" : "resources.addedToSaved"));
  }

  async function submitResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.push(t("resources.fileTypeError"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.push(t("resources.fileSizeError"));
      return;
    }

    setUploading(true);
    let storagePath: string | null = null;
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        toast.push(t("resources.signInRequired"));
        return;
      }

      const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
      storagePath = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: savedResource, error: insertError } = await supabase.from("shared_resources").insert({
        title: title.trim(),
        type,
        description: description.trim() || null,
        category: category.trim(),
        minutes,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        uploaded_by: authData.user.id,
      }).select("id").single();
      if (insertError) throw insertError;

      if (courseId && savedResource) {
        const { error: linkError } = await supabase.from("course_resources").insert({
          course_id: courseId,
          resource_id: savedResource.id,
          added_by: authData.user.id,
        });
        if (linkError) {
          console.error("Resource saved but course linking failed:", linkError);
          toast.push(t("resources.uploadSuccessLinkFailed"));
        } else {
          toast.push(t("resources.uploadSuccess"));
        }
      } else {
        toast.push(t("resources.uploadSuccess"));
      }

      setTitle("");
      setType("Article");
      setDescription("");
      setCategory("");
      setMinutes(5);
      setCourseId("");
      setFile(null);
      setFormOpen(false);
      await loadResources();
    } catch (error) {
      console.error("Unable to publish resource:", error);
      if (storagePath) {
        await getSupabase().storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
      }
      toast.push(isResourceSetupError(error) ? t("resources.migrationRequired") : t("resources.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  const formattedSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(formatTag)} KB`
      : `${(bytes / (1024 * 1024)).toLocaleString(formatTag, { maximumFractionDigits: 1 })} MB`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          label={t("resources.searchLabel")}
          placeholder={t("resources.searchPlaceholder")}
          value={query}
          onChange={setQuery}
          className="sm:w-80"
        />
        <Button onClick={() => void openAddResourceForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("resources.addResource")}
        </Button>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          tabs={RESOURCE_TABS}
          value={tab}
          onChange={setTab}
          label={t("resources.viewLabel")}
          labels={{ "All resources": t("resources.allResources"), Saved: t("resources.saved") }}
          counts={{ Saved: savedCount }}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="resource-type-filter" className="text-sm text-cova-mute">{t("resources.typeFilter")}</label>
          <select id="resource-type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ResourceType | "all")} className="h-10 rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink">
            <option value="all">{t("resources.allTypes")}</option>
            {RESOURCE_TYPES.map((resourceType) => <option key={resourceType} value={resourceType}>{t(resourceTypeLabel(resourceType))}</option>)}
          </select>
        </div>
      </div>

      <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
        {t("resources.count", { count: results.length })}
      </p>

      {loading ? (
        <p className="rounded-xl border border-cova-line bg-white p-6 text-sm text-cova-mute">{t("resources.loading")}</p>
      ) : loadError ? (
        <EmptyState
          icon={SearchX}
          title={t("resources.loadErrorTitle")}
          description={t(loadError === "setup" ? "resources.migrationRequired" : "resources.loadErrorDescription")}
          action={<Button variant="secondary" onClick={() => void loadResources()}>{t("common.tryAgain")}</Button>}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={tab === "Saved" && !query && typeFilter === "all" ? t("resources.noSavedTitle") : query || typeFilter !== "all" ? t("resources.noSearchResults") : t("resources.emptyTitle")}
          description={tab === "Saved" && !query && typeFilter === "all" ? t("resources.noSavedDescription") : query || typeFilter !== "all" ? t("resources.noSearchDescription") : t("resources.emptyDescription")}
          action={query || typeFilter !== "all" || tab === "Saved" ? <Button variant="secondary" onClick={() => { setQuery(""); setTypeFilter("all"); setTab("All resources"); }}>{t("resources.showAll")}</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((resource) => (
            <Card key={resource.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Badge tone="soft">{t(resourceTypeLabel(resource.type))}</Badge>
                  <Badge tone="outline">{resource.category}</Badge>
                </div>
                <button
                  type="button"
                  aria-pressed={bookmarks.includes(resource.id)}
                  aria-label={t(bookmarks.includes(resource.id) ? "resources.removeSavedLabel" : "resources.saveLabel", { title: resource.title })}
                  title={t(bookmarks.includes(resource.id) ? "resources.removeSavedLabel" : "resources.saveLabel", { title: resource.title })}
                  onClick={() => toggleSaved(resource)}
                  className="rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                >
                  {bookmarks.includes(resource.id) ? <BookmarkCheck className="h-5 w-5" aria-hidden="true" /> : <Bookmark className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <h2 className="mt-3 font-semibold"><Link href={`/resources/${resource.id}`} className="hover:underline">{resource.title}</Link></h2>
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-cova-mute">{resource.description || resource.file_name}</p>
              <p className="mt-3 text-xs text-cova-mute">{t("resources.readTime", { minutes: resource.minutes.toLocaleString(formatTag) })}</p>
              <p className="mt-4 truncate text-xs text-cova-mute" title={resource.file_name}>
                {resource.file_name} · {formattedSize(resource.file_size)}
              </p>
              <Link href={`/resources/${resource.id}`} className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-cova-line bg-white px-3 text-sm font-medium hover:bg-cova-pale">
                {t("resources.viewDownload")}
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => !uploading && setFormOpen(false)} title={t("resources.formTitle")} description={t("resources.formDescription")}>
        <form className="space-y-4" onSubmit={(event) => void submitResource(event)}>
          <TextField id="resource-title" label={t("resources.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} />
          <div>
            <label htmlFor="resource-type" className="mb-1.5 block text-sm font-medium">{t("resources.typeLabel")}</label>
            <select id="resource-type" value={type} onChange={(event) => setType(event.target.value as (typeof RESOURCE_TYPES)[number])} className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink">
              {CREATABLE_RESOURCE_TYPES.map((option) => <option key={option} value={option}>{t(resourceTypeLabel(option))}</option>)}
            </select>
          </div>
          <TextAreaField id="resource-description" label={t("resources.descriptionLabel")} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
          <TextField id="resource-category" label={t("resources.categoryLabel")} value={category} onChange={(event) => setCategory(event.target.value)} required maxLength={60} />
          <TextField id="resource-minutes" type="number" min={1} max={1440} label={t("resources.minutesLabel")} value={minutes} onChange={(event) => setMinutes(Math.max(1, Number(event.target.value)))} required />
          <div>
            <label htmlFor="resource-course" className="mb-1.5 block text-sm font-medium">{t("resources.linkCourseLabel")}</label>
            <select id="resource-course" value={courseId} onChange={(event) => setCourseId(event.target.value)} className="h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink">
              <option value="">{t("resources.noCourseOption")}</option>
              {ownedCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="resource-file" className="mb-1.5 block text-sm font-medium">{t("resources.fileLabel")}</label>
            <input id="resource-file" type="file" required accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-cova-line bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cova-pale file:px-3 file:py-1.5" />
            <p className="mt-1 text-xs text-cova-mute">{t("resources.fileHint")}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" disabled={uploading} onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={uploading || !file}>{uploading ? t("resources.uploading") : t("resources.publish")}</Button>
          </div>
        </form>
      </Modal>

    </>
  );
}
