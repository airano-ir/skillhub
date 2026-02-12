-- SkillHub: Add 7 new categories
-- Safe to run - only adds new categories, doesn't affect existing links
-- Run: docker exec -i skillhub-db psql -U postgres -d skillhub < scripts/add-new-categories.sql

-- Insert 7 new categories (ignore if already exist)
INSERT INTO categories (id, name, slug, description, icon, color, sort_order, skill_count) VALUES
  ('cat-productivity', 'Productivity & Notes', 'productivity-notes', 'Note-taking, reminders, task management, calendar, and personal productivity tools', 'StickyNote', '#84CC16', 16, 0),
  ('cat-iot', 'Smart Home & IoT', 'smart-home-iot', 'Home automation, smart devices, Philips Hue, Sonos, sensors, and IoT integrations', 'Home', '#06B6D4', 17, 0),
  ('cat-multimedia', 'Multimedia & Audio/Video', 'multimedia-audio-video', 'Music, video, audio processing, Spotify, FFmpeg, text-to-speech, and media tools', 'Music', '#F43F5E', 18, 0),
  ('cat-social', 'Social & Communications', 'social-communications', 'Twitter, messaging, email clients, social media automation, and chat integrations', 'MessageCircle', '#0EA5E9', 19, 0),
  ('cat-business', 'Business & Finance', 'business-finance', 'Payments, invoicing, financial modeling, market analysis, and business automation', 'Briefcase', '#22C55E', 20, 0),
  ('cat-science', 'Science & Mathematics', 'science-mathematics', 'Math problem solving, scientific computing, chemistry, physics, and research tools', 'Calculator', '#8B5CF6', 21, 0),
  ('cat-blockchain', 'Blockchain & Web3', 'blockchain-web3', 'DeFi, smart contracts, Ethereum, Solana, NFTs, and cryptocurrency tools', 'Coins', '#F59E0B', 22, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

-- Update cat-other to have the highest sort_order
UPDATE categories SET sort_order = 23 WHERE id = 'cat-other';

-- Show result
SELECT id, name, skill_count, sort_order FROM categories ORDER BY sort_order;
