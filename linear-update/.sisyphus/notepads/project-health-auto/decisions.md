
## [2026-01-28] Architecture Decisions

### Decision 1: Slack Slash Command vs Cron
**Context**: User initially wanted weekly Friday 9am automation, but changed to on-demand.

**Decision**: Implement Slack Slash Command (`/health-update`)
- **Rationale**: Users update issue status on Friday morning, so they need flexibility to run the command after updates are complete
- **Trade-off**: Requires manual trigger, but provides better control

### Decision 2: Slack Message vs Linear Auto-Post
**Context**: Should the bot post directly to Linear Project Updates?

**Decision**: Send formatted message to Slack for copy-paste
- **Rationale**: Users want to review and edit before posting to Linear
- **Trade-off**: Extra manual step, but allows customization

### Decision 3: Project Filtering
**Context**: Which projects should be included?

**Decision**: Only "started" state projects where user is the lead
- **Rationale**: Matches user's workflow (active projects they're responsible for)
- **Implementation**: GraphQL filter: `state: { eq: "started" }, lead: { id: { eq: $userId } }`

### Decision 4: Week Start Calculation
**Context**: How to define "this week"?

**Decision**: Monday 00:00 KST to current time
- **Rationale**: Aligns with typical work week in Korea
- **Implementation**: Calculate KST offset, find last Monday, convert back to UTC

### Decision 5: Empty Section Handling
**Context**: What to show when a section has no issues?

**Decision**: Omit empty sections entirely
- **Rationale**: Cleaner message, focuses on what exists
- **Exception**: If ALL sections are empty, show "이슈 없음"

