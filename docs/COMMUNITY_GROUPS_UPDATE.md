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
