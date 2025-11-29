import { getAuth } from 'firebase/auth';
import { app } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Functional error type instead of class
interface APIError extends Error {
  status: number;
  code?: string;
  user_id?: string;
}

function createAPIError(status: number, message: string, code?: string, user_id?: string): APIError {
  const error = new Error(message) as APIError;
  error.name = 'APIError';
  error.status = status;
  error.code = code;
  error.user_id = user_id;
  return error;
}

async function getAuthToken(): Promise<string | null> {
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    
    throw createAPIError(
      response.status,
      errorData.error || errorData.message || `API request failed: ${response.statusText}`,
      errorData.code,
      errorData.user_id
    );
  }

  return response;
}

// API endpoints
export async function getCurrentUser(): Promise<{
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    photo_url: string | null;
    created_at: string;
    updated_at: string;
  };
  message: string;
}> {
  const response = await fetchWithAuth('/api/v1/protected/me');
  return response.json();
}

// Audit API endpoints
export interface CreateAuditRequest {
  sitemap_url: string;
  rate_limit_ms?: number;
  url_limit?: number;
}

export interface Audit {
  id: string;
  user_id: string | null;
  sitemap_url: string;
  status: 'pending' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  total_urls: number;
  processed_urls: number;
  rate_limit_ms: number;
  url_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditPage {
  id: string;
  url: string;
  status: 'pending' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  title: string | null;
  quality_score: number | null;
  error_message: string | null;
  created_at: string;
  analyzed_at: string | null;
  issue_count: number;
  issues?: AuditIssue[];
}

export interface AuditIssue {
  id: string;
  issue_type: 'grammar' | 'redundancy' | 'contradiction' | 'placeholder' | 'empty';
  severity: 'low' | 'medium' | 'high';
  description: string;
  snippet: string;
  suggestion: string | null;
}

export interface AuditProgress {
  audit: Audit;
  progress: {
    total: number;
    completed: number;
    failed: number;
    crawling: number;
    analyzing: number;
    pending: number;
    crawled: number;
    percentage: number;
  };
}

export interface AuditPagesResponse {
  pages: AuditPage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export async function createAudit(data: CreateAuditRequest): Promise<{ id: string; message: string }> {
  const response = await fetchWithAuth('/api/v1/audits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function getAudits(): Promise<{ audits: Audit[] }> {
  const response = await fetchWithAuth('/api/v1/audits');
  return response.json();
}

export async function getAudit(id: string): Promise<AuditProgress> {
  const response = await fetchWithAuth(`/api/v1/audits/${id}`);
  return response.json();
}

export async function getAuditPages(
  id: string,
  page: number = 1,
  limit: number = 50,
  filters?: { issue_type?: string; min_score?: number }
): Promise<AuditPagesResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  if (filters?.issue_type) {
    params.append('issue_type', filters.issue_type);
  }
  if (filters?.min_score) {
    params.append('min_score', filters.min_score.toString());
  }

  const response = await fetchWithAuth(`/api/v1/audits/${id}/pages?${params.toString()}`);
  return response.json();
}

export async function exportAuditCsv(id: string): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/audits/${id}/export`);
  return response.blob();
}

export async function deleteAudit(id: string): Promise<{ message: string }> {
  const response = await fetchWithAuth(`/api/v1/audits/${id}`, {
    method: 'DELETE',
  });
  return response.json();
}

// Settings API endpoints
export interface PromptResponse {
  prompt: string;
  isDefault?: boolean;
}

export async function getPrompt(): Promise<PromptResponse> {
  const response = await fetchWithAuth('/api/v1/settings/prompt');
  return response.json();
}

export async function updatePrompt(prompt: string): Promise<{ message: string }> {
  const response = await fetchWithAuth('/api/v1/settings/prompt', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  return response.json();
}

export async function getDefaultPrompt(): Promise<PromptResponse> {
  const response = await fetchWithAuth('/api/v1/settings/prompt/default');
  return response.json();
}

export const api = {
  getCurrentUser,
  // Audit endpoints
  createAudit,
  getAudits,
  getAudit,
  getAuditPages,
  exportAuditCsv,
  deleteAudit,
  // Settings endpoints
  getPrompt,
  updatePrompt,
  getDefaultPrompt,
}; 