'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { Loader2, CheckCircle, AlertCircle, Github, Clock, Plus, Minus, ChevronDown, ChevronUp, ExternalLink, Trash2 } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

const isMirror = process.env.NEXT_PUBLIC_IS_PRIMARY === 'false';
const PRIMARY_URL = process.env.NEXT_PUBLIC_PRIMARY_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

// Validate GitHub URL format
function isValidGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'github.com' && urlObj.pathname.split('/').filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

interface ClaimFormProps {
  translations: {
    title: string;
    subtitle: string;
    loginRequired: string;
    signIn: string;
    optional: string;
    mirror: {
      title: string;
      description: string;
      button: string;
    };
    tabs: {
      remove: string;
      add: string;
      removeRepo: string;
    };
    removeRepoForm: {
      repoUrl: string;
      repoUrlPlaceholder: string;
      repoUrlHelp: string;
      reason: string;
      reasonPlaceholder: string;
      submit: string;
      submitting: string;
    };
    removeRepoSuccess: {
      title: string;
      description: string;
      descriptionZero: string;
    };
    removeRepoError: {
      notOwner: string;
      invalidRepo: string;
      parseError: string;
    };
    form: {
      skillId: string;
      skillIdPlaceholder: string;
      skillIdHelp: string;
      reason: string;
      reasonPlaceholder: string;
      submit: string;
      submitting: string;
    };
    addForm: {
      repositoryUrl: string;
      repositoryUrlPlaceholder: string;
      repositoryUrlHelp: string;
      reason: string;
      reasonPlaceholder: string;
      submit: string;
      submitting: string;
    };
    success: {
      title: string;
      description: string;
      pendingTitle: string;
      pendingDescription: string;
      viewRequests: string;
    };
    addSuccess: {
      title: string;
      description: string;
      descriptionNoSkillMd: string;
      descriptionMultiplePrefix: string;
      descriptionMultipleSuffix: string;
      viewRequests: string;
      foundSkillsIn: string;
      root: string;
      andMore: string;
      reEnabledTitle: string;
      reEnabledDescription: string;
    };
    error: {
      notOwner: string;
      skillNotFound: string;
      alreadyPending: string;
      githubError: string;
      invalidSkill: string;
      invalidUrl: string;
      invalidRepo: string;
      rateLimitExceeded: string;
      networkTimeout: string;
      generic: string;
      repoBlockedByOwner: string;
    };
    myRequests: {
      title: string;
      empty: string;
      status: {
        pending: string;
        approved: string;
        rejected: string;
        indexed: string;
      };
      skillsFoundPrefix: string;
      skillsFoundSuffix: string;
      showLess: string;
      showAllPrefix: string;
      showAllSuffix: string;
    };
  };
}

interface RemovalRequest {
  id: string;
  skillId: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface AddRequest {
  id: string;
  repositoryUrl: string;
  skillPath: string | null;
  reason: string;
  status: string;
  hasSkillMd: boolean;
  createdAt: string;
  indexedSkillId: string | null;
  errorMessage: string | null;
}

export function ClaimForm({ translations }: ClaimFormProps) {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'remove' | 'add' | 'remove-repo'>('add'); // Default to 'add' tab
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  // Read tab from URL hash on mount and update on hash change
  useEffect(() => {
    const readHashTab = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'remove' || hash === 'add' || hash === 'remove-repo') {
        setActiveTab(hash as 'remove' | 'add' | 'remove-repo');
      }
    };
    readHashTab();
    window.addEventListener('hashchange', readHashTab);
    return () => window.removeEventListener('hashchange', readHashTab);
  }, []);

  // Update URL hash when tab changes
  const handleTabChange = useCallback((tab: 'remove' | 'add' | 'remove-repo') => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  }, []);

  // Toggle expanded state for a request
  const toggleExpanded = useCallback((requestId: string) => {
    setExpandedRequests(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }, []);

  // Remove form state
  const [skillId, setSkillId] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [isSubmittingRemove, setIsSubmittingRemove] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [removeSuccess, setRemoveSuccess] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const [loadingRemovalRequests, setLoadingRemovalRequests] = useState(false);

  // Add form state
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryUrlError, setRepositoryUrlError] = useState('');
  const [addReason, setAddReason] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const [addHasSkillMd, setAddHasSkillMd] = useState(true);
  const [addSkillCount, setAddSkillCount] = useState(0);
  const [addSkillPaths, setAddSkillPaths] = useState<string[]>([]);
  const [addReEnabled, setAddReEnabled] = useState(false);
  const [addRequests, setAddRequests] = useState<AddRequest[]>([]);
  const [loadingAddRequests, setLoadingAddRequests] = useState(false);

  // Remove-repo form state
  const [repoUrl, setRepoUrl] = useState('');
  const [repoReason, setRepoReason] = useState('');
  const [isSubmittingRepo, setIsSubmittingRepo] = useState(false);
  const [repoError, setRepoError] = useState('');
  const [repoSuccess, setRepoSuccess] = useState(false);
  const [repoBlockedCount, setRepoBlockedCount] = useState(0);
  const [repoName, setRepoName] = useState('');

  // Fetch user's existing requests
  useEffect(() => {
    if (session) {
      fetchRemovalRequests();
      fetchAddRequests();
    }
  }, [session]);

  const fetchRemovalRequests = async () => {
    setLoadingRemovalRequests(true);
    try {
      const res = await fetch('/api/skills/removal-request');
      if (res.ok) {
        const data = await res.json();
        setRemovalRequests(data.requests || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoadingRemovalRequests(false);
    }
  };

  const fetchAddRequests = async () => {
    setLoadingAddRequests(true);
    try {
      const res = await fetch('/api/skills/add-request');
      if (res.ok) {
        const data = await res.json();
        setAddRequests(data.requests || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoadingAddRequests(false);
    }
  };

  const handleRemoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      signIn('github');
      return;
    }

    if (!skillId.trim()) {
      return;
    }

    setIsSubmittingRemove(true);
    setRemoveError('');
    setRemoveSuccess(false);

    try {
      const res = await fetchWithCsrf('/api/skills/removal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skillId.trim(), reason: removeReason.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        switch (data.code) {
          case 'NOT_OWNER':
            setRemoveError(translations.error.notOwner);
            break;
          case 'SKILL_NOT_FOUND':
            setRemoveError(translations.error.skillNotFound);
            break;
          case 'ALREADY_PENDING':
            setRemoveError(translations.error.alreadyPending);
            break;
          case 'GITHUB_ERROR':
            setRemoveError(translations.error.githubError);
            break;
          case 'INVALID_SKILL':
            setRemoveError(translations.error.invalidSkill);
            break;
          case 'AUTH_REQUIRED':
            signIn('github');
            return;
          default:
            console.error('Claim form error:', data);
            setRemoveError(translations.error.generic);
        }
        return;
      }

      setRemoveSuccess(true);
      setRemovePending(data.pending || false);
      setSkillId('');
      setRemoveReason('');
      fetchRemovalRequests();
    } catch {
      setRemoveError(translations.error.generic);
    } finally {
      setIsSubmittingRemove(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      signIn('github');
      return;
    }

    if (!repositoryUrl.trim()) {
      return;
    }

    // Client-side validation
    if (!isValidGitHubUrl(repositoryUrl.trim())) {
      setAddError(translations.error.invalidUrl);
      return;
    }

    setIsSubmittingAdd(true);
    setAddError('');
    setAddSuccess(false);

    try {
      const res = await fetchWithCsrf('/api/skills/add-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryUrl: repositoryUrl.trim(),
          reason: addReason.trim() || 'No reason provided',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        switch (data.code) {
          case 'INVALID_URL':
            setAddError(translations.error.invalidUrl);
            break;
          case 'INVALID_REPO':
            setAddError(translations.error.invalidRepo);
            break;
          case 'RATE_LIMIT_EXCEEDED':
            setAddError(translations.error.rateLimitExceeded);
            break;
          case 'NETWORK_TIMEOUT':
            setAddError(translations.error.networkTimeout);
            break;
          case 'ALREADY_PENDING':
            setAddError(translations.error.alreadyPending);
            break;
          case 'REPO_BLOCKED_BY_OWNER':
            setAddError(translations.error.repoBlockedByOwner);
            break;
          case 'AUTH_REQUIRED':
            signIn('github');
            return;
          default:
            console.error('Add form error:', data);
            setAddError(translations.error.generic);
        }
        return;
      }

      setAddSuccess(true);
      setAddReEnabled(data.reEnabled ?? false);
      setAddHasSkillMd(data.hasSkillMd ?? true);
      setAddSkillCount(data.skillCount ?? 0);
      setAddSkillPaths(data.skillPaths ?? []);
      setRepositoryUrl('');
      setAddReason('');
      fetchAddRequests();
    } catch {
      setAddError(translations.error.generic);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleRepoRemovalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      signIn('github');
      return;
    }

    if (!repoUrl.trim()) return;

    setIsSubmittingRepo(true);
    setRepoError('');
    setRepoSuccess(false);

    try {
      const res = await fetchWithCsrf('/api/skills/repo-removal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), reason: repoReason.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        switch (data.code) {
          case 'NOT_OWNER':
            setRepoError(translations.removeRepoError.notOwner);
            break;
          case 'INVALID_REPO':
            setRepoError(translations.removeRepoError.invalidRepo);
            break;
          case 'PARSE_ERROR':
            setRepoError(translations.removeRepoError.parseError);
            break;
          case 'AUTH_REQUIRED':
            signIn('github');
            return;
          default:
            console.error('Repo removal error:', data);
            setRepoError(translations.error.generic);
        }
        return;
      }

      setRepoSuccess(true);
      setRepoBlockedCount(data.blockedCount ?? 0);
      setRepoName(data.repo ?? repoUrl.trim());
      setRepoUrl('');
      setRepoReason('');
    } catch {
      setRepoError(translations.error.generic);
    } finally {
      setIsSubmittingRepo(false);
    }
  };

  const getStatusBadge = (requestStatus: string) => {
    switch (requestStatus) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-warning-bg text-warning">
            <Clock className="w-3 h-3" />
            {translations.myRequests.status.pending}
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-success-bg text-success">
            <CheckCircle className="w-3 h-3" />
            {translations.myRequests.status.approved}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-error-bg text-error">
            <AlertCircle className="w-3 h-3" />
            {translations.myRequests.status.rejected}
          </span>
        );
      case 'indexed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-600">
            <CheckCircle className="w-3 h-3" />
            {translations.myRequests.status.indexed}
          </span>
        );
      default:
        return null;
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Mirror server - redirect to primary
  if (isMirror) {
    return (
      <div className="card p-8 text-center">
        <ExternalLink className="w-12 h-12 mx-auto mb-4 text-text-muted" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">{translations.mirror.title}</h2>
        <p className="text-text-secondary mb-6">{translations.mirror.description}</p>
        <a
          href={`${PRIMARY_URL}/claim`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2"
        >
          <ExternalLink className="w-5 h-5" />
          {translations.mirror.button}
        </a>
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <div className="card p-8 text-center">
        <Github className="w-12 h-12 mx-auto mb-4 text-text-muted" />
        <p className="text-text-secondary mb-6">{translations.loginRequired}</p>
        <button
          onClick={() => signIn('github')}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Github className="w-5 h-5" />
          {translations.signIn}
        </button>
      </div>
    );
  }

  // Remove success state
  if (removeSuccess) {
    return (
      <div className="card p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-success" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {removePending ? translations.success.pendingTitle : translations.success.title}
        </h2>
        <p className="text-text-secondary mb-6">
          {removePending ? translations.success.pendingDescription : translations.success.description}
        </p>
        <button
          onClick={() => { setRemoveSuccess(false); setRemovePending(false); }}
          className="btn-secondary"
        >
          {translations.success.viewRequests}
        </button>
      </div>
    );
  }

  // Repo removal success state
  if (repoSuccess) {
    return (
      <div className="card p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-success" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {translations.removeRepoSuccess.title}
        </h2>
        <p className="text-text-secondary mb-6">
          {repoBlockedCount > 0
            ? translations.removeRepoSuccess.description
                .replace('{count}', String(repoBlockedCount))
                .replace('{repo}', repoName)
            : translations.removeRepoSuccess.descriptionZero}
        </p>
        <button
          onClick={() => { setRepoSuccess(false); setRepoBlockedCount(0); setRepoName(''); }}
          className="btn-secondary"
        >
          {translations.success.viewRequests}
        </button>
      </div>
    );
  }

  // Add success state
  if (addSuccess) {
    // Determine which message to show
    let successTitle = translations.addSuccess.title;
    let successDescription: string | React.ReactNode;
    if (addReEnabled) {
      successTitle = translations.addSuccess.reEnabledTitle;
      successDescription = translations.addSuccess.reEnabledDescription;
    } else if (addSkillCount > 1) {
      successDescription = (
        <>
          {translations.addSuccess.descriptionMultiplePrefix}
          {addSkillCount}
          {translations.addSuccess.descriptionMultipleSuffix}
        </>
      );
    } else if (addHasSkillMd) {
      successDescription = translations.addSuccess.description;
    } else {
      successDescription = translations.addSuccess.descriptionNoSkillMd;
    }

    return (
      <div className="card p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-success" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {successTitle}
        </h2>
        <p className="text-text-secondary mb-4">
          {successDescription}
        </p>
        {addSkillCount > 1 && addSkillPaths.length > 0 && (
          <div className="mb-6 text-start max-w-md mx-auto">
            <p className="text-sm text-text-muted mb-2" dir="ltr">{translations.addSuccess.foundSkillsIn}</p>
            <ul className="text-sm text-text-secondary space-y-1 bg-surface-subtle rounded-lg p-3 max-h-40 overflow-y-auto" dir="ltr">
              {addSkillPaths.slice(0, 10).map((path, index) => (
                <li key={index} className="font-mono truncate">
                  {path === '' ? translations.addSuccess.root : path}
                </li>
              ))}
              {addSkillPaths.length > 10 && (
                <li className="text-text-muted">{translations.addSuccess.andMore.replace('{count}', String(addSkillPaths.length - 10))}</li>
              )}
            </ul>
          </div>
        )}
        <button
          onClick={() => { setAddSuccess(false); setAddReEnabled(false); }}
          className="btn-secondary"
        >
          {translations.addSuccess.viewRequests}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => handleTabChange('remove')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'remove'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Minus className="w-4 h-4" />
          {translations.tabs.remove}
        </button>
        <button
          onClick={() => handleTabChange('add')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'add'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Plus className="w-4 h-4" />
          {translations.tabs.add}
        </button>
        <button
          onClick={() => handleTabChange('remove-repo')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'remove-repo'
              ? 'border-error text-error'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          {translations.tabs.removeRepo}
        </button>
      </div>

      {/* Remove Form */}
      {activeTab === 'remove' && (
        <>
          <div className="card p-6">
            <form onSubmit={handleRemoveSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="skillId"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  {translations.form.skillId}
                </label>
                <input
                  type="text"
                  id="skillId"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  placeholder={translations.form.skillIdPlaceholder}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
                  dir="ltr"
                  required
                />
                <p className="text-xs text-text-muted mt-1">
                  {translations.form.skillIdHelp}
                </p>
              </div>

              <div>
                <label
                  htmlFor="removeReason"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  {translations.form.reason} <span className="text-text-muted">{translations.optional}</span>
                </label>
                <textarea
                  id="removeReason"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder={translations.form.reasonPlaceholder}
                  rows={4}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {removeError && (
                <div className="p-3 bg-error-bg border border-error/30 rounded-lg">
                  <div className="flex items-center gap-2 text-error">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm">{removeError}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingRemove || !skillId.trim()}
                className="btn-primary w-full justify-center disabled:opacity-50"
              >
                {isSubmittingRemove ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {translations.form.submitting}
                  </>
                ) : (
                  translations.form.submit
                )}
              </button>
            </form>
          </div>

          {/* Removal Requests */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              {translations.myRequests.title}
            </h2>

            {loadingRemovalRequests ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
              </div>
            ) : removalRequests.length === 0 ? (
              <p className="text-text-muted text-center py-8">
                {translations.myRequests.empty}
              </p>
            ) : (
              <div className="space-y-3">
                {removalRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 bg-surface-subtle rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <code className="text-sm font-mono text-text-primary break-all" dir="ltr">
                          {request.skillId}
                        </code>
                        <p className="text-sm text-text-secondary mt-1 line-clamp-2" dir="auto">
                          {request.reason}
                        </p>
                        <p className="text-xs text-text-muted mt-1" dir="ltr">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(request.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Remove Repository Form */}
      {activeTab === 'remove-repo' && (
        <div className="card p-6">
          <form onSubmit={handleRepoRemovalSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="repoUrl"
                className="block text-sm font-medium text-text-primary mb-2"
              >
                {translations.removeRepoForm.repoUrl}
              </label>
              <input
                type="text"
                id="repoUrl"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder={translations.removeRepoForm.repoUrlPlaceholder}
                className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-error"
                dir="ltr"
                required
              />
              <p className="text-xs text-text-muted mt-1">
                {translations.removeRepoForm.repoUrlHelp}
              </p>
            </div>

            <div>
              <label
                htmlFor="repoReason"
                className="block text-sm font-medium text-text-primary mb-2"
              >
                {translations.removeRepoForm.reason} <span className="text-text-muted">{translations.optional}</span>
              </label>
              <textarea
                id="repoReason"
                value={repoReason}
                onChange={(e) => setRepoReason(e.target.value)}
                placeholder={translations.removeRepoForm.reasonPlaceholder}
                rows={3}
                className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            {repoError && (
              <div className="p-3 bg-error-bg border border-error/30 rounded-lg">
                <div className="flex items-center gap-2 text-error">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm">{repoError}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingRepo || !repoUrl.trim()}
              className="w-full justify-center inline-flex items-center gap-2 px-4 py-2 bg-error text-white rounded-lg font-medium hover:bg-error/90 transition-colors disabled:opacity-50"
            >
              {isSubmittingRepo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {translations.removeRepoForm.submitting}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  {translations.removeRepoForm.submit}
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Add Form */}
      {activeTab === 'add' && (
        <>
          <div className="card p-6">
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="repositoryUrl"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  {translations.addForm.repositoryUrl}
                </label>
                <input
                  type="url"
                  id="repositoryUrl"
                  value={repositoryUrl}
                  onChange={(e) => {
                    setRepositoryUrl(e.target.value);
                    // Clear error when user types
                    if (repositoryUrlError) {
                      setRepositoryUrlError('');
                    }
                  }}
                  onBlur={(e) => {
                    const url = e.target.value.trim();
                    if (url && !isValidGitHubUrl(url)) {
                      setRepositoryUrlError(translations.error.invalidUrl);
                    }
                  }}
                  placeholder={translations.addForm.repositoryUrlPlaceholder}
                  className={`w-full px-4 py-2 border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 ${
                    repositoryUrlError ? 'border-error focus:ring-error' : 'border-border focus:ring-primary-500'
                  }`}
                  dir="ltr"
                  required
                />
                {repositoryUrlError && (
                  <p className="text-xs text-error mt-1">{repositoryUrlError}</p>
                )}
                {!repositoryUrlError && (
                  <p className="text-xs text-text-muted mt-1">
                    {translations.addForm.repositoryUrlHelp}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="addReason"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  {translations.addForm.reason} <span className="text-text-muted">{translations.optional}</span>
                </label>
                <textarea
                  id="addReason"
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder={translations.addForm.reasonPlaceholder}
                  rows={4}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {addError && (
                <div className="p-3 bg-error-bg border border-error/30 rounded-lg">
                  <div className="flex items-center gap-2 text-error">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm">{addError}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingAdd || !repositoryUrl.trim()}
                className="btn-primary w-full justify-center disabled:opacity-50"
              >
                {isSubmittingAdd ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {translations.addForm.submitting}
                  </>
                ) : (
                  translations.addForm.submit
                )}
              </button>
            </form>
          </div>

          {/* Add Requests */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              {translations.myRequests.title}
            </h2>

            {loadingAddRequests ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
              </div>
            ) : addRequests.length === 0 ? (
              <p className="text-text-muted text-center py-8">
                {translations.myRequests.empty}
              </p>
            ) : (
              <div className="space-y-3">
                {addRequests.map((request) => {
                  // Parse skillPath - could be comma-separated list of paths
                  const skillPaths = request.skillPath?.split(',').map(p => p.trim()).filter(Boolean) || [];
                  const hasMultiplePaths = skillPaths.length > 3;
                  const isExpanded = expandedRequests.has(request.id);
                  const displayPaths = isExpanded ? skillPaths : skillPaths.slice(0, 3);

                  return (
                    <div
                      key={request.id}
                      className="p-4 bg-surface-subtle rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono text-text-primary break-all" dir="ltr">
                            {request.repositoryUrl}
                          </code>
                          {skillPaths.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-text-muted mb-1">
                                {translations.myRequests.skillsFoundPrefix}{skillPaths.length}{translations.myRequests.skillsFoundSuffix}
                              </div>
                              <div className="bg-surface rounded p-2 max-h-32 overflow-y-auto" dir="ltr">
                                <ul className="text-xs font-mono text-text-secondary space-y-0.5">
                                  {displayPaths.map((path, idx) => (
                                    <li key={idx} className="truncate">
                                      {path || '(root)'}
                                    </li>
                                  ))}
                                </ul>
                                {hasMultiplePaths && (
                                  <button
                                    onClick={() => toggleExpanded(request.id)}
                                    className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 mt-1"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-3 h-3" />
                                        {translations.myRequests.showLess}
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3 h-3" />
                                        {translations.myRequests.showAllPrefix}{skillPaths.length}{translations.myRequests.showAllSuffix}
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          <p className="text-sm text-text-secondary mt-2 line-clamp-2" dir="auto">
                            {request.reason}
                          </p>
                          {request.errorMessage && (
                            <p className="text-xs text-error mt-1" dir="ltr">
                              {request.errorMessage}
                            </p>
                          )}
                          <p className="text-xs text-text-muted mt-1" dir="ltr">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {getStatusBadge(request.status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
