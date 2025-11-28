import { getEnv } from '../lib/env';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type IssueType = 'grammar' | 'redundancy' | 'contradiction' | 'placeholder' | 'empty';
export type Severity = 'low' | 'medium' | 'high';

export interface AnalysisIssue {
  type: IssueType;
  severity: Severity;
  description: string;
  snippet: string;
  suggestion?: string;
}

export interface AnalysisResult {
  qualityScore: number; // 0-100
  issues: AnalysisIssue[];
}

const ANALYSIS_PROMPT = `Analysiere den folgenden Website-Content auf Textqualitätsprobleme.

Titel: {title}
Content:
{content}

Prüfe auf:
1. Grammatik/Rechtschreibung - Fehler in Sprache
2. Redundanz - Wiederholte Phrasen oder Absätze
3. Widersprüche - Inkonsistente Informationen (z.B. verschiedene Material-Angaben)
4. Platzhalter - Lorem Ipsum, TODO, "[hier einfügen]", etc.
5. Leere Inhalte - Fehlende Beschreibungen

Antworte NUR mit einem gültigen JSON-Array im folgenden Format (kein zusätzlicher Text):
[{ "type": "grammar|redundancy|contradiction|placeholder|empty", 
   "severity": "low|medium|high",
   "description": "...",
   "snippet": "betroffener Text",
   "suggestion": "Verbesserungsvorschlag" }]

Berechne zusätzlich einen Quality Score (0-100) basierend auf der Anzahl und Schwere der gefundenen Probleme.`;

/**
 * Analyze content using AI (OpenAI or Claude)
 */
export async function analyzeContent(
  title: string,
  content: string
): Promise<AnalysisResult> {
  const provider = getEnv('AI_PROVIDER', 'openai');
  const prompt = ANALYSIS_PROMPT.replace('{title}', title).replace('{content}', content);

  try {
    let issues: AnalysisIssue[] = [];
    let qualityScore = 100;

    if (provider === 'anthropic') {
      issues = await analyzeWithClaude(prompt);
    } else {
      issues = await analyzeWithOpenAI(prompt);
    }

    // Calculate quality score based on issues
    if (issues.length > 0) {
      const severityWeights = { low: 5, medium: 15, high: 30 };
      let totalDeduction = 0;

      for (const issue of issues) {
        totalDeduction += severityWeights[issue.severity];
      }

      qualityScore = Math.max(0, 100 - totalDeduction);
    }

    return {
      qualityScore,
      issues,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`AI analysis failed: ${error.message}`);
    }
    throw error;
  }
}

async function analyzeWithOpenAI(prompt: string): Promise<AnalysisIssue[]> {
  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Du bist ein Experte für Textqualitäts-Analyse. Antworte nur mit gültigem JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  try {
    const parsed = JSON.parse(content);
    // Handle both array and object with issues array
    const issues = Array.isArray(parsed) ? parsed : parsed.issues || [];
    return validateIssues(issues);
  } catch (error) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return validateIssues(Array.isArray(parsed) ? parsed : []);
    }
    throw new Error('Failed to parse OpenAI response as JSON');
  }
}

async function analyzeWithClaude(prompt: string): Promise<AnalysisIssue[]> {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content.text);
    const issues = Array.isArray(parsed) ? parsed : parsed.issues || [];
    return validateIssues(issues);
  } catch (error) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.text.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return validateIssues(Array.isArray(parsed) ? parsed : []);
    }
    throw new Error('Failed to parse Claude response as JSON');
  }
}

function validateIssues(issues: any[]): AnalysisIssue[] {
  const validTypes: IssueType[] = ['grammar', 'redundancy', 'contradiction', 'placeholder', 'empty'];
  const validSeverities: Severity[] = ['low', 'medium', 'high'];

  return issues
    .filter((issue) => {
      return (
        issue &&
        typeof issue === 'object' &&
        validTypes.includes(issue.type) &&
        validSeverities.includes(issue.severity) &&
        typeof issue.description === 'string' &&
        typeof issue.snippet === 'string'
      );
    })
    .map((issue) => ({
      type: issue.type as IssueType,
      severity: issue.severity as Severity,
      description: issue.description,
      snippet: issue.snippet,
      suggestion: issue.suggestion || undefined,
    }));
}

