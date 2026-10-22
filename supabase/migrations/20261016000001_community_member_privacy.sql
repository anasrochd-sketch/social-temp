ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS hide_members boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS members_select ON public.community_members;

CREATE POLICY members_select ON public.community_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_staff(community_id)
  OR (
    NOT EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.hide_members = true
    )
    AND (
      public.is_public_community(community_id)
      OR public.is_member(community_id)
    )
  )
);
