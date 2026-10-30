"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { resourceTypeLabel } from "@/lib/resource-types";

const BUCKET = "shared-resources";
type ResourceRecord = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  category: string;
  minutes: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};

type LinkedCourse = { id: string; title: string };

export function ResourceDetailView({ resourceId }: { resourceId: string }) {
  const { t, formatTag } = useI18n();
  const toast = useToast();
  const [resource, setResource] = useState<ResourceRecord | null>(null);
  const [courses, setCourses] = useState<LinkedCourse[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const supabase = getSupabase();
        const { data, error: resourceError } = await supabase
          .from("shared_resources")
          .select("id,title,type,description,category,minutes,file_name,mime_type,file_size,storage_path,created_at")
          .eq("id", resourceId)
          .maybeSingle();
        if (resourceError) throw resourceError;
        if (!data) throw new Error("Resource not found");
        const row = data as ResourceRecord;

        const [signedResult, linksResult] = await Promise.all([
          supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 10),
          supabase.from("course_resources").select("course_id").eq("resource_id", resourceId),
        ]);
        if (signedResult.error) throw signedResult.error;
        if (linksResult.error) throw linksResult.error;
        const courseIds = (linksResult.data ?? []).map((link) => link.course_id);
        const courseResult = courseIds.length
          ? await supabase.from("courses").select("id,title").in("id", courseIds)
          : { data: [], error: null };
        if (courseResult.error) throw courseResult.error;
        if (active) {
          setResource(row);
          setFileUrl(signedResult.data.signedUrl);
          setCourses((courseResult.data ?? []) as LinkedCourse[]);
        }
      } catch (loadError) {
        console.error("Unable to load resource detail:", loadError);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [resourceId]);

  async function download() {
    if (!resource || downloading) return;
    setDownloading(true);
    try {
      const { data, error: downloadError } = await getSupabase().storage
        .from(BUCKET)
        .createSignedUrl(resource.storage_path, 60 * 10, { download: resource.file_name });
      if (downloadError) throw downloadError;
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = resource.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (downloadError) {
      console.error("Unable to download resource:", downloadError);
      toast.push(t("resources.fileOpenError"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl py-2 lg:py-4">
      <Link href="/resources" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-cova-mute hover:text-cova-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("resources.backToResources")}
      </Link>
      {loading ? (
        <Card><CardBody><p className="text-sm text-cova-mute">{t("resources.loadingResource")}</p></CardBody></Card>
      ) : error || !resource ? (
        <Card><CardBody><h1 className="text-xl font-semibold">{t("resources.resourceUnavailable")}</h1><p className="mt-2 text-sm text-cova-mute">{t("resources.resourceUnavailableDescription")}</p></CardBody></Card>
      ) : (
        <div className="space-y-5">
          <Card><CardBody className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="soft">{t(resourceTypeLabel(resource.type))}</Badge>
                <Badge tone="outline">{resource.category}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold">{resource.title}</h1>
              {resource.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-cova-mute">{resource.description}</p>}
              <p className="mt-3 text-xs text-cova-mute">{resource.file_name} · {t("resources.readTime", { minutes: resource.minutes.toLocaleString(formatTag) })} · {t("resources.sharedOn", { date: new Date(resource.created_at).toLocaleDateString(formatTag) })}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cova-line bg-white px-4 text-sm font-medium hover:bg-cova-pale"><ExternalLink className="h-4 w-4" aria-hidden="true" />{t("resources.openInNewTab")}</a>}
              <Button disabled={downloading} onClick={() => void download()}><Download className="h-4 w-4" aria-hidden="true" />{downloading ? t("resources.downloading") : t("resources.download")}</Button>
            </div>
          </CardBody></Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Card><CardBody>
              {fileUrl && resource.mime_type === "application/pdf" ? <iframe title={resource.title} src={fileUrl} className="h-[calc(100vh-16rem)] min-h-[32rem] w-full rounded-lg border border-cova-line" /> : fileUrl && resource.mime_type.startsWith("image/") ? <img src={fileUrl} alt={resource.title} className="max-h-[calc(100vh-16rem)] min-h-80 w-full rounded-lg object-contain" /> : fileUrl && resource.mime_type === "text/plain" ? <iframe title={resource.title} src={fileUrl} className="h-[calc(100vh-16rem)] min-h-[32rem] w-full rounded-lg border border-cova-line" /> : (
                <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                  <FileText className="h-12 w-12 text-cova-mute" aria-hidden="true" />
                  <p className="font-medium">{t("resources.previewUnavailable")}</p>
                  <p className="text-sm text-cova-mute">{t("resources.previewUnavailableDescription")}</p>
                </div>
              )}
            </CardBody></Card>

            <Card><CardBody>
              <h2 className="font-semibold">{t("resources.linkedCourses")}</h2>
              {courses.length === 0 ? <p className="mt-3 text-sm text-cova-mute">{t("resources.noLinkedCourses")}</p> : <ul className="mt-3 space-y-2">{courses.map((course) => <li key={course.id}><Link href={`/courses/${course.id}`} className="text-sm font-medium underline-offset-2 hover:underline">{course.title}</Link></li>)}</ul>}
            </CardBody></Card>
          </div>
        </div>
      )}
    </div>
  );
}
