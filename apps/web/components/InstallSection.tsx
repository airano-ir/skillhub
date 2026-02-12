'use client';

import { useState, useCallback, useEffect } from 'react';
import { Copy, Terminal, FolderOpen, Download, Check, Loader2, AlertTriangle } from 'lucide-react';

type Platform = 'claude' | 'codex' | 'copilot' | 'cursor' | 'windsurf';

// Flat-file platforms where the skill file goes directly into the rules/instructions dir
const FLAT_FILE_PLATFORMS: Platform[] = ['cursor', 'windsurf', 'copilot'];

// All known main instruction file names across platforms
const MAIN_FILE_NAMES = ['SKILL.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', 'copilot-instructions.md'];

// Map sourceFormat to its native platform (skip transformation when source matches target)
const FORMAT_NATIVE_PLATFORM: Record<string, Platform> = {
  'skill.md': 'claude',
  'agents.md': 'codex',
  'cursorrules': 'cursor',
  'windsurfrules': 'windsurf',
  'copilot-instructions': 'copilot',
};

interface InstallCommand {
  cli: string;
  path: string;
}

interface SkillFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  content?: string;
  downloadUrl?: string;
}

// JSZip type for dynamic loading
interface JSZipInstance {
  file(name: string, content: string | ArrayBuffer): void;
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface JSZipConstructor {
  new(): JSZipInstance;
}

// CDN URLs for JSZip (with fallbacks)
const JSZIP_CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

// Dynamically load JSZip from CDN with fallbacks
let jsZipPromise: Promise<JSZipConstructor> | null = null;

function loadJSZip(): Promise<JSZipConstructor> {
  if (jsZipPromise) return jsZipPromise;

  jsZipPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== 'undefined' && (window as unknown as { JSZip?: JSZipConstructor }).JSZip) {
      resolve((window as unknown as { JSZip: JSZipConstructor }).JSZip);
      return;
    }

    // Try loading from CDN with fallbacks
    let cdnIndex = 0;

    function tryLoadFromCDN() {
      if (cdnIndex >= JSZIP_CDN_URLS.length) {
        reject(new Error('Failed to load JSZip from all CDNs. Please check your internet connection.'));
        return;
      }

      const script = document.createElement('script');
      script.src = JSZIP_CDN_URLS[cdnIndex];
      script.async = true;
      script.onload = () => {
        const JSZip = (window as unknown as { JSZip?: JSZipConstructor }).JSZip;
        if (JSZip) {
          resolve(JSZip);
        } else {
          // Try next CDN
          cdnIndex++;
          tryLoadFromCDN();
        }
      };
      script.onerror = () => {
        console.warn(`Failed to load JSZip from ${JSZIP_CDN_URLS[cdnIndex]}, trying fallback...`);
        cdnIndex++;
        tryLoadFromCDN();
      };
      document.head.appendChild(script);
    }

    tryLoadFromCDN();
  });

  return jsZipPromise;
}

// --- Platform-specific file transformation for downloads ---

function stripFrontmatter(content: string): { body: string; description?: string; filePatterns?: string[] } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { body: content };

  const yaml = match[1];
  const body = match[2].trim();

  // Extract description from YAML
  const descMatch = yaml.match(/^description:\s*(.+)$/m);
  const description = descMatch ? descMatch[1].trim() : undefined;

  // Extract file patterns from triggers.filePatterns
  const patternsMatch = yaml.match(/filePatterns:\s*\n((?:\s+-\s+.+\n?)+)/);
  let filePatterns: string[] | undefined;
  if (patternsMatch) {
    filePatterns = patternsMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').replace(/["']/g, '').trim())
      .filter(Boolean);
  }

  return { body, description, filePatterns };
}

function getPlatformFileName(platform: Platform, skillName: string): string {
  switch (platform) {
    case 'claude':
    case 'codex':
      return 'SKILL.md';
    case 'cursor':
      return `${skillName}.mdc`;
    case 'windsurf':
      return `${skillName}.md`;
    case 'copilot':
      return `${skillName}.instructions.md`;
  }
}

function transformSkillContent(platform: Platform, content: string, skillName: string, srcFormat?: string): string {
  // If the source is already in the target platform's native format, skip transformation
  if (srcFormat && FORMAT_NATIVE_PLATFORM[srcFormat] === platform) return content;

  if (platform === 'claude' || platform === 'codex') return content;

  const { body, description, filePatterns } = stripFrontmatter(content);

  if (platform === 'cursor') {
    const mdcFields: string[] = [];
    if (description) mdcFields.push(`description: ${description}`);
    if (filePatterns && filePatterns.length > 0) {
      mdcFields.push(`globs: ${filePatterns.join(', ')}`);
      mdcFields.push('alwaysApply: false');
    } else {
      mdcFields.push('alwaysApply: true');
    }
    return `---\n${mdcFields.join('\n')}\n---\n${body}\n`;
  }

  // windsurf / copilot: plain markdown
  let plainBody = body;
  if (!plainBody.startsWith('# ')) {
    plainBody = `# ${skillName}\n\n${plainBody}`;
  }
  return plainBody + '\n';
}

interface InstallSectionProps {
  skillId: string;
  skillName: string;
  repositoryUrl: string;
  sourceFormat?: string;
  installCommands: Record<Platform, InstallCommand>;
  translations: {
    title: string;
    cli: string;
    cliGlobal?: string;
    cliProject?: string;
    selectFolder: string;
    suggestedPath: string;
    copied: string;
    downloadZip: string;
    copyCommand: string;
    downloading: string;
    installing: string;
    installed: string;
    downloadFailed: string;
    browserNotSupported: string;
    rateLimitError: string;
    timeoutError: string;
    notFoundError: string;
    noFilesError: string;
    disclaimer: string;
    folderNotePrefix: string;
    folderNoteSuffix: string;
  };
}

export function InstallSection({
  skillId,
  skillName,
  repositoryUrl: _repositoryUrl,
  sourceFormat,
  installCommands,
  translations,
}: InstallSectionProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('claude');
  const [copied, setCopied] = useState(false);
  const [installStatus, setInstallStatus] = useState<'idle' | 'downloading' | 'installing' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Check if File System Access API is supported (after mount to avoid hydration mismatch)
  const [isFileSystemSupported, setIsFileSystemSupported] = useState(false);

  useEffect(() => {
    setIsFileSystemSupported('showDirectoryPicker' in window);
  }, []);

  const currentCommand = installCommands[selectedPlatform];

  // Copy command to clipboard
  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentCommand.cli);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [currentCommand.cli]);

  // Download ZIP using server-side generation (fallback)
  const downloadFromServer = useCallback(async () => {
    const response = await fetch(`/api/skill-files/zip?id=${encodeURIComponent(skillId)}&platform=${selectedPlatform}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorCode = errorData.code || 'UNKNOWN';

      switch (errorCode) {
        case 'RATE_LIMIT':
          throw new Error(translations.rateLimitError);
        case 'TIMEOUT':
          throw new Error(translations.timeoutError);
        case 'NOT_FOUND':
        case 'GITHUB_NOT_FOUND':
          throw new Error(translations.notFoundError);
        case 'NO_FILES':
          throw new Error(translations.noFilesError);
        default:
          throw new Error(errorData.error || translations.downloadFailed);
      }
    }

    // Server returns ZIP directly - trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skillName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [skillId, skillName, selectedPlatform, translations]);

  // Download ZIP containing only the skill folder
  // Tries client-side generation first, falls back to server-side if CDNs fail
  const handleDownloadZip = useCallback(async () => {
    try {
      setInstallStatus('downloading');
      setErrorMessage('');

      let useServerFallback = false;

      // Try client-side ZIP generation first
      try {
        // Fetch skill files from API
        const response = await fetch(`/api/skill-files?id=${encodeURIComponent(skillId)}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorCode = errorData.code || 'UNKNOWN';

          switch (errorCode) {
            case 'RATE_LIMIT':
              throw new Error(translations.rateLimitError);
            case 'TIMEOUT':
              throw new Error(translations.timeoutError);
            case 'NOT_FOUND':
            case 'GITHUB_NOT_FOUND':
              throw new Error(translations.notFoundError);
            default:
              throw new Error(errorData.error || translations.downloadFailed);
          }
        }

        const data = await response.json();
        const files: SkillFile[] = data.files;

        if (!files || files.length === 0) {
          throw new Error(translations.noFilesError);
        }

        // Dynamically load JSZip from CDN
        const JSZip = await loadJSZip();
        const zip = new JSZip();

        // Add files to ZIP with platform-specific transformation
        const isFlatPlatform = FLAT_FILE_PLATFORMS.includes(selectedPlatform);
        for (const file of files) {
          if (file.type === 'file') {
            let content = file.content;

            // If no content but has downloadUrl, fetch it
            if (!content && file.downloadUrl) {
              try {
                const fileResponse = await fetch(file.downloadUrl);
                if (fileResponse.ok) {
                  content = await fileResponse.text();
                }
              } catch {
                console.warn(`Failed to download: ${file.path}`);
                continue;
              }
            }

            if (content) {
              const isMainSkillFile = MAIN_FILE_NAMES.includes(file.name) && (file.path === file.name);

              if (isMainSkillFile) {
                const platformFileName = getPlatformFileName(selectedPlatform, skillName);
                const transformed = transformSkillContent(selectedPlatform, content, skillName, sourceFormat);
                if (isFlatPlatform) {
                  // Flat platform: skill file at root, supporting files in subfolder
                  zip.file(platformFileName, transformed);
                } else {
                  zip.file(`${skillName}/${platformFileName}`, transformed);
                }
              } else {
                // Supporting files (scripts, references) always go in subfolder
                zip.file(`${skillName}/${file.path || file.name}`, content);
              }
            }
          }
        }

        // Generate ZIP and download
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${skillName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (clientErr) {
        // If JSZip failed to load from CDNs, use server-side fallback
        const errorMsg = clientErr instanceof Error ? clientErr.message : '';
        if (errorMsg.includes('Failed to load JSZip')) {
          console.warn('JSZip CDN failed, falling back to server-side ZIP generation');
          useServerFallback = true;
        } else {
          // Re-throw non-CDN errors
          throw clientErr;
        }
      }

      // Server-side fallback
      if (useServerFallback) {
        await downloadFromServer();
      }

      // Track the download
      fetch(`/api/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, platform: selectedPlatform, method: useServerFallback ? 'web-zip-server' : 'web-zip' }),
      }).catch(() => {}); // Silently fail - tracking is not critical

      setInstallStatus('done');
      setTimeout(() => setInstallStatus('idle'), 3000);
    } catch (err) {
      console.error('Download failed:', err);
      const errorMsg = err instanceof Error ? err.message : translations.downloadFailed;
      setErrorMessage(errorMsg);
      setInstallStatus('error');
      setTimeout(() => setInstallStatus('idle'), 5000);
    }
  }, [skillId, skillName, selectedPlatform, translations, downloadFromServer]);

  // Install using File System Access API
  const handleSelectFolder = useCallback(async () => {
    if (!isFileSystemSupported) {
      setErrorMessage(translations.browserNotSupported);
      setInstallStatus('error');
      setTimeout(() => setInstallStatus('idle'), 3000);
      return;
    }

    try {
      setInstallStatus('downloading');
      setErrorMessage('');

      // Fetch skill files from API
      const response = await fetch(`/api/skill-files?id=${encodeURIComponent(skillId)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorCode = errorData.code || 'UNKNOWN';

        // Show specific error messages based on error code
        switch (errorCode) {
          case 'RATE_LIMIT':
            throw new Error(translations.rateLimitError);
          case 'TIMEOUT':
            throw new Error(translations.timeoutError);
          case 'NOT_FOUND':
          case 'GITHUB_NOT_FOUND':
            throw new Error(translations.notFoundError);
          default:
            throw new Error(errorData.error || translations.downloadFailed);
        }
      }

      const data = await response.json();
      const files: SkillFile[] = data.files;

      if (!files || files.length === 0) {
        throw new Error(translations.noFilesError);
      }

      setInstallStatus('installing');

      // Request directory access
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();

      // For flat-file platforms, the main skill file goes directly into the selected folder
      // Supporting files go in a subfolder
      const isFlatPlatform = FLAT_FILE_PLATFORMS.includes(selectedPlatform);
      const skillDir = isFlatPlatform ? dirHandle : await dirHandle.getDirectoryHandle(skillName, { create: true });
      // For flat platforms, supporting files (scripts/references) still need a subfolder
      const trackingDir = isFlatPlatform ? await dirHandle.getDirectoryHandle(skillName, { create: true }) : skillDir;

      // Write all skill files with platform-specific transformation
      for (const file of files) {
        if (file.type === 'dir') {
          // Create subdirectory
          await getOrCreateDir(trackingDir, file.path);
        } else if (file.type === 'file') {
          let content = file.content;

          // If no content but has downloadUrl, fetch it
          if (!content && file.downloadUrl) {
            try {
              const fileResponse = await fetch(file.downloadUrl);
              if (fileResponse.ok) {
                content = await fileResponse.text();
              }
            } catch {
              console.warn(`Failed to download: ${file.path}`);
              continue;
            }
          }

          if (content) {
            const isMainSkillFile = MAIN_FILE_NAMES.includes(file.name) && (file.path === file.name);

            if (isMainSkillFile) {
              // Transform and rename the main skill file
              const platformFileName = getPlatformFileName(selectedPlatform, skillName);
              const transformed = transformSkillContent(selectedPlatform, content, skillName, sourceFormat);
              const fileHandle = await skillDir.getFileHandle(platformFileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(transformed);
              await writable.close();
            } else {
              // Supporting files go into the tracking/skill directory
              const pathParts = file.path.split('/');
              const fileName = pathParts.pop() || file.name;
              let targetDir = trackingDir;

              if (pathParts.length > 0) {
                targetDir = await getOrCreateDir(trackingDir, pathParts.join('/'));
              }

              const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(content);
              await writable.close();
            }
          }
        }
      }

      // Track the installation
      fetch(`/api/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, platform: selectedPlatform, method: 'web-folder' }),
      }).catch(() => {}); // Silently fail - tracking is not critical

      setInstallStatus('done');
      setTimeout(() => setInstallStatus('idle'), 3000);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled the picker
        setInstallStatus('idle');
        return;
      }
      console.error('Install failed:', err);
      // Show the specific error message if available
      const errorMsg = err instanceof Error ? err.message : translations.downloadFailed;
      setErrorMessage(errorMsg);
      setInstallStatus('error');
      setTimeout(() => setInstallStatus('idle'), 5000); // Show error longer (5s)
    }
  }, [isFileSystemSupported, skillName, skillId, selectedPlatform, translations]);

  // Helper function to get or create nested directories
  async function getOrCreateDir(
    parentDir: FileSystemDirectoryHandle,
    path: string
  ): Promise<FileSystemDirectoryHandle> {
    const parts = path.split('/').filter(Boolean);
    let currentDir = parentDir;

    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    return currentDir;
  }

  const platforms: Platform[] = ['claude', 'codex', 'copilot', 'cursor', 'windsurf'];

  return (
    <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm sticky top-24">
      <h2 className="font-semibold text-lg text-text-primary mb-4 flex items-center gap-2">
        <Terminal className="w-5 h-5" />
        {translations.title}
      </h2>

      {/* Platform Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-surface-subtle rounded-lg overflow-x-auto">
        {platforms.map((platform) => (
          <button
            key={platform}
            onClick={() => setSelectedPlatform(platform)}
            className={`flex-shrink-0 px-2.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedPlatform === platform
                ? 'bg-surface-elevated shadow-sm text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {platform.charAt(0).toUpperCase() + platform.slice(1)}
          </button>
        ))}
      </div>

      {/* Security Disclaimer */}
      <div className="mb-4 p-3 bg-warning-bg border border-warning/30 rounded-lg">
        <div className="flex gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary" dir="auto">
            {translations.disclaimer}
          </p>
        </div>
      </div>

      {/* CLI Install */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {translations.cli}
        </label>

        {/* Global Install */}
        <div className="mb-3">
          <p className="text-xs text-text-muted mb-1" dir="ltr">
            {translations.cliGlobal || 'Install globally (user-level):'}
          </p>
          <div className="flex items-center gap-2">
            <code
              data-testid="install-command"
              className="flex-1 px-3 py-2 bg-surface-subtle rounded-lg text-sm font-mono text-text-primary overflow-x-auto"
              dir="ltr"
            >
              {currentCommand.cli}
            </code>
            <button
              onClick={handleCopyCommand}
              className="p-2 text-text-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              title={translations.copyCommand}
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Project Install */}
        <div>
          <p className="text-xs text-text-muted mb-1" dir="ltr">
            {translations.cliProject || 'Install in current project:'}
          </p>
          <code className="block px-3 py-2 bg-surface-subtle rounded-lg text-sm font-mono text-text-primary overflow-x-auto" dir="ltr">
            {currentCommand.cli} --project
          </code>
        </div>

        {copied && (
          <p className="text-xs text-success mt-2">{translations.copied}</p>
        )}
      </div>

      {/* Install Options */}
      <div className="space-y-2 mb-4">
        {/* Download ZIP */}
        <button
          onClick={handleDownloadZip}
          disabled={installStatus !== 'idle'}
          className="btn-secondary w-full gap-2 justify-center disabled:opacity-50"
        >
          {installStatus === 'downloading' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {translations.downloading}
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              {translations.downloadZip}
            </>
          )}
        </button>

        {/* Select Folder (File System API) */}
        {isFileSystemSupported && (
          <button
            onClick={handleSelectFolder}
            disabled={installStatus !== 'idle'}
            className="btn-primary w-full gap-2 justify-center disabled:opacity-50"
          >
            {installStatus === 'installing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {translations.installing}
              </>
            ) : installStatus === 'done' ? (
              <>
                <Check className="w-4 h-4" />
                {translations.installed}
              </>
            ) : (
              <>
                <FolderOpen className="w-4 h-4" />
                {translations.selectFolder}
              </>
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {installStatus === 'error' && errorMessage && (
        <p className="text-xs text-error mb-2">{errorMessage}</p>
      )}

      {/* Suggested Path & Folder Note */}
      <div className="text-xs text-text-muted space-y-1">
        <p>
          {translations.suggestedPath}: <code className="ltr-nums">{currentCommand.path}</code>
        </p>
        {isFileSystemSupported && (
          <p className="text-text-muted/70">
            {translations.folderNotePrefix}{skillName}{translations.folderNoteSuffix}
          </p>
        )}
      </div>
    </div>
  );
}
