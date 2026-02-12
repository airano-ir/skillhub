#!/usr/bin/env node

/**
 * CLI script to manually trigger a crawl job or sync operations
 */

import { INSTRUCTION_FILE_PATTERNS, type SourceFormat } from 'skillhub-core';
import { scheduleFullCrawl, scheduleIncrementalCrawl, getQueueStats, getQueue } from './queue.js';
import { syncAllSkillsToMeilisearch, checkMeilisearchHealth } from './meilisearch-sync.js';
import { createDb, skillQueries, categoryQueries, discoveredRepoQueries, awesomeListQueries, addRequestQueries, userQueries, sql } from '@skillhub/db';
import { createStrategyOrchestrator, createDeepScanCrawler, createAwesomeListCrawler } from './strategies/index.js';
import { createCrawler } from './crawler.js';
import { indexSkill } from './skill-indexer.js';
import { TokenManager } from './token-manager.js';

const command = process.argv[2] || 'stats';

async function main() {
  switch (command) {
    case 'full': {
      console.log('Scheduling full crawl...');
      const fullJobId = await scheduleFullCrawl({
        minStars: parseInt(process.env.INDEXER_MIN_STARS || process.env.MIN_STARS || '0'),
      });
      console.log(`Full crawl scheduled with job ID: ${fullJobId}`);
      break;
    }

    case 'incremental': {
      console.log('Scheduling incremental crawl...');
      const incJobId = await scheduleIncrementalCrawl();
      console.log(`Incremental crawl scheduled with job ID: ${incJobId}`);
      break;
    }

    case 'sync-meili': {
      console.log('Syncing all skills to Meilisearch (streaming mode)...\n');

      // Check Meilisearch connection
      const healthy = await checkMeilisearchHealth();
      if (!healthy) {
        console.error('Meilisearch is not reachable. Please check MEILI_URL and MEILI_MASTER_KEY');
        process.exit(1);
      }

      // Stream skills from database to Meilisearch in batches
      // This approach is memory-efficient and scales to any number of skills
      const db = createDb(process.env.DATABASE_URL);
      const SYNC_BATCH_SIZE = 5000;
      let syncOffset = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      let batchNumber = 0;

      // First, get total count for progress display
      const totalCount = await skillQueries.count(db, {});
      console.log(`Total skills in database: ${totalCount}`);

      if (totalCount === 0) {
        console.log('No skills found in database');
        process.exit(0);
      }

      const totalBatches = Math.ceil(totalCount / SYNC_BATCH_SIZE);
      console.log(`Will process in ${totalBatches} batches of ${SYNC_BATCH_SIZE}\n`);

      for (;;) {
        // Fetch batch from database
        const batch = await skillQueries.search(db, { limit: SYNC_BATCH_SIZE, offset: syncOffset });
        if (batch.length === 0) break;

        batchNumber++;

        // Immediately sync this batch to Meilisearch (no memory accumulation)
        const results = await syncAllSkillsToMeilisearch(batch);
        totalSuccess += results.success;
        totalFailed += results.failed;

        const progress = Math.min(100, Math.round((syncOffset + batch.length) / totalCount * 100));
        console.log(`Batch ${batchNumber}/${totalBatches}: ${results.success} synced, ${results.failed} failed (${progress}% complete)`);

        if (batch.length < SYNC_BATCH_SIZE) break;
        syncOffset += SYNC_BATCH_SIZE;
      }

      console.log(`\n════════════════════════════════════════`);
      console.log(`Sync complete:`);
      console.log(`  Total processed: ${totalSuccess + totalFailed}`);
      console.log(`  Success: ${totalSuccess}`);
      console.log(`  Failed: ${totalFailed}`);
      break;
    }

    case 'stats': {
      const q = getQueue();
      console.log('Queue statistics:');
      const stats = await getQueueStats();
      console.log(`  Waiting: ${stats.waiting}`);
      console.log(`  Active: ${stats.active}`);
      console.log(`  Completed: ${stats.completed}`);
      console.log(`  Failed: ${stats.failed}`);
      console.log(`  Delayed: ${stats.delayed}`);

      // Show failed job details if any
      if (stats.failed > 0) {
        const failedJobs = await q.getFailed(0, 10);
        if (failedJobs.length > 0) {
          console.log('\nFailed jobs:');
          for (const job of failedJobs) {
            const failedAt = job.finishedOn ? new Date(job.finishedOn).toISOString() : 'unknown';
            console.log(`  - [${job.data.type}] ${job.name} (${failedAt})`);
            if (job.failedReason) {
              console.log(`    Reason: ${job.failedReason.slice(0, 120)}`);
            }
          }
        }
      }
      break;
    }

    case 'token-status': {
      console.log('\n═══ GitHub Token Status ═══');
      const tokenManager = TokenManager.getInstance();

      // Refresh all tokens from GitHub API first
      console.log('Fetching latest status from GitHub API...\n');
      const tokenStatus = tokenManager.getStatus();
      for (const tokenInfo of tokenStatus.tokens) {
        await tokenManager.refreshRateLimit(tokenInfo.token);
      }

      // Get updated status
      const updatedStatus = tokenManager.getStatus();

      console.log(`\nTotal Tokens: ${updatedStatus.totalTokens}`);
      console.log(`Available Tokens: ${updatedStatus.availableTokens}`);
      console.log(`Global Remaining: ${updatedStatus.globalRemaining}`);
      console.log(`Next Reset: ${new Date(updatedStatus.nextReset).toLocaleTimeString()}`);
      console.log('\nToken Details:');

      for (const token of updatedStatus.tokens) {
        const status = token.isExhausted ? '❌ EXHAUSTED' : '✅ AVAILABLE';
        const resetTime = new Date(token.reset).toLocaleTimeString();
        console.log(`  [${token.name}] ${status}`);
        console.log(`    Remaining: ${token.remaining}/${token.limit}`);
        console.log(`    Resets at: ${resetTime}`);
        console.log(`    Last used: ${token.lastUsed ? new Date(token.lastUsed).toLocaleString() : 'Never'}`);
      }
      break;
    }

    case 'link-categories':
    case 'recategorize': {
      console.log('Re-categorizing all skills with 23 categories (streaming mode)...\n');
      const dbCat = createDb(process.env.DATABASE_URL);

      // First, get total count for progress display
      const linkTotalCount = await skillQueries.count(dbCat, {});
      console.log(`Total skills in database: ${linkTotalCount}`);

      if (linkTotalCount === 0) {
        console.log('No skills found in database');
        process.exit(0);
      }

      // Stream skills from database and link categories in batches
      const LINK_BATCH_SIZE = 1000;
      let linkOffset = 0;
      let linked = 0;
      let failed = 0;
      let batchNum = 0;
      const totalBatches = Math.ceil(linkTotalCount / LINK_BATCH_SIZE);

      console.log(`Will process in ${totalBatches} batches of ${LINK_BATCH_SIZE}\n`);

      for (;;) {
        const batch = await skillQueries.search(dbCat, { limit: LINK_BATCH_SIZE, offset: linkOffset });
        if (batch.length === 0) break;

        batchNum++;

        // Process this batch immediately (no memory accumulation)
        let batchLinked = 0;
        let batchFailed = 0;

        for (const skill of batch) {
          try {
            await categoryQueries.linkSkillToCategories(
              dbCat,
              skill.id,
              skill.name,
              skill.description || ''
            );
            batchLinked++;
          } catch {
            batchFailed++;
          }
        }

        linked += batchLinked;
        failed += batchFailed;

        const progress = Math.min(100, Math.round((linkOffset + batch.length) / linkTotalCount * 100));
        console.log(`Batch ${batchNum}/${totalBatches}: ${batchLinked} linked, ${batchFailed} failed (${progress}% complete)`);

        if (batch.length < LINK_BATCH_SIZE) break;
        linkOffset += LINK_BATCH_SIZE;
      }

      // No need to manually update category counts - database trigger handles this automatically
      // (See init-db.sql lines 356-373: update_category_count trigger)

      console.log(`\n════════════════════════════════════════`);
      console.log(`Linking complete:`);
      console.log(`  Total processed: ${linked + failed}`);
      console.log(`  Linked: ${linked}`);
      console.log(`  Failed: ${failed}`);
      break;
    }

    case 'discover-repos': {
      console.log('Running all discovery strategies...\n');
      const discoverDb = createDb(process.env.DATABASE_URL);
      const orchestrator = createStrategyOrchestrator();

      const { repos: discoveredRepos, stats: discoverStats } = await orchestrator.runAllStrategies();

      console.log(`\nSaving ${discoveredRepos.length} discovered repos to database...`);
      let savedRepos = 0;
      for (const repo of discoveredRepos) {
        try {
          await discoveredRepoQueries.upsert(discoverDb, {
            id: `${repo.owner}/${repo.repo}`,
            owner: repo.owner,
            repo: repo.repo,
            discoveredVia: repo.discoveredVia,
            githubStars: repo.stars,
          });
          savedRepos++;
        } catch {
          // Skip duplicates
        }
      }
      console.log(`Saved ${savedRepos} new repositories`);
      console.log(`\nDiscovery complete in ${(discoverStats.duration / 1000).toFixed(1)}s`);
      break;
    }

    case 'awesome-lists': {
      console.log('Running awesome list discovery...\n');
      const awesomeDb = createDb(process.env.DATABASE_URL);
      const awesomeCrawler = createAwesomeListCrawler();

      // Save known lists to DB
      for (const list of awesomeCrawler.getKnownLists()) {
        await awesomeListQueries.upsert(awesomeDb, {
          id: `${list.owner}/${list.repo}`,
          owner: list.owner,
          repo: list.repo,
          name: `${list.owner}/${list.repo}`,
        });
      }

      const listResults = await awesomeCrawler.crawlAllLists();
      let awesomeTotal = 0;

      for (const [listId, repoRefs] of listResults.entries()) {
        console.log(`\n${listId}: ${repoRefs.length} repos`);

        // Update list stats
        await awesomeListQueries.markParsed(awesomeDb, listId, repoRefs.length);

        // Save repos
        for (const ref of repoRefs) {
          try {
            await discoveredRepoQueries.upsert(awesomeDb, {
              id: `${ref.owner}/${ref.repo}`,
              owner: ref.owner,
              repo: ref.repo,
              discoveredVia: 'awesome-list',
              sourceUrl: `https://github.com/${listId}`,
            });
            awesomeTotal++;
          } catch {
            // Skip duplicates
          }
        }
      }

      console.log(`\nSaved ${awesomeTotal} repositories from awesome lists`);
      break;
    }

    case 'deep-scan': {
      console.log('Deep scanning discovered repositories...\n');
      const deepDb = createDb(process.env.DATABASE_URL);
      const deepCrawler = createDeepScanCrawler();
      const skillCrawler = createCrawler();

      // Get repos that need scanning (never scanned or stale)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const reposToScan = await discoveredRepoQueries.getNeedingScanning(deepDb, oneWeekAgo, 100);

      if (reposToScan.length === 0) {
        console.log('No repositories need scanning');
        break;
      }

      console.log(`Found ${reposToScan.length} repositories to scan`);

      let scannedCount = 0;
      let skillsDiscovered = 0;
      let skillsIndexed = 0;

      for (const repo of reposToScan) {
        try {
          console.log(`\nScanning ${repo.owner}/${repo.repo}...`);
          const skills = await deepCrawler.scanRepository(repo.owner, repo.repo);

          // Mark as scanned
          await discoveredRepoQueries.markScanned(
            deepDb,
            repo.id,
            skills.length,
            skills.length > 0
          );

          scannedCount++;
          skillsDiscovered += skills.length;

          // If skills found, index them to the database
          if (skills.length > 0) {
            console.log(`  Found ${skills.length} skills in ${repo.owner}/${repo.repo}, processing...`);
            let indexed = 0;
            let skipped = 0;
            let failed = 0;

            for (const skillSource of skills) {
              try {
                const skillId = await indexSkill(
                  skillCrawler,
                  skillSource,
                  false // don't force update if content unchanged
                );

                if (skillId) {
                  indexed++;
                  console.log(`    ✓ Indexed: ${skillSource.path}`);
                } else {
                  skipped++;
                  console.log(`    → Skipped: ${skillSource.path} (unchanged or invalid)`);
                }
              } catch (error) {
                failed++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`    ✗ Failed: ${skillSource.path} - ${errorMsg}`);
              }
            }

            skillsIndexed += indexed;
            console.log(`  Summary: ${indexed} indexed, ${skipped} skipped, ${failed} failed`);
          }
        } catch (error) {
          console.log(`  Error scanning: ${error}`);
          await discoveredRepoQueries.markScanned(deepDb, repo.id, 0, false, String(error));
        }
      }

      console.log(`\nDeep scan complete:`);
      console.log(`  Repositories scanned: ${scannedCount}`);
      console.log(`  Skills discovered: ${skillsDiscovered}`);
      console.log(`  Skills indexed: ${skillsIndexed}`);
      break;
    }

    case 'multi-platform': {
      console.log('Searching for multi-platform instruction files...\n');
      const mpCrawler = createCrawler();

      // Parse options
      const mpMaxPagesArg = process.argv.find(a => a.startsWith('--max-pages='));
      const mpMaxPages = mpMaxPagesArg ? parseInt(mpMaxPagesArg.split('=')[1]) : 10;
      const mpBudgetArg = process.argv.find(a => a.startsWith('--budget='));
      const mpBudgetPct = mpBudgetArg ? parseInt(mpBudgetArg.split('=')[1]) / 100 : 0.33;

      // Only search for non-SKILL.md formats
      const nonSkillPatterns = INSTRUCTION_FILE_PATTERNS.filter(p => p.format !== 'skill.md');
      console.log(`Searching for ${nonSkillPatterns.length} formats: ${nonSkillPatterns.map(p => p.filename).join(', ')}`);
      console.log(`Options: max-pages=${mpMaxPages}, budget=${Math.round(mpBudgetPct * 100)}% reserve\n`);

      // Check initial budget
      const initialBudget = await mpCrawler.checkBudget(mpBudgetPct);
      console.log(`API Budget: ${initialBudget.remaining}/${initialBudget.limit} remaining (reserve ${Math.round(mpBudgetPct * 100)}%)\n`);

      const mpResults: Record<string, { discovered: number; indexed: number; failed: number; skipped: number }> = {};
      for (const pattern of nonSkillPatterns) {
        mpResults[pattern.format] = { discovered: 0, indexed: 0, failed: 0, skipped: 0 };
      }

      // Search for each format with budget awareness
      for (const pattern of nonSkillPatterns) {
        // Check budget before each format
        const budget = await mpCrawler.checkBudget(mpBudgetPct);
        if (!budget.ok) {
          console.log(`\n⚠️ API budget low (${budget.remaining}/${budget.limit}). Waiting for reset...`);
          await mpCrawler.waitForBudget(mpBudgetPct);
        }

        console.log(`\n═══ Searching for ${pattern.filename} ═══`);

        try {
          const sources = await mpCrawler.searchGitHubForSkillsByFormat(
            pattern.format as SourceFormat,
            { maxPages: mpMaxPages }
          );
          mpResults[pattern.format].discovered = sources.length;
          console.log(`Found ${sources.length} ${pattern.filename} files\n`);

          // Index each discovered file (sequentially to respect API budget)
          for (const source of sources) {
            // Check budget periodically (every 20 skills)
            const formatStats = mpResults[pattern.format];
            const processed = formatStats.indexed + formatStats.skipped + formatStats.failed;
            if (processed > 0 && processed % 20 === 0) {
              const midBudget = await mpCrawler.checkBudget(mpBudgetPct);
              if (!midBudget.ok) {
                console.log(`  ⚠️ Budget low mid-indexing (${midBudget.remaining}/${midBudget.limit}). Pausing...`);
                await mpCrawler.waitForBudget(mpBudgetPct);
              }
            }

            try {
              const skillId = await indexSkill(mpCrawler, source, false);
              if (skillId) {
                mpResults[pattern.format].indexed++;
              } else {
                mpResults[pattern.format].skipped++;
              }
            } catch {
              mpResults[pattern.format].failed++;
            }
          }
        } catch (error) {
          console.error(`Error searching for ${pattern.filename}:`, error);
        }
      }

      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('Multi-Platform Crawl Results');
      console.log('='.repeat(60));
      let totalDiscovered = 0;
      let totalIndexed = 0;
      for (const [format, stats] of Object.entries(mpResults)) {
        console.log(`  ${format}: ${stats.discovered} discovered, ${stats.indexed} indexed, ${stats.skipped} skipped, ${stats.failed} failed`);
        totalDiscovered += stats.discovered;
        totalIndexed += stats.indexed;
      }
      console.log(`  Total: ${totalDiscovered} discovered, ${totalIndexed} indexed`);

      // Show final API status
      const finalBudget = await mpCrawler.checkBudget(mpBudgetPct);
      console.log(`\n  API remaining: ${finalBudget.remaining}/${finalBudget.limit}`);
      console.log('='.repeat(60));
      break;
    }

    case 'discovery-stats': {
      console.log('Discovery statistics:\n');
      const statsDb = createDb(process.env.DATABASE_URL);
      const repoStats = await discoveredRepoQueries.getStats(statsDb);
      const awesomeLists = await awesomeListQueries.getAll(statsDb);

      console.log('Discovered Repositories:');
      console.log(`  Total: ${repoStats.total}`);
      console.log(`  Scanned: ${repoStats.scanned}`);
      console.log(`  With skills: ${repoStats.withSkills}`);
      console.log('\nBy Discovery Source:');
      for (const source of repoStats.bySource) {
        console.log(`  ${source.source}: ${source.count} repos (${source.withSkills} with skills)`);
      }

      if (awesomeLists.length > 0) {
        console.log('\nAwesome Lists:');
        for (const list of awesomeLists) {
          const status = list.isActive ? 'active' : 'inactive';
          console.log(`  ${list.id}: ${list.repoCount} repos (${status})`);
        }
      }
      break;
    }

    case 'full-enhanced': {
      console.log('Running full enhanced crawl (discovery + scan + index)...\n');
      const enhancedDb = createDb(process.env.DATABASE_URL);

      // Step 1: Run all discovery strategies
      console.log('Step 1: Running discovery strategies...');
      const enhancedOrchestrator = createStrategyOrchestrator();
      const { repos: allDiscovered } = await enhancedOrchestrator.runAllStrategies();

      console.log(`\nSaving ${allDiscovered.length} discovered repos...`);
      for (const repo of allDiscovered) {
        try {
          await discoveredRepoQueries.upsert(enhancedDb, {
            id: `${repo.owner}/${repo.repo}`,
            owner: repo.owner,
            repo: repo.repo,
            discoveredVia: repo.discoveredVia,
            githubStars: repo.stars,
          });
        } catch {
          // Skip
        }
      }

      // Step 2: Schedule full crawl (uses existing crawler with code search)
      console.log('\nStep 2: Scheduling full crawl...');
      const enhancedJobId = await scheduleFullCrawl({
        minStars: parseInt(process.env.INDEXER_MIN_STARS || '0'),
      });
      console.log(`Full crawl scheduled with job ID: ${enhancedJobId}`);

      console.log('\nFull enhanced crawl initiated. Monitor with: pnpm crawl stats');
      break;
    }

    case 'process-add-requests': {
      console.log('Processing pending add requests...\n');
      const addDb = createDb(process.env.DATABASE_URL);
      const addCrawler = createCrawler();

      // Check queue status first
      const queueStats = await getQueueStats();
      if (queueStats.active > 0) {
        console.log(`⚠️  Warning: ${queueStats.active} active jobs in queue`);
        console.log('   Processing add requests may be slower due to concurrent operations.\n');
      }

      // Check GitHub rate limit
      try {
        const rateLimitInfo = await addCrawler.getRateLimitStatus();
        console.log(`GitHub API: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} requests remaining`);
        if (rateLimitInfo.remaining < 100) {
          const resetTime = new Date(rateLimitInfo.resetAt);
          console.log(`⚠️  Warning: Low API quota. Resets at ${resetTime.toLocaleTimeString()}`);
          if (rateLimitInfo.remaining < 10) {
            console.log('❌ Aborting: Not enough API quota. Try again after reset.');
            break;
          }
        }
        console.log('');
      } catch {
        console.log('⚠️  Could not check GitHub rate limit. Proceeding anyway...\n');
      }

      // Get all pending add requests
      const pendingRequests = await addRequestQueries.getAllPending(addDb);

      if (pendingRequests.length === 0) {
        console.log('✓ No pending add requests found');
        break;
      }

      console.log(`Found ${pendingRequests.length} pending request(s)\n`);

      let processedCount = 0;
      let skillsIndexed = 0;
      let skillsAlreadyIndexed = 0;
      let skillsSkipped = 0;
      let failedCount = 0;
      let rateLimitHit = false;

      for (const request of pendingRequests) {
        // Stop if we hit rate limit
        if (rateLimitHit) {
          console.log(`⏳ Rate limit hit. Remaining requests will be processed later.`);
          break;
        }

        console.log(`Processing request ${request.id.slice(0, 8)}...`);
        console.log(`  Repository: ${request.repositoryUrl}`);
        console.log(`  Skill paths: ${request.skillPath || 'auto-detect'}`);

        // Skip if no skill paths found
        if (!request.hasSkillMd || !request.skillPath) {
          console.log('  → No SKILL.md paths found, marking for manual review');
          await addRequestQueries.updateStatus(addDb, request.id, {
            status: 'approved',
            errorMessage: 'No SKILL.md found - requires manual review',
          });
          continue;
        }

        try {
          // Parse repository URL
          const url = new URL(request.repositoryUrl);
          const pathParts = url.pathname.split('/').filter(Boolean);
          const owner = pathParts[0];
          const repo = pathParts[1];

          if (!owner || !repo) {
            throw new Error('Invalid repository URL');
          }

          // Get default branch
          const repoMeta = await addCrawler.getRepoMetadata(owner, repo);
          const branch = repoMeta.defaultBranch;

          // Parse skill paths (comma-separated)
          const skillPaths = request.skillPath.split(',').map((p: string) => p.trim());
          const indexedSkillIds: string[] = [];
          const existingSkillIds: string[] = [];

          for (const skillPath of skillPaths) {
            try {
              // Check if skill already exists before indexing
              const skillName = skillPath.split('/').pop() || 'skill';
              const potentialSkillId = `${owner}/${repo}/${skillName}`;
              const existingSkill = await skillQueries.getById(addDb, potentialSkillId);

              if (existingSkill && !existingSkill.isBlocked) {
                // Skill already indexed
                existingSkillIds.push(potentialSkillId);
                skillsAlreadyIndexed++;
                console.log(`    ${skillPath || 'root'}: Already indexed ✓`);
                continue;
              }

              // If skill is blocked, check if requester is the owner
              if (existingSkill && existingSkill.isBlocked) {
                // Get requester's GitHub username
                const requester = await userQueries.getById(addDb, request.userId);
                const requesterUsername = requester?.username?.toLowerCase();
                const repoOwner = owner.toLowerCase();

                if (requesterUsername && requesterUsername === repoOwner) {
                  // Owner is re-adding their skill, unblock it
                  console.log(`    ${skillPath || 'root'}: Unblocking (owner re-add request)...`);
                  await skillQueries.unblock(addDb, potentialSkillId);
                  existingSkillIds.push(potentialSkillId);
                  skillsAlreadyIndexed++;
                  console.log(`    → Unblocked: ${potentialSkillId}`);
                  continue;
                } else {
                  // Not the owner, skip blocked skill
                  console.log(`    ${skillPath || 'root'}: Blocked by owner, skipping`);
                  skillsSkipped++;
                  continue;
                }
              }

              console.log(`    ${skillPath || 'root'}: Indexing...`);
              const skillId = await indexSkill(
                addCrawler,
                {
                  owner,
                  repo,
                  path: skillPath || '.',
                  branch,
                },
                true // force update
              );

              if (skillId) {
                indexedSkillIds.push(skillId);
                skillsIndexed++;
                console.log(`    → Indexed: ${skillId}`);
              } else {
                skillsSkipped++;
                console.log(`    → Skipped (invalid skill)`);
              }
            } catch (skillError: unknown) {
              // Check for rate limit error
              const errorMessage = skillError instanceof Error ? skillError.message : String(skillError);
              if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
                rateLimitHit = true;
                console.log(`    → Rate limit hit, will retry later`);
                break;
              }
              console.error(`    → Failed: ${errorMessage}`);
              skillsSkipped++;
            }
          }

          // Combine all skill IDs (new + existing)
          const allSkillIds = [...indexedSkillIds, ...existingSkillIds];

          // Update request status
          if (allSkillIds.length > 0) {
            await addRequestQueries.updateStatus(addDb, request.id, {
              status: 'indexed',
              indexedSkillId: allSkillIds.join(','),
            });
            const newCount = indexedSkillIds.length;
            const existingCount = existingSkillIds.length;
            if (newCount > 0 && existingCount > 0) {
              console.log(`  ✓ Indexed ${newCount} new + ${existingCount} already existed`);
            } else if (newCount > 0) {
              console.log(`  ✓ Indexed ${newCount} skill(s)`);
            } else {
              console.log(`  ✓ All ${existingCount} skill(s) were already indexed`);
            }
          } else if (rateLimitHit) {
            // Leave as pending if we hit rate limit
            console.log(`  ⏳ Left as pending (rate limit)`);
          } else {
            await addRequestQueries.updateStatus(addDb, request.id, {
              status: 'rejected',
              errorMessage: 'No valid skills could be indexed',
            });
            console.log(`  ✗ Rejected (no valid skills)`);
          }

          processedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Check for rate limit error
          if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
            rateLimitHit = true;
            console.log(`  ⏳ Rate limit hit, will retry later`);
            continue;
          }

          console.error(`  ✗ Error: ${errorMessage}`);
          failedCount++;

          await addRequestQueries.updateStatus(addDb, request.id, {
            status: 'rejected',
            errorMessage,
          });
        }
        console.log(''); // Empty line between requests
      }

      console.log(`═══════════════════════════════════════`);
      console.log(`Processing Summary:`);
      console.log(`  Requests processed: ${processedCount}`);
      console.log(`  Skills newly indexed: ${skillsIndexed}`);
      console.log(`  Skills already indexed: ${skillsAlreadyIndexed}`);
      console.log(`  Skills skipped/invalid: ${skillsSkipped}`);
      console.log(`  Requests failed: ${failedCount}`);
      if (rateLimitHit) {
        console.log(`\n⚠️  Rate limit reached. Some requests were left pending.`);
        console.log(`   Run 'process-add-requests' again after GitHub rate limit resets.`);
      }
      break;
    }


    default:
      console.log('Usage: pnpm crawl <command>\n');
      console.log('Basic Commands:');
      console.log('  full              - Schedule a full crawl of all skills');
      console.log('  incremental       - Schedule an incremental crawl (last 24h)');
      console.log('  stats             - Show queue statistics\n');
      console.log('Enhanced Discovery:');
      console.log('  full-enhanced     - Full crawl with all discovery strategies');
      console.log('  discover-repos    - Run all discovery strategies (awesome lists, topics, forks)');
      console.log('  awesome-lists     - Crawl awesome lists for repo discovery');
      console.log('  deep-scan         - Deep scan discovered repos for SKILL.md files');
      console.log('  multi-platform    - Search for non-SKILL.md formats (--max-pages=N --budget=N)');
      console.log('  discovery-stats   - Show discovery statistics\n');
      console.log('Maintenance:');
      console.log('  sync-meili             - Sync all skills from database to Meilisearch');
      console.log('  recategorize           - Re-categorize all skills with 23 categories (alias: link-categories)');
      console.log('  process-add-requests   - Process pending add requests (auto-index skills)');
      process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
