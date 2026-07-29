/**
 * Upstream watcher — the near-real-time half of the content sync.
 *
 * Every 5 minutes: compare the upstream repo's HEAD commit against the SHA recorded by the last
 * successful sync (`data/upstream.json` on the `data` branch). If they differ, dispatch the
 * "Sync content" workflow, which does the actual parse / publish / deploy.
 *
 * Why a standalone Worker rather than a Pages Function or a GitHub Actions cron:
 *   - Pages Functions cannot have cron triggers; they only run on HTTP requests.
 *   - GitHub disables scheduled workflows in public repos after 60 days of repository inactivity,
 *     which is exactly the steady state this project is heading for. A trigger that lives outside
 *     GitHub isn't subject to that rule.
 *
 * The upstream HEAD is read from the public commits Atom feed rather than the GitHub API so that
 * the PAT never needs any access to the upstream repo — and so this path has no API rate limit.
 */

const ATOM_COMMIT_SHA = /Grit::Commit\/([0-9a-f]{40})/;

export default {
  async scheduled(event, env) {
    const upstreamSha = await fetchUpstreamHeadSha(env);
    const syncedSha = await fetchLastSyncedSha(env);

    if (syncedSha === upstreamSha) {
      console.log(`[watch] up to date at ${short(upstreamSha)} — nothing to do.`);
      return;
    }

    console.log(
      `[watch] upstream moved ${syncedSha ? short(syncedSha) : "(never synced)"} -> ${short(upstreamSha)} — dispatching ${env.WORKFLOW_FILE}.`,
    );
    await dispatchWorkflow(env, upstreamSha);
    console.log("[watch] dispatched.");
  },
};

/** Latest commit SHA on the upstream branch, via the public Atom feed (no auth, no rate limit). */
async function fetchUpstreamHeadSha(env) {
  const url = `https://github.com/${env.UPSTREAM_REPO}/commits/${env.UPSTREAM_BRANCH}.atom`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/atom+xml", "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  // The feed lists newest first, so the first entry id carries the branch head:
  //   <id>tag:github.com,2008:Grit::Commit/075bed73…</id>
  const match = ATOM_COMMIT_SHA.exec(await res.text());
  if (!match) {
    throw new Error(`No commit SHA found in the Atom feed at ${url} — did its format change?`);
  }
  return match[1];
}

/**
 * SHA recorded by the last successful sync, or null if the sync has never run (no `data` branch or
 * no `data/upstream.json` yet) — in which case the caller should treat it as "changed" and sync.
 */
async function fetchLastSyncedSha(env) {
  const url = `https://api.github.com/repos/${env.SITE_REPO}/contents/data/upstream.json?ref=${env.DATA_BRANCH}`;
  const res = await fetch(url, { headers: { ...ghHeaders(env), Accept: "application/vnd.github.raw" } });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read data/upstream.json: ${res.status} ${res.statusText}`);
  }

  const { sha } = await res.json();
  return typeof sha === "string" && sha ? sha : null;
}

async function dispatchWorkflow(env, upstreamSha) {
  const url = `https://api.github.com/repos/${env.SITE_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    // `sha` is informational only — it labels the run in the Actions UI. The workflow resolves the
    // upstream head itself, so a commit landing between this dispatch and the run is picked up too.
    body: JSON.stringify({ ref: env.SITE_BRANCH, inputs: { sha: upstreamSha } }),
  });
  if (res.status !== 204) {
    throw new Error(`workflow_dispatch failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
}

const UA = "indie-star-upstream-watch";

function ghHeaders(env) {
  return {
    "User-Agent": UA,
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function short(sha) {
  return sha.slice(0, 7);
}
