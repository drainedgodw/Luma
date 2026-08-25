import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
function contained(root: string, target: string) {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
export function resolveRepoPath(repo: string, input: string, allowRoot = true) {
  if (typeof input !== 'string' || input.includes('\0')) throw new Error('Invalid repository path');
  if (isAbsolute(input)) throw new Error('Absolute paths are not allowed');
  const root = resolve(repo);
  const target = resolve(root, input || '.');
  if (!contained(root, target) || (!allowRoot && target === root))
    throw new Error('Path escapes the repository');
  return target;
}
export async function resolveExistingRepoPath(repo: string, input: string, allowRoot = true) {
  const root = await realpath(resolve(repo));
  const target = await realpath(resolveRepoPath(repo, input, allowRoot));
  if (!contained(root, target) || (!allowRoot && target === root))
    throw new Error('Symlink escapes the repository');
  return target;
}
export async function assertParentInRepo(repo: string, target: string) {
  const root = await realpath(resolve(repo));
  const parent = await realpath(resolve(target, '..'));
  if (!contained(root, parent)) throw new Error('Target parent escapes the repository');
  return target;
}
