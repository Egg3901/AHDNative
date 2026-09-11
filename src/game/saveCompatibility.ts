/**
 * The engine validates world reversibility; the app preserves its own inbox
 * metadata around that boundary. AHDClient's old engine can read the world but
 * does not own this metadata and can discard it when writing a new envelope.
 */
import { projectSaveToV42 as projectEngineSave, type ProjectSaveToV42Result } from '@ahdclient/engine';
import { parseNotifications } from './notifications';
export type { ProjectSaveToV42Result } from "@ahdclient/engine";

export function projectSaveToV42(contents: string): ProjectSaveToV42Result {
  let envelope: unknown;
  try { envelope = JSON.parse(contents); }
  catch { return projectEngineSave(contents); }
  try {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
      || !Object.hasOwn(envelope, 'notifications')) return projectEngineSave(contents);
    const save = envelope as Record<string, unknown>;
    const notifications = parseNotifications(save.notifications);
    delete save.notifications;
    const projected = projectEngineSave(JSON.stringify(save));
    if (!projected.ok) return projected;
    return { ok: true, contents: projected.contents.slice(0, -1) + ',"notifications":' + JSON.stringify(notifications) + '}' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid saved notifications' };
  }
}
