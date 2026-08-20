export interface SecretFinding { kind: string; preview: string; file?: string }

const PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'Private key', pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { kind: 'GitHub token', pattern: /(?:github_pat_|gh[oprsu]_)[A-Za-z0-9_]{20,}/ },
  { kind: 'GitLab token', pattern: /glpat-[A-Za-z0-9_-]{20,}/ },
  { kind: 'Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{16,}/ },
  { kind: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { kind: 'JWT', pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { kind: 'Credential URL', pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@]+:[^\s@]+@/i },
  { kind: 'Assigned secret', pattern: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*['"]?[^'"\s]{8,}/i },
];

const SENSITIVE_PATH = /(^|\/)(?:\.env(?:$|\.)|id_rsa$|id_ed25519$|[^/]+\.(?:pem|p12|pfx|key)$)/i;
const CANDIDATE_VALUE = /['"`]([A-Za-z0-9+/=_-]{24,})['"`]/g;

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

export function redact(value: string): string {
  return value
    .replace(/(github_pat_|gh[oprsu]_|glpat-|xox[baprs]-)[A-Za-z0-9_-]{8,}/g, '$1••••REDACTED••••')
    .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA••••REDACTED••••')
    .replace(/(eyJ[A-Za-z0-9_-]{4,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '$1.••••.••••')
    .replace(/((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@]+:)[^\s@]+@/gi, '$1••••@')
    .replace(/((?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*['"]?)[^'"\s]+/gi, '$1••••REDACTED••••');
}

export function scanStagedContent(diff: string, filenames: string[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  const add = (finding: SecretFinding) => {
    const key = `${finding.kind}:${finding.file ?? ''}:${finding.preview}`;
    if (!seen.has(key)) { seen.add(key); findings.push(finding); }
  };

  for (const file of filenames.filter(Boolean)) {
    if (SENSITIVE_PATH.test(file)) add({ kind: 'Sensitive filename', file, preview: file });
  }

  for (const raw of diff.split('\n')) {
    if (!raw.startsWith('+') || raw.startsWith('+++') || raw.includes('luma-secret-allow')) continue;
    const line = raw.slice(1, 500);
    for (const rule of PATTERNS) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) add({ kind: rule.kind, preview: redact(line) });
    }
    CANDIDATE_VALUE.lastIndex = 0;
    for (const match of line.matchAll(CANDIDATE_VALUE)) {
      const value = match[1];
      if (entropy(value) >= 4.2) add({ kind: 'High-entropy value', preview: redact(line.replace(value, '••••REDACTED••••')) });
    }
  }
  return findings;
}
