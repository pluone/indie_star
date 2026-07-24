// Shared by scripts/sync-content.mjs (daily) and scripts/sync-giscus-stats.mjs (30-min).
// Queries GitHub Discussions on the giscus-backed repo and returns live like/comment counts
// keyed by the slug embedded in each discussion's pathname-mapped title (/project/{slug}).

const GISCUS_REPO_OWNER = "pluone";
const GISCUS_REPO_NAME = "indie_star";
const GISCUS_CATEGORY_ID = "DIC_kwDOThOK5s4DBzP3";
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const SLUG_TITLE_RE = /^\/project\/([0-9a-f]{12})$/;
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety cap, ~20k discussions

const QUERY = `
  query ($owner: String!, $name: String!, $categoryId: ID, $cursor: String) {
    repository(owner: $owner, name: $name) {
      discussions(first: ${PAGE_SIZE}, after: $cursor, categoryId: $categoryId) {
        pageInfo { hasNextPage endCursor }
        nodes {
          title
          comments { totalCount }
          reactionGroups { content, users { totalCount } }
        }
      }
    }
  }
`;

/**
 * @returns {Promise<Map<string, {likes: number, comments: number}>>}
 */
export async function fetchGiscusCounts() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const counts = new Map();

  if (!token) {
    console.warn(
      "[fetch-giscus-counts] No GITHUB_TOKEN/GH_TOKEN in env — skipping live counts fetch, all likes/comments will default to 0.",
    );
    return counts;
  }

  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          owner: GISCUS_REPO_OWNER,
          name: GISCUS_REPO_NAME,
          categoryId: GISCUS_CATEGORY_ID,
          cursor,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`[fetch-giscus-counts] GraphQL request failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`[fetch-giscus-counts] GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const discussions = json.data?.repository?.discussions;
    if (!discussions) break;

    for (const node of discussions.nodes) {
      const match = SLUG_TITLE_RE.exec(node.title || "");
      if (!match) continue; // not one of our project discussions (or malformed title)

      const slug = match[1];
      const likesGroup = (node.reactionGroups || []).find((g) => g.content === "THUMBS_UP");
      const likes = likesGroup?.users?.totalCount ?? 0;
      const comments = node.comments?.totalCount ?? 0;
      counts.set(slug, { likes, comments });
    }

    if (!discussions.pageInfo.hasNextPage) break;
    cursor = discussions.pageInfo.endCursor;
  }

  return counts;
}
