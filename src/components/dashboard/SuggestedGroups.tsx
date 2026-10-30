"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";

type Community = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

export function SuggestedGroups() {
  const t = useT();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadGroups() {
      try {
        const supabase = getSupabase();

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          if (active) setSuggestions([]);
          return;
        }

        const { data: spaces, error: spacesError } = await supabase
          .from("spaces")
          .select("id, name, description, category")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(20);

        if (spacesError) throw spacesError;

        const { data: memberships, error: membershipsError } =
          await supabase
            .from("space_members")
            .select("space_id")
            .eq("user_id", authData.user.id);

        if (membershipsError) throw membershipsError;

        const joinedIds = new Set(
          (memberships ?? []).map((membership) => membership.space_id)
        );

        const available = (spaces ?? [])
          .filter((space) => !joinedIds.has(space.id))
          .slice(0, 3) as Community[];

        if (active) setSuggestions(available);
      } catch (err) {
        console.error("Erreur de chargement des groupes :", err);

        if (active) {
          setError(t("dashboard.groupsError"));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGroups();

    return () => {
      active = false;
    };
  }, [t]);

  return (
    <Card>
      <CardHeader
        title={t("dashboard.groupsToJoin")}
        action={
          <Link
            href="/groups"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            {t("dashboard.browseGroups")}
          </Link>
        }
      />

      <CardBody>
        {loading ? (
          <p className="text-sm text-cova-mute">{t("dashboard.loadingGroups")}</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-cova-mute">
            {t("dashboard.noGroups")}
          </p>
        ) : (
          <ul className="space-y-4">
            {suggestions.map((group) => (
              <li
                key={group.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/groups/${group.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {group.name}
                  </Link>

                  <p className="truncate text-xs text-cova-mute">
                    {group.category || t("dashboard.general")}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    router.push(`/groups/${group.id}`);
                  }}
                >
                  {t("dashboard.view")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
