"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useBranches } from "@/lib/use-branches";
import { Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";
import { EmptyState, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { tr } from "@/lib/tr";

/** The towns or areas the ISP runs, and how many routers, customers and staff are in each. */
export default function BranchesSettingsPage() {
  const queryClient = useQueryClient();
  const { branches } = useBranches();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["branches"] });

  const add = useMutation({
    mutationFn: () => apiFetch("/api/v1/branches", { method: "POST", body: JSON.stringify({ name, location: location || null }) }),
    onSuccess: () => {
      setName("");
      setLocation("");
      refresh();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not add the branch"),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiFetch(`/api/v1/branches/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not rename the branch"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/branches/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not delete the branch"),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{tr("Branches")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {tr("The towns or areas you run. Put routers, customers and staff in a branch to filter lists and analytics by it.")}
        </p>
      </div>

      <Card className="p-6">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            add.mutate();
          }}
        >
          <div>
            <Label htmlFor="branchName">{tr("Branch name")}</Label>
            <Input id="branchName" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Kasarani")} required minLength={2} />
          </div>
          <div>
            <Label htmlFor="branchLocation">{tr("Location (optional)")}</Label>
            <Input id="branchLocation" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={tr("e.g. Nairobi, Thika Road")} />
          </div>
          <Button type="submit" disabled={add.isPending || name.trim().length < 2}>
            {add.isPending ? "Adding…" : "Add branch"}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
        <HintText>
          A staff member&rsquo;s branch sets which branch their lists open on. It does not stop them seeing other branches; use roles for that.
        </HintText>
      </Card>

      <Card className="p-0">
        {branches.length === 0 ? (
          <EmptyState title={tr("No branches yet")}>{tr("If you run in one area only, you do not need any.")}</EmptyState>
        ) : (
          <TableShell minWidth={560}>
            <thead>
              <tr>
                <th className={th}>{tr("Branch")}</th>
                <th className={`${th} text-right`}>{tr("Routers")}</th>
                <th className={`${th} text-right`}>{tr("Customers")}</th>
                <th className={`${th} text-right`}>{tr("Staff")}</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">{tr("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className={td}>
                    <span className="font-medium text-white">{b.name}</span>
                    {b.location && <span className="block text-xs text-slate-500">{b.location}</span>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{b.routers}</td>
                  <td className={`${td} text-right tabular-nums`}>{b.customers}</td>
                  <td className={`${td} text-right tabular-nums`}>{b.staff}</td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      className={darkButton("ghost", "sm")}
                      onClick={() => {
                        const next = window.prompt("New name for this branch:", b.name);
                        if (next && next.trim() && next.trim() !== b.name) rename.mutate({ id: b.id, name: next.trim() });
                      }}
                    >
                      {tr("Rename")}
                    </button>
                    <button
                      type="button"
                      className={`${darkButton("ghost", "sm")} text-rose-300`}
                      onClick={() => confirm(`Delete ${b.name}? Its routers, customers and staff stay, with no branch.`) && remove.mutate(b.id)}
                    >
                      {tr("Delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}
