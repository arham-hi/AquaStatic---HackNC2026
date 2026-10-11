/** Ignore recognition of Aqua's own voice leaking through speakers. */
export function isPlaybackEcho(transcript: string, reply: string): boolean {
  const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  const heard = words(transcript);
  const spoken = words(reply);
  if (!heard.length || !spoken.length) return false;
  // Only ignore a contiguous excerpt, not a caller asking about the same topic.
  return ` ${spoken.join(" ")} `.includes(` ${heard.join(" ")} `);
}

/** Invalidates asynchronous work belonging to a previous conversation turn. */
export class CallTurns {
  private version = 0;
  next() { return ++this.version; }
  current(version: number) { return version === this.version; }
}
