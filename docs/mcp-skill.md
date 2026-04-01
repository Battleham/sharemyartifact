# ShareMyArtifact MCP Skill

## Setup
Add this MCP server to your AI tool configuration:
- URL: `https://sharemyartifact.com/api/mcp`
- Authentication: Bearer token (API key from your account settings)

## Available Tools

### upload_artifact
Upload an HTML file and get a shareable link.

**Usage:** When the user has finished creating an HTML dashboard/artifact and wants to share it, use this tool. Only the `html` parameter is required — everything else is auto-detected.

**Before uploading:** Ask the user:
1. "Should this be public (visible on your profile), unlisted (link-only), or password-protected?"
   - Default to unlisted if they don't care
2. Only ask about title if the HTML doesn't have a `<title>` tag

**After uploading:** Share the returned URL with the user.

### list_artifacts
List all of the user's artifacts. Use this when the user wants to see what they've uploaded.

### update_artifact
Update an existing artifact. Use this when:
- The user wants to upload a new version of an existing dashboard
- **Important:** Before uploading, call `list_artifacts` to check if an artifact with a similar name already exists. If it does, ask: "You already have '[title]' — should I replace it or upload as a new artifact?"

### delete_artifact
Delete an artifact. Always confirm with the user before deleting.
