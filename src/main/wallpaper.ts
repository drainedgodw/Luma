import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

/**
 * Detect the user's desktop wallpaper and return it as a data URL.
 * GNOME (gsettings) → KDE plasma config → common picture directories.
 */
export async function getWallpaper(): Promise<string | null> {
  const candidates: string[] = [];

  // GNOME
  for (const key of ['picture-uri-dark', 'picture-uri']) {
    const uri = await gsettingsGet('org.gnome.desktop.background', key);
    if (uri) candidates.push(fileFromUri(uri));
  }

  // KDE Plasma
  const kdeCfg = join(homedir(), '.config', 'plasma-org.kde.plasma.desktop-appletsrc');
  if (existsSync(kdeCfg)) {
    try {
      const text = await readFile(kdeCfg, 'utf8');
      const m = text.match(/Image=([^"\n]+)/);
      if (m) candidates.push(fileFromUri(m[1].trim()));
    } catch {
      /* unreadable */
    }
  }

  // Hyprland / swww cache, common fallbacks
  const cacheDir = join(homedir(), '.cache', 'swww');
  if (existsSync(cacheDir)) {
    try {
      const { readdir } = await import('node:fs/promises');
      const e = await readdir(cacheDir);
      const wal = e.find((f) => /\.(png|jpe?g|webp)$/i.test(f));
      if (wal) candidates.push(join(cacheDir, wal));
    } catch {
      /* ignore */
    }
  }
  candidates.push(
    join(homedir(), '.local', 'share', 'backgrounds', 'wallpaper.png'),
    join(homedir(), 'Pictures', 'wallpaper.jpg'),
    join(homedir(), 'Pictures', 'wallpaper.png'),
    '/usr/share/backgrounds/archlinux/archwall-paper.jpg',
    '/usr/share/backgrounds/defaults/desktop-background.jpg'
  );

  for (const p of candidates) {
    if (p && existsSync(p)) {
      try {
        const buf = await readFile(p);
        const ext = (/\.(\w+)$/.exec(p)?.[1] ?? 'png').toLowerCase();
        const mime =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/png';
        if (buf.length < 25 * 1024 * 1024) {
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function gsettingsGet(schema: string, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gsettings', ['get', schema, key], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.trim().replace(/^'|'$/g, ''));
    });
  });
}

function fileFromUri(uri: string): string {
  if (uri.startsWith('file://')) return decodeURIComponent(uri.slice(7));
  if (uri.startsWith('/')) return uri;
  return '';
}
