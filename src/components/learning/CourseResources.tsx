"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { resourceTypeLabel } from "@/lib/resource-types";

type CourseResourceRow = {
  id: string;
  title: string;
  type: string;
  category: string;
  description: string | null;
  minutes: number;
};

export function CourseResources({ courseId, isOwner }: { courseId: string; isOwner: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [linked, setLinked] = useState<CourseResourceRow[]>([]);
  const [available, setAvailable] = useState<CourseResourceRow[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = getSupabase();
      const { data: links, error: linksError } = await supabase
        .from("course_resources")
        .select("resource_id")
        .eq("course_id", courseId);
      if (linksError) throw linksError;
      const ids = (links ?? []).map((row) => row.resource_id);
      const linkedRows = ids.length
        ? await supabase.from("shared_resources").select("id,title,type,category,description,minutes").in("id", ids)
        : { data: [], error: null };
      if (linkedRows.error) throw linkedRows.error;
      setLinked((linkedRows.data ?? []) as CourseResourceRow[]);

      if (isOwner) {
        const { data, error } = await supabase
          .from("shared_resources")
          .select("id,title,type,category,description,minutes")
          .order("title");
        if (error) throw error;
        setAvailable(((data ?? []) as CourseResourceRow[]).filter((resource) => !ids.includes(resource.id)));
      }
    } catch (error) {
      console.error("Unable to load course resources:", error);
      setLoadError(true);
      setLinked([]);
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, isOwner]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
  useEffect(() => { void load(); }, [load]);

  async function addResource() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        toast.push(t("courses.resources.signInRequired"));
        return;
      }
      const { error } = await supabase.from("course_resources").insert({
        course_id: courseId,
        resource_id: selected,
        added_by: authData.user.id,
      });
      if (error) throw error;
      setSelected("");
      toast.push(t("courses.resources.added"));
      await load();
    } catch (error) {
      console.error("Unable to link resource to course:", error);
      toast.push(t("courses.resources.addFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeResource(resourceId: string) {
    try {
      const { error } = await getSupabase().from("course_resources")
        .delete().eq("course_id", courseId).eq("resource_id", resourceId);
      if (error) throw error;
      toast.push(t("courses.resources.removed"));
      await load();
    } catch (error) {
      console.error("Unable to unlink resource from course:", error);
      toast.push(t("courses.resources.removeFailed"));
    }
  }

  return (
    <Card className="mt-6">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">{t("courses.resources.title")}</h2>
            <p className="text-sm text-cova-mute">{t("courses.resources.description")}</p>
          </div>
        </div>

        {isOwner && !loading && available.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label={t("courses.resources.selectLabel")} value={selected} onChange={(event) => setSelected(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line bg-white px-3 text-sm">
              <option value="">{t("courses.resources.selectPlaceholder")}</option>
              {available.map((resource) => <option key={resource.id} value={resource.id}>{resource.title} · {resource.category}</option>)}
            </select>
            <Button disabled={!selected || saving} onClick={() => void addResource()}>
              <Plus className="h-4 w-4" aria-hidden="true" />{t("courses.resources.add")}
            </Button>
          </div>
        )}

        {loading ? <p className="text-sm text-cova-mute">{t("courses.resources.loading")}</p> : loadError ? (
          <p role="alert" className="text-sm text-red-700">{t("courses.resources.loadError")}</p>
        ) : linked.length === 0 ? (
          <p className="text-sm text-cova-mute">{t("courses.resources.empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {linked.map((resource) => (
              <li key={resource.id} className="flex items-start justify-between gap-2 rounded-lg border border-cova-line p-3">
                <Link href={`/resources/${resource.id}`} className="min-w-0 hover:underline">
                  <span className="block truncate text-sm font-medium">{resource.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5"><Badge tone="soft">{t(resourceTypeLabel(resource.type))}</Badge><Badge tone="outline">{resource.category}</Badge></span>
                </Link>
                {isOwner && <button type="button" onClick={() => void removeResource(resource.id)} aria-label={t("courses.resources.remove", { title: resource.title })} className="rounded p-1 text-cova-mute hover:bg-cova-pale"><X className="h-4 w-4" aria-hidden="true" /></button>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
