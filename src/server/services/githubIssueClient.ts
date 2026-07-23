/**
 * Pass C Task 2: optionally turns a feedback submission into a real GitHub
 * Issue. Opt-in via `.env` (`GITHUB_ISSUES_REPO` + `GITHUB_TOKEN`, see
 * `.env.sample`) — unset by default, so a public visitor's feedback never
 * files an issue against a repo the operator hasn't explicitly wired up.
 * Best-effort: a failure here is logged but never blocks the feedback
 * submission itself (feedbackStore.ts persists the feedback regardless).
 */
const GITHUB_ISSUES_REPO = process.env.GITHUB_ISSUES_REPO
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

export function isGithubIssuesConfigured(): boolean {
  return Boolean(GITHUB_ISSUES_REPO && GITHUB_TOKEN)
}

export async function createFeedbackIssue(title: string, body: string): Promise<string | null> {
  if (!GITHUB_ISSUES_REPO || !GITHUB_TOKEN) return null

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_ISSUES_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body }),
    })
    if (!res.ok) {
      console.error(`githubIssueClient: create issue failed with HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { html_url?: string }
    return data.html_url ?? null
  } catch (err) {
    console.error('githubIssueClient: create issue failed', err)
    return null
  }
}
