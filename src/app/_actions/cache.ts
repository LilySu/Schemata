"use server";

import { db } from "~/server/db";
import { eq, and } from "drizzle-orm";
import { diagramCache, subDiagramCache } from "~/server/db/schema";
import { sql } from "drizzle-orm";

export async function getCachedDiagram(username: string, repo: string) {
  try {
    const cached = await db
      .select()
      .from(diagramCache)
      .where(
        and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
      )
      .limit(1);

    const diagram = cached[0]?.diagram ?? null;
    if (!diagram) return null;
    // Backward compatibility: old Mermaid-format cache entries aren't valid JSON
    try {
      JSON.parse(diagram);
      return diagram;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Error fetching cached diagram:", error);
    return null;
  }
}

export async function getCachedExplanation(username: string, repo: string) {
  try {
    const cached = await db
      .select()
      .from(diagramCache)
      .where(
        and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
      )
      .limit(1);

    return cached[0]?.explanation ?? null;
  } catch (error) {
    console.error("Error fetching cached explanation:", error);
    return null;
  }
}

export async function cacheDiagramAndExplanation(
  username: string,
  repo: string,
  diagram: string,
  explanation: string,
  usedOwnKey = false,
) {
  try {
    await db
      .insert(diagramCache)
      .values({
        username,
        repo,
        diagram,
        explanation,
        usedOwnKey,
      })
      .onConflictDoUpdate({
        target: [diagramCache.username, diagramCache.repo],
        set: {
          diagram,
          explanation,
          usedOwnKey,
          updatedAt: new Date(),
        },
      });

    // Cascade invalidation: clear all sub-diagram cache for this repo
    await db
      .delete(subDiagramCache)
      .where(
        and(
          eq(subDiagramCache.username, username),
          eq(subDiagramCache.repo, repo),
        ),
      );
  } catch (error) {
    console.error("Error caching diagram:", error);
  }
}

export async function getCachedSubDiagram(
  username: string,
  repo: string,
  scopePath: string,
) {
  try {
    const cached = await db
      .select()
      .from(subDiagramCache)
      .where(
        and(
          eq(subDiagramCache.username, username),
          eq(subDiagramCache.repo, repo),
          eq(subDiagramCache.scopePath, scopePath),
        ),
      )
      .limit(1);

    if (!cached[0]) return null;
    // Backward compatibility: old Mermaid-format cache entries aren't valid JSON
    try {
      JSON.parse(cached[0].diagram);
    } catch {
      return null;
    }
    return {
      diagram: cached[0].diagram,
      explanation: cached[0].explanation,
      isLeaf: cached[0].isLeaf ?? false,
    };
  } catch (error) {
    console.error("Error fetching cached sub-diagram:", error);
    return null;
  }
}

export async function cacheSubDiagram(
  username: string,
  repo: string,
  scopePath: string,
  diagram: string,
  explanation: string,
  isLeaf = false,
) {
  try {
    await db
      .insert(subDiagramCache)
      .values({
        username,
        repo,
        scopePath,
        diagram,
        explanation,
        isLeaf,
      })
      .onConflictDoUpdate({
        target: [
          subDiagramCache.username,
          subDiagramCache.repo,
          subDiagramCache.scopePath,
        ],
        set: {
          diagram,
          explanation,
          isLeaf,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("Error caching sub-diagram:", error);
  }
}

export async function deleteCachedDiagram(username: string, repo: string) {
  try {
    await db
      .delete(diagramCache)
      .where(
        and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
      );
    await db
      .delete(subDiagramCache)
      .where(
        and(
          eq(subDiagramCache.username, username),
          eq(subDiagramCache.repo, repo),
        ),
      );
  } catch (error) {
    console.error("Error deleting cached diagram:", error);
  }
}

export async function getDiagramStats() {
  try {
    const stats = await db
      .select({
        totalDiagrams: sql`COUNT(*)`,
        ownKeyUsers: sql`COUNT(CASE WHEN ${diagramCache.usedOwnKey} = true THEN 1 END)`,
        freeUsers: sql`COUNT(CASE WHEN ${diagramCache.usedOwnKey} = false THEN 1 END)`,
      })
      .from(diagramCache);

    return stats[0];
  } catch (error) {
    console.error("Error getting diagram stats:", error);
    return null;
  }
}
