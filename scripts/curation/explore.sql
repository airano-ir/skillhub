-- Phase 1: Database Exploration - Run inside container:
-- psql -U postgres skillhub -t -A -f /tmp/explore.sql > /tmp/report.json
-- Or paste this SQL directly in psql

WITH active AS (SELECT * FROM skills WHERE is_blocked = false),
overall AS (
  SELECT json_build_object(
    'total', (SELECT COUNT(*)::int FROM skills),
    'active', (SELECT COUNT(*)::int FROM active),
    'blocked', (SELECT COUNT(*) FILTER (WHERE is_blocked)::int FROM skills),
    'owners', (SELECT COUNT(DISTINCT github_owner)::int FROM active),
    'repos', (SELECT COUNT(DISTINCT github_owner||'/'||github_repo)::int FROM active),
    'skillmd', (SELECT COUNT(*) FILTER (WHERE source_format='skill.md')::int FROM active),
    'other_fmt', (SELECT COUNT(*) FILTER (WHERE source_format!='skill.md')::int FROM active),
    'downloads', (SELECT COALESCE(SUM(download_count),0)::bigint FROM active),
    'views', (SELECT COALESCE(SUM(view_count),0)::bigint FROM active),
    'rated', (SELECT COUNT(*) FILTER (WHERE rating_count>0)::int FROM active),
    'first', (SELECT MIN(created_at)::text FROM active),
    'last', (SELECT MAX(created_at)::text FROM active)
  ) AS data
),
source_formats AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT COALESCE(source_format,'null') AS format, COUNT(*)::int AS count
    FROM skills GROUP BY source_format ORDER BY count DESC
  ) t
),
stars_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN github_stars IS NULL OR github_stars=0 THEN '0'
      WHEN github_stars BETWEEN 1 AND 10 THEN '1-10'
      WHEN github_stars BETWEEN 11 AND 50 THEN '11-50'
      WHEN github_stars BETWEEN 51 AND 100 THEN '51-100'
      WHEN github_stars BETWEEN 101 AND 500 THEN '101-500'
      WHEN github_stars BETWEEN 501 AND 1000 THEN '501-1K'
      WHEN github_stars BETWEEN 1001 AND 5000 THEN '1K-5K'
      WHEN github_stars BETWEEN 5001 AND 50000 THEN '5K-50K'
      ELSE '50K+'
    END AS stars, COUNT(*)::int AS skills,
    COUNT(DISTINCT github_owner)::int AS owners
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(github_stars,0))
  ) t
),
dl_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN COALESCE(download_count,0)=0 THEN '0'
      WHEN download_count BETWEEN 1 AND 10 THEN '1-10'
      WHEN download_count BETWEEN 11 AND 100 THEN '11-100'
      ELSE '100+'
    END AS range, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(download_count,0))
  ) t
),
top_dl AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, download_count AS dl, github_stars AS stars, github_owner AS owner
    FROM active WHERE COALESCE(download_count,0)>0 ORDER BY download_count DESC LIMIT 20
  ) t
),
top_vw AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, view_count AS views, github_stars AS stars, github_owner AS owner
    FROM active WHERE COALESCE(view_count,0)>0 ORDER BY view_count DESC LIMIT 20
  ) t
),
security AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT COALESCE(security_status,'null') AS status, COUNT(*)::int AS count
    FROM active GROUP BY security_status ORDER BY count DESC
  ) t
),
content_stats AS (
  SELECT json_build_object(
    'has_content', COUNT(*) FILTER (WHERE raw_content IS NOT NULL)::int,
    'no_content', COUNT(*) FILTER (WHERE raw_content IS NULL)::int,
    'avg_len', ROUND(AVG(LENGTH(raw_content)) FILTER (WHERE raw_content IS NOT NULL))::int,
    'max_len', MAX(LENGTH(raw_content))::int,
    'median_len', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(raw_content)) FILTER (WHERE raw_content IS NOT NULL)::int,
    'avg_desc', ROUND(AVG(LENGTH(description)))::int,
    'good_desc', COUNT(*) FILTER (WHERE LENGTH(description)>100)::int,
    'short_desc', COUNT(*) FILTER (WHERE LENGTH(description)<=20)::int,
    'has_ver', COUNT(*) FILTER (WHERE version IS NOT NULL)::int,
    'has_lic', COUNT(*) FILTER (WHERE license IS NOT NULL)::int,
    'has_auth', COUNT(*) FILTER (WHERE author IS NOT NULL)::int
  ) AS data FROM active
),
content_len AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN raw_content IS NULL THEN 'null'
      WHEN LENGTH(raw_content)<200 THEN '<200'
      WHEN LENGTH(raw_content)<1000 THEN '200-1K'
      WHEN LENGTH(raw_content)<5000 THEN '1K-5K'
      WHEN LENGTH(raw_content)<10000 THEN '5K-10K'
      WHEN LENGTH(raw_content)<50000 THEN '10K-50K'
      ELSE '50K+'
    END AS range, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY MIN(COALESCE(LENGTH(raw_content),-1))
  ) t
),
trigger_stats AS (
  SELECT json_build_object(
    'has_triggers', COUNT(*) FILTER (WHERE triggers IS NOT NULL)::int,
    'no_triggers', COUNT(*) FILTER (WHERE triggers IS NULL)::int,
    'file_pats', COUNT(*) FILTER (WHERE triggers->>'filePatterns' IS NOT NULL AND triggers->>'filePatterns'!='[]')::int,
    'keywords', COUNT(*) FILTER (WHERE triggers->>'keywords' IS NOT NULL AND triggers->>'keywords'!='[]')::int,
    'platforms', COUNT(*) FILTER (WHERE compatibility->>'platforms' IS NOT NULL AND compatibility->>'platforms'!='[]')::int
  ) AS data FROM active
),
freshness AS (
  SELECT json_build_object(
    'created', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT CASE WHEN created_at>NOW()-INTERVAL '7d' THEN '7d' WHEN created_at>NOW()-INTERVAL '30d' THEN '30d'
        WHEN created_at>NOW()-INTERVAL '90d' THEN '90d' ELSE 'older' END AS range, COUNT(*)::int AS skills
      FROM active GROUP BY 1 ORDER BY MIN(NOW()-created_at)) t),
    'updated', (SELECT json_agg(row_to_json(t)) FROM (
      SELECT CASE WHEN updated_at>NOW()-INTERVAL '7d' THEN '7d' WHEN updated_at>NOW()-INTERVAL '30d' THEN '30d'
        WHEN updated_at>NOW()-INTERVAL '90d' THEN '90d' ELSE 'older' END AS range, COUNT(*)::int AS skills
      FROM active GROUP BY 1 ORDER BY MIN(NOW()-updated_at)) t)
  ) AS data
),
top_owners AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner AS owner, COUNT(*)::int AS skills, COUNT(DISTINCT github_repo)::int AS repos,
           MAX(github_stars)::int AS max_stars, COALESCE(SUM(download_count),0)::int AS dl
    FROM active GROUP BY github_owner ORDER BY skills DESC LIMIT 30
  ) t
),
owner_concentration AS (
  SELECT json_build_object(
    'top1', SUM(cnt) FILTER (WHERE rn<=1)::int, 'top5', SUM(cnt) FILTER (WHERE rn<=5)::int,
    'top10', SUM(cnt) FILTER (WHERE rn<=10)::int, 'top20', SUM(cnt) FILTER (WHERE rn<=20)::int,
    'total', SUM(cnt)::int, 'owners', COUNT(*)::int
  ) AS data FROM (
    SELECT github_owner, COUNT(*)::int AS cnt, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
    FROM active GROUP BY github_owner
  ) x
),
aggregators AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner||'/'||github_repo AS repo, COUNT(*)::int AS skills, MAX(github_stars)::int AS stars
    FROM active GROUP BY github_owner, github_repo HAVING COUNT(*)>=20 ORDER BY skills DESC LIMIT 20
  ) t
),
collections AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT github_owner||'/'||github_repo AS repo, COUNT(*)::int AS skills, MAX(github_stars)::int AS stars
    FROM active GROUP BY github_owner, github_repo HAVING COUNT(*) BETWEEN 3 AND 19 ORDER BY skills DESC LIMIT 20
  ) t
),
skills_per_repo AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    WITH rc AS (SELECT COUNT(*)::int AS cnt FROM active GROUP BY github_owner, github_repo)
    SELECT CASE WHEN cnt=1 THEN '1' WHEN cnt=2 THEN '2' WHEN cnt BETWEEN 3 AND 10 THEN '3-10'
      WHEN cnt BETWEEN 11 AND 50 THEN '11-50' ELSE '50+' END AS per_repo,
      COUNT(*)::int AS repos, SUM(cnt)::int AS total_skills
    FROM rc GROUP BY 1 ORDER BY MIN(cnt)
  ) t
),
categories_dist AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT c.name AS category, c.skill_count::int AS skills
    FROM categories c WHERE c.id NOT LIKE 'parent-%' ORDER BY c.skill_count DESC
  ) t
),
flags AS (
  SELECT json_build_object(
    'verified', COUNT(*) FILTER (WHERE is_verified)::int,
    'featured', COUNT(*) FILTER (WHERE is_featured)::int,
    'user_rated', COUNT(*) FILTER (WHERE rating_count>0)::int
  ) AS data FROM active
),
cross_stats AS (
  SELECT json_build_object(
    'users', (SELECT COUNT(*)::int FROM users),
    'ratings', (SELECT COUNT(*)::int FROM ratings),
    'installs', (SELECT COUNT(*)::int FROM installations),
    'favorites', (SELECT COUNT(*)::int FROM favorites),
    'disc_repos', (SELECT COUNT(*)::int FROM discovered_repos),
    'subs', (SELECT COUNT(*) FILTER (WHERE unsubscribed_at IS NULL)::int FROM email_subscriptions)
  ) AS data
),
usability AS (
  SELECT json_build_object(
    'strong', COUNT(*) FILTER (WHERE LENGTH(description)>50 AND raw_content IS NOT NULL AND LENGTH(raw_content)>500 AND security_status='pass')::int,
    'downloaded', COUNT(*) FILTER (WHERE COALESCE(download_count,0)>0)::int,
    'high_q', COUNT(*) FILTER (WHERE github_stars>=10 AND LENGTH(description)>50 AND raw_content IS NOT NULL AND security_status='pass')::int,
    'premium', COUNT(*) FILTER (WHERE github_stars>=100 AND COALESCE(download_count,0)>0 AND security_status='pass')::int,
    'skillmd_q', COUNT(*) FILTER (WHERE source_format='skill.md' AND LENGTH(description)>50 AND raw_content IS NOT NULL AND LENGTH(raw_content)>300 AND security_status='pass')::int
  ) AS data FROM active
),
repo_types AS (
  SELECT json_build_object(
    'single', COUNT(*) FILTER (WHERE cnt=1)::int, 'two', COUNT(*) FILTER (WHERE cnt=2)::int,
    'multi', COUNT(*) FILTER (WHERE cnt>=3)::int, 'total', COUNT(*)::int
  ) AS data FROM (SELECT COUNT(*)::int AS cnt FROM active GROUP BY github_owner, github_repo) x
),
name_patterns AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT CASE
      WHEN name ILIKE '%rule%' OR name ILIKE '%config%' OR name ILIKE '%setup%' THEN 'rules/config'
      WHEN name ILIKE '%cursor%' OR name ILIKE '%claude%' OR name ILIKE '%copilot%' THEN 'tool-specific'
      WHEN name ILIKE '%project%' OR name ILIKE '%team%' THEN 'project/team'
      ELSE 'generic'
    END AS pattern, COUNT(*)::int AS skills
    FROM active GROUP BY 1 ORDER BY skills DESC
  ) t
),
top_by_stars AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT id, name, github_stars AS stars, COALESCE(download_count,0) AS dl,
           security_status AS sec, source_format AS fmt, LEFT(description,80) AS description
    FROM active ORDER BY github_stars DESC LIMIT 15
  ) t
),
discovered AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT discovered_via AS source, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE has_skill_md)::int AS with_skills
    FROM discovered_repos GROUP BY discovered_via ORDER BY total DESC
  ) t
),
hash_dupes AS (
  SELECT json_agg(row_to_json(t)) AS data FROM (
    SELECT content_hash, COUNT(*)::int AS copies, MIN(name) AS sample
    FROM active WHERE content_hash IS NOT NULL
    GROUP BY content_hash HAVING COUNT(*)>2 ORDER BY copies DESC LIMIT 15
  ) t
)
SELECT json_build_object(
  'overall', (SELECT data FROM overall),
  'sourceFormats', (SELECT data FROM source_formats),
  'starsDist', (SELECT data FROM stars_dist),
  'dlDist', (SELECT data FROM dl_dist),
  'topDL', (SELECT data FROM top_dl),
  'topVW', (SELECT data FROM top_vw),
  'security', (SELECT data FROM security),
  'contentStats', (SELECT data FROM content_stats),
  'contentLen', (SELECT data FROM content_len),
  'triggerStats', (SELECT data FROM trigger_stats),
  'freshness', (SELECT data FROM freshness),
  'topOwners', (SELECT data FROM top_owners),
  'ownerConcentration', (SELECT data FROM owner_concentration),
  'aggregators', (SELECT data FROM aggregators),
  'collections', (SELECT data FROM collections),
  'skillsPerRepo', (SELECT data FROM skills_per_repo),
  'categories', (SELECT data FROM categories_dist),
  'flags', (SELECT data FROM flags),
  'crossStats', (SELECT data FROM cross_stats),
  'usability', (SELECT data FROM usability),
  'repoTypes', (SELECT data FROM repo_types),
  'namePatterns', (SELECT data FROM name_patterns),
  'topByStars', (SELECT data FROM top_by_stars),
  'discovered', (SELECT data FROM discovered),
  'hashDupes', (SELECT data FROM hash_dupes)
) AS report;
