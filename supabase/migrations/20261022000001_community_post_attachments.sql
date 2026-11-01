
-- Store attachment metadata alongside each community post.
ALTER TABLE public.space_posts
ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ensure attachment metadata is always a JSON array.
ALTER TABLE public.space_posts
ADD CONSTRAINT space_posts_attachments_is_array
CHECK (jsonb_typeof(attachments) = 'array');
