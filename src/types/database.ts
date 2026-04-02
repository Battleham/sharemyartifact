export type ArtifactVisibility = 'public' | 'unlisted' | 'password_protected';

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  visibility: ArtifactVisibility;
  password_hash: string | null;
  storage_path: string;
  file_size: number;
  view_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}
