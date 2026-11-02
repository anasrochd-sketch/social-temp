"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, Plus, SearchX } from "lucide-react";
import { CommunityCard } from "@/components/community/CommunityCard";
import { CreateCommunityModal } from "@/components/community/CreateCommunityModal";
import { PeopleHub } from "@/components/community/PeopleSearch";
import { Button } from "@/components/ui/Button";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectFilter, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { useHydrated } from "@/lib/use-hydrated";
import {
  COMMUNITY_CATEGORIES,
  incomingRequests,
  memberCount,
  roleOf,
  socialActions,
  useMe,
  useSocial,
} from "@/lib/social-store";
import { matchesQuery, pluralize } from "@/lib/utils";

const TABS = ["discover", "myCommunities", "people"] as const;
const ALL = "all";
const CATEGORIES = [ALL, ...COMMUNITY_CATEGORIES];

export function CommunityBrowser({ initialJoinCode = "" }: { initialJoinCode?: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { locale } = useI18n();
  const hydrated = useHydrated();
  const me = useMe();
  const social = useSocial();

  const [tab, setTab] = useState<(typeof TABS)[number]>(
    initialJoinCode ? "myCommunities" : "discover",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(!!initialJoinCode);
  const [code, setCode] = useState(initialJoinCode);
  const [codeError, setCodeError] = useState("");

  const meId = me?.id ?? "";

  const tabLabels = {
    discover: t("community.discover"),
    myCommunities: t("community.myCommunities"),
    people: t("community.people"),
  } as const;

  const discover = useMemo(
    () =>
      Object.values(social.communities)
        .filter(
          (c) =>
            c.visibility === "public" &&
            // Language isolation: each language sees its own communities
            // (legacy communities without a language stay visible everywhere).
            (!c.locale || c.locale === locale) &&
            (category === ALL || c.category === category) &&
            matchesQuery(query, c.name, c.description, c.category),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [social.communities, category, query, locale],
  );

  const mine = useMemo(
    () =>
      social.members
        .filter((m) => m.userId === meId)
        .flatMap((m) => {
          const c = social.communities[m.communityId];
          return c && matchesQuery(query, c.name, c.description, c.category) ? [c] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [social.members, social.communities, meId, query],
  );

  const pending = useMemo(
    () =>
      social.requests
        .filter((r) => r.userId === meId)
        .flatMap((r) => {
          const c = social.communities[r.communityId];
          return c ? [c] : [];
        }),
    [social.requests, social.communities, meId],
  );

  if (!hydrated || !me) {
    return <CardGridSkeleton label={t("common.loading")} count={3} />;
  }
  const myCount = social.members.filter((m) => m.userId === meId).length;
  const friendRequests = incomingRequests(social, meId).length;

  function closeJoin() {
    setJoining(false);
    setCode("");
    setCodeError("");
    if (initialJoinCode) router.replace("/community");
  }

  async function onJoinSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await socialActions.joinByCode(meId, code);
    if (!result.ok) {
      setCodeError(result.error);
      return;
    }
    const { communityId, outcome } = result.value;
    closeJoin();
    if (outcome === "requested") {
      toast.push(t("community.requestApproved"));
      setTab("myCommunities");
    } else if (outcome === "already-requested") {
      toast.push(t("community.requestAlreadyPending"));
      setTab("myCommunities");
    } else {
      toast.push(
        outcome === "joined" ? t("community.joinedCommunity") : t("community.alreadyMember"),
      );
      router.push(`/community/${communityId}`);
    }
  }

  async function joinPublic(id: string, name: string) {
    const result = await socialActions.joinCommunity(meId, id);
    toast.push(result.ok ? `Joined ${name}` : result.error);
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-cova-line bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        {" "}
        <Tabs
          tabs={TABS.map((key) => tabLabels[key])}
          value={tabLabels[tab]}
          onChange={(next) => setTab(TABS.find((key) => tabLabels[key] === next) ?? "discover")}
          label={t("community.view")}
          counts={{
            [tabLabels.myCommunities]: myCount,
            ...(friendRequests > 0 ? { [tabLabels.people]: friendRequests } : {}),
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setJoining(true)}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> {t("community.joinWithCode")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("community.create")}
          </Button>
        </div>
      </div>

      {tab === "people" ? (
        <PeopleHub me={me} />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-cova-line bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <SearchInput
              label={t("community.searchLabel")}
              placeholder={t("community.searchLabel")}
              value={query}
              onChange={setQuery}
              className="sm:w-72"
            />
            {tab === "discover" && (
              <SelectFilter
                label={t("community.category")}
                options={CATEGORIES.map((value) =>
                  value === ALL ? t("community.allCategories") : value,
                )}
                value={category === ALL ? t("community.allCategories") : category}
                onChange={(e) =>
                  setCategory(
                    e.target.value === t("community.allCategories") ? ALL : e.target.value,
                  )
                }
              />
            )}
          </div>

          {tab === "discover" && (
            <>
              <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
                {pluralize(
                  discover.length,
                  t("community.publicCommunity"),
                  t("community.publicCommunities"),
                )}{" "}
                {t("community.found")}
              </p>
              {discover.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={
                    Object.values(social.communities).some((c) => c.visibility === "public")
                      ? t("community.noCommunitiesMatch")
                      : t("community.noPublicCommunitiesYet")
                  }
                  description={t("community.communityHint")}
                  action={
                    <Button onClick={() => setCreating(true)}>{t("community.create")}</Button>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {discover.map((c) => {
                    const role = roleOf(social, c.id, meId);
                    return (
                      <CommunityCard
                        key={c.id}
                        community={c}
                        members={memberCount(social, c.id)}
                        role={role}
                        onJoin={() => joinPublic(c.id, c.name)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "myCommunities" && (
            <div className="space-y-8">
              {pending.length > 0 && (
                <section aria-label={t("community.requestsAria")}>
                  <h2 className="mb-3 text-sm font-semibold">{t("community.waitingApproval")}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {pending.map((c) => (
                      <div key={c.id} className="space-y-2">
                        <CommunityCard
                          community={c}
                          members={memberCount(social, c.id)}
                          role={null}
                          pending
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={async () => {
                            const result = await socialActions.cancelJoinRequest(meId, c.id);
                            toast.push(result.ok ? t("community.requestCancelled") : result.error);
                          }}
                        >
                          {t("community.cancelRequest")}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {mine.length === 0 ? (
                pending.length === 0 && (
                  <EmptyState
                    icon={SearchX}
                    title={
                      query ? t("community.noCommunitiesMatch") : t("community.noJoinedCommunities")
                    }
                    description={t("community.joinPrompt")}
                    action={
                      <Button onClick={() => setTab("discover")}>
                        {t("community.browseCommunities")}
                      </Button>
                    }
                  />
                )
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {mine.map((c) => (
                    <CommunityCard
                      key={c.id}
                      community={c}
                      members={memberCount(social, c.id)}
                      role={roleOf(social, c.id, meId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} meId={meId} />

      <Modal
        open={joining}
        onClose={closeJoin}
        title={t("community.joinWithCode")}
        description={t("community.joinCodeDescription")}
      >
        <form onSubmit={onJoinSubmit} noValidate className="space-y-4">
          <TextField
            id="join-code"
            label={t("community.joinCode")}
            value={code}
            error={codeError}
            autoComplete="off"
            className="font-mono uppercase"
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError("");
            }}
          />
          <p className="text-xs text-cova-mute">{t("community.joinApprovalText")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeJoin}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!code.trim()}>
              {t("community.continue")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
