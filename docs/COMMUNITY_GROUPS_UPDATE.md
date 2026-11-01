# Communities & groups — languages, media and invites

This update adds the requested features to Communities (المجتمع) and Groups (المجموعات):

1. **Navigation** — Friends moved to the end (after Groups), Leaderboard moved into the
   Account section below Notifications.
2. **Community languages** — each community belongs to one language; Discover only shows
   communities in the visitor's language (legacy communities without a language stay
   visible in all languages). The creator picks the language when creating, and the owner
   can change it later in Settings.
3. **Posting permissions** — fixed: "All members" was wrongly saved as staff-only. Now
   All members / Owner and admins / Only the creator all work, for communities AND groups.
4. **Media** — posts and group messages accept images, camera shots, videos, voice notes
   and files (stored in the `space-media` storage bucket).
5. **Invites** — every community (Invite card), group (Share panel) and voice room shows
   its code, link and a **QR code**. Opening `/community?join=CODE` or `/groups?join=CODE`
   pre-fills the join dialog.
6. **Translations** — the community and group screens are now fully translated
   (English / Français / العربية).

## One-time database setup (required)

The live database needs two new columns and one storage bucket. Everything is in
`supabase/migrations/20261102000001_locale_and_media.sql`, which is safe to run twice:

```bash
# Option A: Supabase dashboard
#   SQL Editor -> paste the file -> Run

# Option B: CLI
supabase db push
```

Until this SQL runs, the app still works: media upload shows a clear message, and the
language filter simply stays off (all communities visible).

## What changed in the code

| Area | Files |
| --- | --- |
| Navigation order | `src/lib/navigation.ts` |
| Types | `src/types/social.ts` (locale, attachments) |
| Data layer | `src/lib/social-store.ts` (locale, attachments, policy fix) |
| Media upload | `src/lib/media-upload.ts`, `src/components/common/MediaComposer.tsx`, `PostAttachments.tsx` |
| Invites + QR | `src/components/common/SharePanel.tsx`, `QrImage.tsx` |
| Community UI | `CreateCommunityModal.tsx`, `CommunityDetail.tsx`, `CommunityBrowser.tsx`, `CommunityAdminPanels.tsx` |
| Groups UI | `GroupsBrowser.tsx`, `GroupDetail.tsx` |
| Voice rooms | `SpacePanel.tsx` (QR button) |
| Translations | `src/i18n/messages/{en,fr,ar}.ts`, `src/i18n/spaces.ts` |
| Database | `supabase/migrations/20261102000001_locale_and_media.sql` |

## Round 2: invite links that actually join (no database change)

The share panel now exists in all three places — community page, group page and
inside a voice room — and invite links do the joining automatically:

| Place | What staff see | What the invited person gets |
| --- | --- | --- |
| Community | Code + link + QR (owner can regenerate) | `/community/{id}?join=CODE` auto-joins or sends the request |
| Group | Code + link + QR | `/groups/{id}?join=CODE` auto-joins, works even for private groups |
| Voice room | Code + link + QR | `/voicing/{code}` link, or the code in "Join by code" |

Changed files: `GroupDetail.tsx` (+auto-join), `CommunityDetail.tsx` (+SharePanel, +auto-join),
`VoiceRoom.tsx` (+SharePanel), and the two page files that forward `?join=`.
No new migration is needed — it reuses the existing `join_codes` tables and RPCs.

## Round 3: live voice translation (captions)

Every voice room now has a "Live translation" panel. When a participant turns on
transcription, their browser converts speech to text (Web Speech API) and the room
relays each sentence; every other participant reads it translated into the interface
language they picked (en / fr / ar).

- Server: new `caption` action in `src/server/spaces-store.ts` (members only, voice
  rooms only, last 30 lines kept in memory, no database change).
- Translation: new `POST /api/translate` (`src/app/api/translate/route.ts`) with a
  three-provider fallback chain, 5 s timeout, in-memory cache and a 60 req/min
  per-IP limit. No API key, nothing to configure.
- Client: `src/components/voicing/VoiceCaptions.tsx` (transcription toggle, live
  list, automatic direction handling for Arabic), wired into `VoiceRoom.tsx`.
- Browser support: transcription needs Chrome / Edge (Web Speech API); other
  browsers still see everyone else's captions, just without sending their own.

Also: removed the duplicated share box that round 2 added next to the voice-room
panel — the panel itself already had one.
