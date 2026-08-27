"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api, getCurrentUser } from "@/lib/api";

interface Comment {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Comment feed + composer attached to any record — the human half of the timeline. */
export function EntityComments({ entity, recordId }: { entity: string; recordId: string }) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.list("comment", {
        filters: { relatedEntity: entity, relatedId: recordId },
        sortBy: "createdAt",
        sortOrder: "desc",
        pageSize: 50,
      });
      setComments(
        result.data.map((c) => ({
          id: String(c.id),
          body: String(c.body ?? ""),
          authorName: (c.authorName as string) ?? null,
          createdAt: String(c.createdAt),
        })),
      );
    } catch {
      // Comments are additive — a load failure shouldn't break the page
    } finally {
      setLoading(false);
    }
  }, [entity, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      const user = getCurrentUser();
      await api.create("comment", {
        relatedEntity: entity,
        relatedId: recordId,
        body: body.trim(),
        authorName: user?.name,
        authorId: user?.id,
      });
      setBody("");
      load();
    } catch (err) {
      toast({ title: "Could not post comment", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-4 w-4" /> Comments
          {comments.length > 0 && <span className="tabular-nums">({comments.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={post} className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                post(e);
              }
            }}
            placeholder="Add a comment… (Enter to post)"
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="New comment"
          />
          <Button type="submit" size="icon" disabled={posting || !body.trim()} className="shrink-0 self-end" aria-label="Post comment">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet — start the thread.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{comment.authorName ?? "Someone"}</span>
                  <span>{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
