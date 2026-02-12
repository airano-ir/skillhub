import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';

const SCREENSHOTS_DIR = './screenshots/cli-demo';

// Ensure directory exists
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function generateTerminalHTML(prompt, output, status, showCursor) {
  if (showCursor === undefined) showCursor = true;
  const cursorHtml = showCursor ? '<span class="cursor"></span>' : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: 800px;
      height: 500px;
      background: #0d1117;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .window {
      background: #161b22;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #30363d;
      margin: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .titlebar {
      background: #21262d;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #30363d;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot.red { background: #ff5f56; }
    .dot.yellow { background: #ffbd2e; }
    .dot.green { background: #27c93f; }

    .title {
      flex: 1;
      text-align: center;
      color: #8b949e;
      font-size: 13px;
      font-weight: 500;
    }

    .terminal {
      padding: 20px;
      font-size: 14px;
      line-height: 1.6;
      color: #c9d1d9;
      flex: 1;
      overflow: hidden;
    }

    .prompt { color: #7ee787; }
    .command { color: #79c0ff; }
    .success { color: #7ee787; }
    .muted { color: #8b949e; }
    .skill-id { color: #79c0ff; font-weight: 500; }
    .stars { color: #f7c150; }
    .downloads { color: #a5d6ff; }
    .desc { color: #8b949e; }
    .divider { color: #30363d; }

    .cursor {
      display: inline-block;
      width: 8px;
      height: 18px;
      background: #c9d1d9;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    .status {
      padding: 8px 16px;
      background: #21262d;
      color: #8b949e;
      font-size: 12px;
      border-top: 1px solid #30363d;
    }

    .logo {
      position: absolute;
      bottom: 30px;
      right: 30px;
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #66b3e6 0%, #f7c150 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  </style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
      <div class="title">Terminal — skillhub</div>
    </div>
    <div class="terminal">
      <span class="prompt">${prompt}</span>${cursorHtml}
      ${output}
    </div>
    <div class="status">${status}</div>
  </div>
  <div class="logo">SkillHub</div>
</body>
</html>
  `;
}

// CLI Demo frames - 4 distinct frames
const FRAMES = [
  // Frame 1: Empty prompt, ready to type
  {
    content: generateTerminalHTML('$ ', '', 'Ready'),
    description: 'Empty prompt'
  },

  // Frame 2: Command typed
  {
    content: generateTerminalHTML('$ npx skillhub search pdf', '', 'Press Enter to search...'),
    description: 'Command typed'
  },

  // Frame 3: Searching animation
  {
    content: generateTerminalHTML('$ npx skillhub search pdf', `

<span class="muted">⠋ Searching skills...</span>
`, 'Searching...', false),
    description: 'Searching'
  },

  // Frame 4: Results displayed (final state)
  {
    content: generateTerminalHTML('$ npx skillhub search pdf', `

<span class="success">✔ Found 156 skills:</span>

<span class="divider">─────────────────────────────────────────────────────────────────</span>
  <span class="skill-id">anthropics/skills/pdf</span>            <span class="stars">⭐  30.2k</span>  <span class="downloads">⬇  1.2k</span>
  <span class="desc">Read, extract and manipulate PDF files. Convert PDFs...</span>
<span class="divider">─────────────────────────────────────────────────────────────────</span>
  <span class="skill-id">obra/superpowers/pdf-extraction</span>  <span class="stars">⭐   8.1k</span>  <span class="downloads">⬇    421</span>
  <span class="desc">Advanced PDF extraction with OCR support and table...</span>
<span class="divider">─────────────────────────────────────────────────────────────────</span>
  <span class="skill-id">openai/skills/pdf-reader</span>         <span class="stars">⭐   2.2k</span>  <span class="downloads">⬇    189</span>
  <span class="desc">Parse PDF documents and extract structured text...</span>
<span class="divider">─────────────────────────────────────────────────────────────────</span>

<span class="muted">Install with:</span> <span class="command">npx skillhub install &lt;skill-id&gt;</span>
<span class="muted">Showing 3 of 156. Use --limit to see more.</span>
`, 'Done - 156 skills found', false),
    description: 'Results'
  },
];

async function main() {
  console.log('=== CLI Demo Animation Generator ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 800, height: 500 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Clean up old frames
  const existingFiles = readdirSync(SCREENSHOTS_DIR);
  for (const file of existingFiles) {
    if (file.endsWith('.png')) {
      unlinkSync(join(SCREENSHOTS_DIR, file));
    }
  }

  console.log('Generating 4 distinct frames...');

  for (let i = 0; i < FRAMES.length; i++) {
    const frame = FRAMES[i];
    await page.setContent(frame.content);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'frame-' + String(i).padStart(3, '0') + '.png'),
    });
    console.log('  Frame ' + (i + 1) + '/' + FRAMES.length + ': ' + frame.description);
  }

  await browser.close();

  console.log('\n=== Frames Generated ===');
  console.log('\nFrames saved to: ' + SCREENSHOTS_DIR + '/');
  console.log('\nTo create GIF:');
  console.log('  ffmpeg -framerate 0.5 -i frame-%03d.png -vf "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ../cli-demo.gif');
}

main().catch(console.error);
