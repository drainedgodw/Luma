import { app, BrowserWindow, dialog, safeStorage } from 'electron';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runGit, tryGit } from './git/exec';
export interface GitHubAccount {
  login: string;
  name?: string;
  avatarUrl?: string;
}
export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  updatedAt: string;
  defaultBranch: string;
  httpsUrl: string;
  sshUrl: string;
  owner: string;
}
const authPath = () => join(app.getPath('userData'), 'github-auth.json');
const askpassPath = () => join(app.getPath('userData'), 'luma-github-askpass.sh');
async function token(): Promise<string | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const saved = JSON.parse(await readFile(authPath(), 'utf8')) as { encrypted: string };
    return safeStorage.decryptString(Buffer.from(saved.encrypted, 'base64'));
  } catch {
    return null;
  }
}
async function githubFetch<T>(path: string, authToken?: string): Promise<T> {
  const value = authToken ?? (await token());
  if (!value) throw new Error('GitHub is not connected');
  const endpoint = 'https://' + 'api.github.com' + path;
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${value}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Luma-IDE',
    },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub token is invalid or expired');
    if (response.status === 403)
      throw new Error('GitHub denied access or the API rate limit was reached');
    throw new Error(`GitHub request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
async function accountFor(authToken?: string): Promise<GitHubAccount> {
  const user = await githubFetch<{ login: string; name?: string; avatar_url?: string }>(
    '/user',
    authToken
  );
  return { login: user.login, name: user.name, avatarUrl: user.avatar_url };
}
export async function status(): Promise<{
  connected: boolean;
  account?: GitHubAccount;
  deviceFlowAvailable: boolean;
}> {
  const current = await token();
  if (!current)
    return { connected: false, deviceFlowAvailable: Boolean(process.env.LUMA_GITHUB_CLIENT_ID) };
  try {
    return {
      connected: true,
      account: await accountFor(current),
      deviceFlowAvailable: Boolean(process.env.LUMA_GITHUB_CLIENT_ID),
    };
  } catch {
    return { connected: false, deviceFlowAvailable: Boolean(process.env.LUMA_GITHUB_CLIENT_ID) };
  }
}
export async function saveToken(value: string): Promise<GitHubAccount> {
  const clean = value.trim();
  if (clean.length < 20 || /\s/.test(clean))
    throw new Error('Enter a valid fine-grained GitHub token');
  const account = await accountFor(clean);
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this system');
  await mkdir(app.getPath('userData'), { recursive: true });
  const encrypted = safeStorage.encryptString(clean).toString('base64');
  await writeFile(authPath(), JSON.stringify({ encrypted }), { mode: 0o600 });
  return account;
}
export async function logout(): Promise<void> {
  await rm(authPath(), { force: true });
}
export async function listRepos(query = ''): Promise<GitHubRepo[]> {
  const page = await githubFetch<
    Array<{
      id: number;
      name: string;
      full_name: string;
      description?: string;
      private: boolean;
      updated_at: string;
      default_branch: string;
      clone_url: string;
      ssh_url: string;
      owner: { login: string };
    }>
  >(
    '/user/repos?per_page=100&page=1&sort=updated&affiliation=owner,collaborator,organization_member'
  );
  // GitHub caps /user/repos at 100 per page; follow pages until exhausted (10 pages = 1000 repos)
  const repos = [...page];
  for (let pageNumber = 2; pageNumber <= 10 && page.length === 100; pageNumber++) {
    const next = await githubFetch<typeof page>(
      `/user/repos?per_page=100&page=${pageNumber}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    repos.push(...next);
    if (next.length < 100) break;
  }
  const needle = query.trim().toLowerCase();
  return repos
    .filter(
      (r) =>
        !needle ||
        r.full_name.toLowerCase().includes(needle) ||
        r.description?.toLowerCase().includes(needle)
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      updatedAt: r.updated_at,
      defaultBranch: r.default_branch,
      httpsUrl: r.clone_url,
      sshUrl: r.ssh_url,
      owner: r.owner.login,
    }));
}
async function authEnv(): Promise<Record<string, string>> {
  const current = await token();
  if (!current) throw new Error('Connect GitHub before using HTTPS authentication');
  await mkdir(app.getPath('userData'), { recursive: true });
  const script =
    '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$LUMA_GITHUB_TOKEN" ;;\nesac\n';
  await writeFile(askpassPath(), script, { mode: 0o700 });
  await chmod(askpassPath(), 0o700);
  return { GIT_ASKPASS: askpassPath(), GIT_TERMINAL_PROMPT: '0', LUMA_GITHUB_TOKEN: current };
}
async function pathExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}
export interface CloneProgress {
  repo: string;
  phase: string;
  percent: number;
  detail: string;
  canceled: boolean;
}
let activeClone: ChildProcess | null = null;
export function cancelClone(): boolean {
  const child = activeClone;
  if (!child || child.exitCode !== null) return false;
  child.kill('SIGTERM');
  return true;
}
export async function cloneRepo(
  window: BrowserWindow,
  repo: GitHubRepo,
  transport: 'https' | 'ssh'
): Promise<string | null> {
  const selected = await dialog.showOpenDialog(window, {
    title: `Choose where to clone ${repo.fullName}`,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const parent = selected.filePaths[0];
  const destination = join(parent, repo.name);
  if (await pathExists(destination)) throw new Error(`Destination already exists: ${destination}`);
  const url = transport === 'ssh' ? repo.sshUrl : repo.httpsUrl;
  const env = transport === 'https' ? await authEnv() : { GIT_TERMINAL_PROMPT: '0' };
  const send = (progress: CloneProgress) =>
    window.isDestroyed() ? undefined : window.webContents.send('github:cloneProgress', progress);
  let canceled = false;
  await new Promise<void>((resolve, reject) => {
    // git prints --progress updates to stderr with \r separators; keep only the newest line
    let stderrTail = '';
    const child = spawn(
      'git',
      ['-c', 'core.quotepath=false', 'clone', '--progress', url, destination],
      { cwd: parent, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', ...env } }
    );
    activeClone = child;
    const report = (chunk: string) => {
      stderrTail = (stderrTail + chunk).split(/[\r\n]/).filter(Boolean).pop() ?? '';
      const match = /^(Counting|Compressing|Receiving|Resolving|Updating)[^:]*:\s*(\d+)%?(?:\s*\(([^)]*)\))?/.exec(
        stderrTail
      );
      if (match)
        send({
          repo: repo.fullName,
          phase: match[1],
          percent: Number(match[2]),
          detail: match[3] ?? '',
          canceled: false,
        });
    };
    child.stderr.on('data', (d: Buffer) => report(d.toString('utf8')));
    child.on('error', (error) => {
      activeClone = null;
      reject(error);
    });
    child.on('close', (code, signal) => {
      activeClone = null;
      canceled = signal !== null;
      if (canceled) send({ repo: repo.fullName, phase: 'Canceling', percent: 0, detail: '', canceled: true });
      if (code === 0) resolve();
      else if (canceled) reject(new Error('Clone canceled'));
      else {
        const captured = stderrTail;
        reject(
          new Error(
            captured.trim() ||
              `git clone failed (exit ${code ?? 'unknown'}); check the URL, token permissions and network`
          )
        );
      }
    });
  }).catch(async (error: Error) => {
    if (canceled || error.message === 'Clone canceled') {
      await rm(destination, { recursive: true, force: true }).catch(() => {});
      throw new Error('Clone canceled');
    }
    throw error;
  });
  return destination;
}
async function remoteUsesGitHubHttps(repo: string): Promise<boolean> {
  const result = await tryGit(repo, ['remote', 'get-url', 'origin']);
  return result.code === 0 && /^https:\/\/github\.com\//i.test(result.stdout.trim());
}
export async function fetchRemote(repo: string, remote = 'origin'): Promise<void> {
  const env = (await remoteUsesGitHubHttps(repo)) ? await authEnv() : undefined;
  await runGit(repo, ['fetch', '--prune', remote], env);
}
export async function pull(repo: string): Promise<void> {
  const env = (await remoteUsesGitHubHttps(repo)) ? await authEnv() : undefined;
  await runGit(repo, ['pull', '--rebase'], env);
}
export async function push(repo: string, setUpstream = false): Promise<void> {
  const env = (await remoteUsesGitHubHttps(repo)) ? await authEnv() : undefined;
  const args = ['push'];
  if (setUpstream) args.push('-u', 'origin', 'HEAD');
  await runGit(repo, args, env);
}
export function oauthInfo(): { available: boolean; reason?: string } {
  return process.env.LUMA_GITHUB_CLIENT_ID
    ? { available: true }
    : { available: false, reason: 'OAuth Device Flow needs a registered Luma GitHub Client ID' };
}
