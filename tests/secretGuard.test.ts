import { describe, expect, it } from 'vitest';
import { redact, scanStagedContent } from '../src/main/secretGuard';

describe('Secret Guard', () => {
  it('detects and redacts common credentials', () => {
    const token = 'github_pat_1234567890abcdefghijklmnopqrstuvwxyz';
    const findings = scanStagedContent(`+const token = "${token}"`, []);
    expect(findings.some((finding) => finding.kind === 'GitHub token')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(token);
    expect(JSON.stringify(findings)).toContain('REDACTED');
  });

  it('detects sensitive filenames', () => {
    const findings = scanStagedContent('', ['src/index.ts', '.env.production', 'certs/client.pem']);
    expect(findings.filter((finding) => finding.kind === 'Sensitive filename')).toHaveLength(2);
  });

  it('detects credential URLs and high-entropy values', () => {
    const diff = [
      '+DATABASE_URL="postgres://luma:supersecretpassword@example.com/db"',
      '+const randomValue = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6"',
    ].join('\n');
    const findings = scanStagedContent(diff, []);
    expect(findings.some((finding) => finding.kind === 'Credential URL')).toBe(true);
    expect(findings.some((finding) => finding.kind === 'High-entropy value')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain('supersecretpassword');
  });

  it('supports an explicit local allow directive', () => {
    const findings = scanStagedContent(
      '+const example = "github_pat_1234567890abcdefghijklmnopqrstuvwxyz" // luma-secret-allow',
      []
    );
    expect(findings).toEqual([]);
  });

  it('redacts direct values before display', () => {
    expect(redact('password="verysecretvalue"')).not.toContain('verysecretvalue');
  });
});
