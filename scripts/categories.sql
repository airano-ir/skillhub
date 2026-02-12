-- SkillHub Categories v3.0
-- Run this for production deployment to initialize 23 standard categories
-- Updated: February 2026 - Based on analysis of 171,509 skills and council review
-- Goal: Reduce "Other" category from 19.9% to <10%

-- Clear existing category links (keep skills intact)
DELETE FROM skill_categories;
DELETE FROM categories;

-- Insert 16 categories ordered by expected volume (largest first for better UX)
INSERT INTO categories (id, name, slug, description, icon, color, sort_order, skill_count) VALUES
  -- Tier 1: High volume categories (15-20% each)
  ('cat-ai-llm', 'AI & LLM', 'ai-llm', 'Large language models, Claude, OpenAI, LangChain, RAG, embeddings, and machine learning', 'Brain', '#8B5CF6', 1, 0),
  ('cat-git', 'Git & Version Control', 'git-version-control', 'GitHub, GitLab, branching, merging, pull requests, and repository management', 'GitBranch', '#6366F1', 2, 0),
  ('cat-data', 'Data & Database', 'data-database', 'SQL, NoSQL, PostgreSQL, MongoDB, Redis, ORM, ETL, and data pipelines', 'Database', '#10B981', 3, 0),
  ('cat-backend', 'Backend & APIs', 'backend-apis', 'REST, GraphQL, Express, FastAPI, Django, microservices, and server-side development', 'Server', '#3B82F6', 4, 0),

  -- Tier 2: Medium volume (6-12% each)
  ('cat-frontend', 'Frontend & UI', 'frontend-ui', 'React, Vue, Svelte, CSS, Tailwind, design systems, and component libraries', 'Monitor', '#EC4899', 5, 0),
  ('cat-agents', 'Agents & Orchestration', 'agents-orchestration', 'Multi-agent systems, agentic workflows, autonomous agents, and AI orchestration', 'Bot', '#7C3AED', 6, 0),
  ('cat-testing', 'Testing & QA', 'testing-qa', 'Jest, Cypress, Playwright, TDD, unit tests, debugging, and quality assurance', 'CheckCircle', '#10B981', 7, 0),
  ('cat-devops', 'DevOps & Cloud', 'devops-cloud', 'Docker, Kubernetes, AWS, Azure, GCP, CI/CD, Terraform, and infrastructure', 'Cloud', '#F97316', 8, 0),
  ('cat-languages', 'Programming Languages', 'programming-languages', 'Python, JavaScript, TypeScript, Rust, Go, Java, and language-specific patterns', 'Code', '#14B8A6', 9, 0),

  -- Tier 3: Specialized (2-5% each)
  ('cat-documents', 'Documents & Files', 'documents-files', 'PDF, Word, Excel, PowerPoint, file conversion, OCR, and document processing', 'FileText', '#3B82F6', 10, 0),
  ('cat-security', 'Security & Auth', 'security-auth', 'OAuth, JWT, encryption, authentication, authorization, and vulnerability scanning', 'Shield', '#EF4444', 11, 0),
  ('cat-mcp', 'MCP & Skills', 'mcp-skills', 'Model Context Protocol, skill creation, superpowers, and agent capabilities', 'Layers', '#A855F7', 12, 0),
  ('cat-prompts', 'Prompts & Instructions', 'prompts-instructions', 'Prompt engineering, chain-of-thought, few-shot learning, and instruction design', 'Sparkles', '#FBBF24', 13, 0),
  ('cat-content', 'Content & Writing', 'content-writing', 'Documentation, technical writing, i18n, localization, and content creation', 'PenTool', '#F59E0B', 14, 0),
  ('cat-mobile', 'Mobile Development', 'mobile-development', 'iOS, Android, React Native, Flutter, Expo, and cross-platform mobile apps', 'Smartphone', '#A855F7', 15, 0),

  -- Tier 3.5: New specialized categories (to reduce "Other" bloat)
  ('cat-productivity', 'Productivity & Notes', 'productivity-notes', 'Note-taking, reminders, task management, calendar, and personal productivity tools', 'StickyNote', '#84CC16', 16, 0),
  ('cat-iot', 'Smart Home & IoT', 'smart-home-iot', 'Home automation, smart devices, Philips Hue, Sonos, sensors, and IoT integrations', 'Home', '#06B6D4', 17, 0),
  ('cat-multimedia', 'Multimedia & Audio/Video', 'multimedia-audio-video', 'Music, video, audio processing, Spotify, FFmpeg, text-to-speech, and media tools', 'Music', '#F43F5E', 18, 0),
  ('cat-social', 'Social & Communications', 'social-communications', 'Twitter, messaging, email clients, social media automation, and chat integrations', 'MessageCircle', '#0EA5E9', 19, 0),
  ('cat-business', 'Business & Finance', 'business-finance', 'Payments, invoicing, financial modeling, market analysis, and business automation', 'Briefcase', '#22C55E', 20, 0),
  ('cat-science', 'Science & Mathematics', 'science-mathematics', 'Math problem solving, scientific computing, chemistry, physics, and research tools', 'Calculator', '#8B5CF6', 21, 0),
  ('cat-blockchain', 'Blockchain & Web3', 'blockchain-web3', 'DeFi, smart contracts, Ethereum, Solana, NFTs, and cryptocurrency tools', 'Coins', '#F59E0B', 22, 0),

  -- Tier 4: Fallback
  ('cat-other', 'Other & Utilities', 'other-utilities', 'Miscellaneous tools and utilities not fitting other categories', 'Package', '#6B7280', 23, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

-- Show result
SELECT 'Categories initialized: ' || count(*) as result FROM categories;
