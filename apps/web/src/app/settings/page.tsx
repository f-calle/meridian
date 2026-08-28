"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { api, clearToken, getCurrentUser, type TeamUser } from "@/lib/api";
import { BrandingCard } from "@/components/branding-card";

/**
 * Assignable roles, with the job each one does — a dropdown of bare words makes
 * the person inviting guess, and guessing wrong is how a bookkeeper ends up an
 * admin. `owner` is offered only to an owner; `agent` is issued with a key, not
 * assigned here.
 */
const ROLES: { value: string; label: string; description: string; ownerOnly?: boolean }[] = [
  { value: "owner", label: "Owner", description: "Everything, plus billing", ownerOnly: true },
  { value: "admin", label: "Admin", description: "Everything except billing" },
  { value: "finance", label: "Finance", description: "Owns quotes, invoices and the catalogue" },
  { value: "sales", label: "Sales", description: "Owns customers, deals and quotes" },
  { value: "member", label: "Member", description: "Projects, tasks and time" },
  { value: "viewer", label: "Viewer", description: "Read-only" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  // Read the role from the signed token rather than inferring it from a failed
  // request — the old code guessed by matching the word "Admin" in an error
  // message, so any unrelated failure containing it flipped the whole UI.
  const currentRole = getCurrentUser()?.role ?? "";
  const isAdmin = currentRole === "admin" || currentRole === "owner";
  const isOwner = currentRole === "owner";
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "member", password: "" });
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamUser | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  usePageTitle("Settings");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listUsers();
      setUsers(result.users);
    } catch (err) {
      // A non-admin simply has no team list; anything else is worth surfacing.
      if (!/admin access/i.test((err as Error).message)) {
        toast({ title: "Failed to load team", description: (err as Error).message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api.createUser(invite);
      setInviteOpen(false);
      setInvite({ name: "", email: "", role: "member", password: "" });
      toast({ title: "Team member added" });
      loadUsers();
    } catch (err) {
      toast({ title: "Could not add member", description: (err as Error).message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(user: TeamUser, role: string) {
    try {
      await api.setUserRole(user.id, role);
      toast({ title: `${user.name} is now ${role}` });
      loadUsers();
    } catch (err) {
      toast({ title: "Role change failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await api.deleteUser(removeTarget.id);
      toast({ title: `${removeTarget.name} removed` });
      setRemoveTarget(null);
      loadUsers();
    } catch (err) {
      toast({ title: "Remove failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setChangingPw(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      // The change revoked every session for this account, this one included —
      // that is the point of it. Send the user to sign in with the new password
      // rather than leaving them clicking on a token the API now rejects.
      toast({ title: "Password updated — please sign in again" });
      clearToken();
      router.push("/login");
    } catch (err) {
      toast({ title: "Password change failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Team members and your account</p>
      </div>

      <BrandingCard canEdit={isAdmin} />

      {isAdmin && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Team</CardTitle>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add member
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ul className="divide-y divide-border">
                {users.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label={`Role for ${user.name}`}
                      >
                        {ROLES.filter((r) => !r.ownerOnly || isOwner).map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(user)} aria-label={`Remove ${user.name}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-4 w-4 text-primary" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="grid gap-4 sm:max-w-sm">
            <div>
              <Label htmlFor="pw-current">Current password</Label>
              <Input id="pw-current" type="password" className="mt-1.5" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="pw-next">New password</Label>
              <Input id="pw-next" type="password" className="mt-1.5" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} />
            </div>
            <div>
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input id="pw-confirm" type="password" className="mt-1.5" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} />
            </div>
            <Button type="submit" disabled={changingPw} className="justify-self-start">
              {changingPw ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>They can sign in immediately with the password you set.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="grid gap-4">
            <div>
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" className="mt-1.5" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" className="mt-1.5" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="inv-role">Role</Label>
              <select
                id="inv-role"
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              >
                {ROLES.filter((r) => !r.ownerOnly || isOwner).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="inv-password">Temporary password</Label>
              <Input id="inv-password" type="password" className="mt-1.5" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} required minLength={8} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviting}>{inviting ? "Adding…" : "Add member"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>They will lose access immediately. Records they created are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
