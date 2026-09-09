/**
 * Liquid Glass relies on the desktop compositor and Electron's transparent
 * window. Never copy the user's wallpaper into the renderer: doing so creates
 * an opaque imitation instead of real transparency.
 */
export async function getWallpaper(): Promise<null> {
  return null;
}
