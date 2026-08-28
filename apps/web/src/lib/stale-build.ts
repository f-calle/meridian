/**
 * Does this error mean the tab is running an older build?
 *
 * Deploying replaces the hashed JS files, so a tab left open across a deploy
 * can fail to load a chunk hours later, on an interaction with nothing to do
 * with the deploy. Telling that apart from an ordinary bug decides whether the
 * error page offers "Reload" or "Try again" — and offering "Try again" for a
 * missing chunk is a loop the user cannot escape.
 *
 * Matched on both the name and the message because the shape varies by browser
 * and by how the module was loaded: webpack throws a named ChunkLoadError,
 * native ESM import failures come through as a plain TypeError with only the
 * message to go on.
 */
export function isStaleBuildError(error: { name?: string; message?: string }): boolean {
  if (error.name === "ChunkLoadError") return true;
  return /Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message ?? "",
  );
}
