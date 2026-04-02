export const MCP_TOOLS = [
  {
    name: 'upload_artifact',
    description: 'DEPRECATED — use request_upload + complete_upload instead, which is faster for all file sizes. This legacy tool sends HTML inline through MCP which is slow. If you must use it: only the html parameter is required.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        html: { type: 'string', description: 'The HTML content to upload' },
        title: { type: 'string', description: 'Optional title (auto-extracted from <title> or <h1> if not provided)' },
        slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided)' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
        password: { type: 'string', description: 'Optional password to protect the artifact' },
        ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
      },
      required: ['html'],
    },
  },
  {
    name: 'upload_artifact_from_url',
    description: 'Upload an HTML artifact by fetching it from a URL. Use when the HTML is already hosted at a public URL. The server fetches the HTML and stores it. Supports any publicly accessible URL (raw GitHub files, gists, pastebin, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch the HTML content from. Must be publicly accessible.' },
        title: { type: 'string', description: 'Optional title (auto-extracted from <title> or <h1> if not provided)' },
        slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided)' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
        password: { type: 'string', description: 'Optional password to protect the artifact' },
        ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'request_upload',
    description: 'Upload an HTML artifact to ShareMyArtifact. This is the recommended upload method for ALL file sizes. Steps: (1) call request_upload to get a presigned URL, (2) upload the file directly to that URL using curl or code execution, (3) call complete_upload with the upload_id to finalize. The presigned URL is valid for 2 hours and accepts PUT requests with the raw HTML file body. Example curl: curl -X PUT "<upload_url>" -H "Content-Type: text/html" --data-binary @file.html',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'Original filename (used for title extraction if no title given). Defaults to "artifact.html".' },
        title: { type: 'string', description: 'Optional title for the artifact' },
        slug: { type: 'string', description: 'Optional URL slug (auto-generated from title if not provided)' },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'password_protected'], description: 'Visibility setting (defaults to unlisted)' },
        password: { type: 'string', description: 'Optional password to protect the artifact' },
        ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
      },
    },
  },
  {
    name: 'complete_upload',
    description: 'Finalize a presigned upload after the file has been uploaded via the URL from request_upload. This creates the artifact record and returns the shareable URL. Call this AFTER uploading the file to the presigned URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        upload_id: { type: 'string', description: 'The upload_id returned by request_upload' },
      },
      required: ['upload_id'],
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
        ttl: { type: 'string', enum: ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'], description: 'How long the artifact stays live. Defaults to 1d.' },
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
