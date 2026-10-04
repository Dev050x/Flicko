UPDATE "users"
SET "avatar_id" = (ARRAY['bobo','bobo-shades','froggo','astro-froggo','penny','dj-penny','pup','laser-pup'])[1 + floor(random() * 8)::int]
WHERE "avatar_id" IS NULL AND "avatar_url" IS NULL;
