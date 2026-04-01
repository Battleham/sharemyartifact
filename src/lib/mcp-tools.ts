export const MCP_TOOLS = [
  {
    name: 'upload_artifact',
    description: 'Upload an HTML artifact to ShareMyArtifact. Returns a shareable URL. Only the html parameter is required — title, slug, visibility, and password are all optional.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        html: { type: 'string', description: 'The HTML content to upload' },
        title: { type: 'string', description: 'Optional title (auto-extracted from <title> or <h1> if not provided)' },
        slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided)' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
        password: { type: 'string', description: 'Optional password to protect the artifact' },
      },
      required: ['html'],
    },
  },
  {
    name: 'list_artifacts',
    description: 'List all artifacts belonging to the authenticated user.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'update_artifact',
    description: 'Update an existing artifact. Use slug to identify which artifact to update.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'The slug of the artifact to update' },
        html: { type: 'string', description: 'New HTML content (replaces existing)' },
        title: { type: 'string', description: 'New title' },
        new_slug: { type: 'string', description: 'New URL slug' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'] },
        password: { type: 'string', description: 'New password (or null to remove)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'delete_artifact',
    description: 'Delete an artifact permanently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'The slug of the artifact to delete' },
      },
      required: ['slug'],
    },
  },
];
