import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';
const SCREENSHOTS_DIR = './screenshots';
const OG_DIR = './apps/web/public/og';

// Read logo SVG and encode for inline use
const logoSvg = readFileSync('./apps/web/public/logo.svg', 'utf-8');
const logoBase64 = Buffer.from(logoSvg).toString('base64');

// Screenshots to capture (English locale, scroll past header)
const SCREENSHOTS = [
  { name: '01-homepage', url: '/en', scrollY: 0, description: 'Homepage with hero and featured skills' },
  { name: '02-browse', url: '/en/browse', scrollY: 80, description: 'Browse page with filters and skill cards' },
  { name: '03-skill-detail', url: '/en/skill/anthropics/skills/pdf', scrollY: 60, description: 'Skill detail page' },
  { name: '04-categories', url: '/en/categories', scrollY: 80, description: 'Categories page' },
  { name: '05-search-results', url: '/en/browse?q=python', scrollY: 80, description: 'Search results' },
];

async function createOGImage(page) {
  console.log('Creating OG image (1200x630)...');

  // Create a branded OG image with logo and evergreen stats
  const ogHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: 1200px;
      height: 630px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    .glow {
      position: absolute;
      width: 700px;
      height: 700px;
      background: radial-gradient(circle, rgba(102, 179, 230, 0.12) 0%, transparent 70%);
      top: -150px;
      right: -150px;
    }

    .glow-2 {
      position: absolute;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(247, 193, 80, 0.08) 0%, transparent 70%);
      bottom: -100px;
      left: -100px;
    }

    .content {
      z-index: 1;
      text-align: center;
      padding: 40px 60px;
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-bottom: 20px;
    }

    .logo-icon {
      width: 80px;
      height: 80px;
    }

    .logo-text {
      font-size: 64px;
      font-weight: 800;
      background: linear-gradient(135deg, #66b3e6 0%, #38bdf8 50%, #f7c150 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -2px;
    }

    .tagline {
      font-size: 28px;
      color: #e2e8f0;
      font-weight: 500;
      margin-bottom: 50px;
      line-height: 1.4;
    }

    .tagline span {
      color: #66b3e6;
    }

    .stats {
      display: flex;
      gap: 80px;
      justify-content: center;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 44px;
      font-weight: 700;
      color: #f7c150;
      margin-bottom: 8px;
    }

    .stat-label {
      font-size: 16px;
      color: #94a3b8;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .platforms {
      margin-top: 40px;
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .platform {
      background: rgba(102, 179, 230, 0.15);
      border: 1px solid rgba(102, 179, 230, 0.3);
      border-radius: 20px;
      padding: 8px 20px;
      color: #7dd3fc;
      font-size: 14px;
      font-weight: 500;
    }

    .footer {
      position: absolute;
      bottom: 30px;
      font-size: 18px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .footer .badge {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="glow-2"></div>
  <div class="content">
    <div class="logo-container">
      <img class="logo-icon" src="data:image/svg+xml;base64,${logoBase64}" alt="SkillHub Logo" />
      <div class="logo-text">SkillHub</div>
    </div>
    <div class="tagline">Open-Source Marketplace for <span>AI Agent Skills</span></div>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">170K+</div>
        <div class="stat-label">Skills</div>
      </div>
      <div class="stat">
        <div class="stat-value">4K+</div>
        <div class="stat-label">Contributors</div>
      </div>
      <div class="stat">
        <div class="stat-value">30</div>
        <div class="stat-label">Categories</div>
      </div>
    </div>
    <div class="platforms">
      <span class="platform">Claude Code</span>
      <span class="platform">Codex CLI</span>
      <span class="platform">GitHub Copilot</span>
    </div>
  </div>
  <div class="footer">
    ${new URL(BASE_URL).hostname}
    <span class="badge">MIT License</span>
  </div>
</body>
</html>
  `;

  await page.setContent(ogHTML);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.screenshot({
    path: join(OG_DIR, 'og-default.png'),
    type: 'png'
  });
  console.log('  Saved: og-default.png (1200x630)');
}

async function captureScreenshots(page) {
  console.log('\nCapturing marketing screenshots (English)...');

  for (const shot of SCREENSHOTS) {
    console.log('  Capturing: ' + shot.name + ' - ' + shot.description);

    try {
      await page.goto(BASE_URL + shot.url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for content to load
      await page.waitForTimeout(1500);

      // Scroll past header if specified
      if (shot.scrollY > 0) {
        await page.evaluate((scrollY) => {
          window.scrollTo(0, scrollY);
        }, shot.scrollY);
        await page.waitForTimeout(500);
      }

      await page.screenshot({
        path: join(SCREENSHOTS_DIR, shot.name + '.png'),
        fullPage: false,
      });

      console.log('    Saved: ' + shot.name + '.png');
    } catch (error) {
      console.error('    Error capturing ' + shot.name + ': ' + error.message);
    }
  }
}

async function main() {
  console.log('=== SkillHub Marketing Assets Generator ===\n');

  const browser = await chromium.launch({ headless: true });

  // Create context with HiDPI settings for screenshots
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,  // Retina quality
    locale: 'en-US',  // Force English
  });

  const page = await context.newPage();

  // Create OG Image first
  await createOGImage(page);

  // Capture screenshots from live site (English)
  await captureScreenshots(page);

  await browser.close();

  console.log('\n=== Done! ===');
  console.log('\nOG Image: ' + OG_DIR + '/og-default.png');
  console.log('Screenshots: ' + SCREENSHOTS_DIR + '/');
}

main().catch(console.error);
