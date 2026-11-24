import "server-only";
import { listMyGroups } from "@/lib/data/groups";

/**
 * Where "home" is for a signed-in user: the group they use most, weighted to
 * recent use (see core/frecency.ts), otherwise "New group".
 */
export async function homePath(userId: string): Promise<string> {
  const [top] = await listMyGroups(userId);
  return top ? `/g/${top.id}` : "/new";
}
