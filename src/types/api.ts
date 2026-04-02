import type { Artifact, ArtifactVisibility } from './database';

export interface UploadArtifactRequest {
  html: string;
  title?: string;
  slug?: string;
  visibility?: ArtifactVisibility;
  password?: string;
}

export interface UploadArtifactResponse {
  artifact: Artifact;
  url: string;
}

export interface UpdateArtifactRequest {
  html?: string;
  title?: string;
  slug?: string;
  visibility?: ArtifactVisibility;
  password?: string | null; // null to remove password
}

export interface ArtifactListItem {
  id: string;
  slug: string;
  title: string;
  visibility: ArtifactVisibility;
  view_count: number;
  created_at: string;
  updated_at: string;
  url: string;
  short_url?: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
