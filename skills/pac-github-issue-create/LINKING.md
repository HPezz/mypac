# Linking newly created issues

Use this reference only when the core issue-creation workflow routes here because the requested issue clearly needs a parent, sub-issue, or dependency relationship. Add only relationships clearly implied by the request; do not broaden into general issue management.

1. Resolve the relevant GitHub issue node IDs.

   For any issue you need to reference, including the newly created issue once you know its number, get its node ID first:

   ```bash
   gh issue view <number> --json id --jq .id
   ```

2. Create a parent / sub-issue relationship with `addSubIssue`.

   After creating the new issue, use GitHub GraphQL to attach it to an existing parent issue:

   ```bash
   gh api graphql \
     -f query='mutation($issueId:ID!, $subIssueId:ID!) { addSubIssue(input:{issueId:$issueId, subIssueId:$subIssueId}) { issue { number } subIssue { number } } }' \
     -f issueId=<parent-issue-node-id> \
     -f subIssueId=<new-issue-node-id>
   ```

   - `issueId` is the parent issue.
   - `subIssueId` is the child issue.

3. Create dependency relationships with `addBlockedBy`.

   Use `addBlockedBy` when the new issue depends on another issue:

   ```bash
   gh api graphql \
     -f query='mutation($issueId:ID!, $blockingIssueId:ID!) { addBlockedBy(input:{issueId:$issueId, blockingIssueId:$blockingIssueId}) { issue { number } blockingIssue { number } } }' \
     -f issueId=<blocked-issue-node-id> \
     -f blockingIssueId=<blocking-issue-node-id>
   ```

   Direction matters:

   - For “new issue is **blocked by** #42”:
     - `issueId` = new issue
     - `blockingIssueId` = #42
   - For “new issue **blocks** #42”:
     - `issueId` = #42
     - `blockingIssueId` = new issue

4. Handle relationship failures explicitly.

   - If an issue node ID cannot be resolved, stop linking and surface the `gh` error clearly.
   - Surface GraphQL errors clearly if linking fails; do not report that relationship as created.
   - If issue creation succeeded before linking failed, still return the created issue URL and identify the relationship that remains unresolved.
