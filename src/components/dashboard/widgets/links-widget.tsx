"use client";

import { useState } from "react";
import { WidgetCard } from "../widget-card";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { normalizeUrl } from "@/lib/utils";
import { Link2, Plus, X, ExternalLink } from "lucide-react";

export function LinksWidget() {
  const links = useWorkspaceStore((s) => s.quickLinks);
  const addQuickLink = useWorkspaceStore((s) => s.addQuickLink);
  const deleteQuickLink = useWorkspaceStore((s) => s.deleteQuickLink);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const save = () => {
    const clean = normalizeUrl(url);
    if (!clean) return;
    addQuickLink({ label: label.trim() || new URL(clean).hostname.replace("www.", ""), url: clean });
    setLabel("");
    setUrl("");
    setAdding(false);
  };

  return (
    <WidgetCard
      title="Quick links"
      icon={<Link2 className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => setAdding((a) => !a)}
          aria-label="Add quick link"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      {adding && (
        <div className="mb-2.5 space-y-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
            aria-label="Link label"
            className="h-8 w-full rounded-lg border hairline bg-transparent px-2.5 text-sm outline-none"
          />
          <div className="flex gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="https://…"
              aria-label="Link URL"
              className="h-8 min-w-0 flex-1 rounded-lg border hairline bg-transparent px-2.5 text-sm outline-none"
            />
            <button
              className="press h-8 shrink-0 rounded-lg px-3 text-xs font-semibold text-[var(--accent-fg)]"
              style={{ background: "var(--accent)" }}
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {links.length === 0 && !adding ? (
        <p className="py-3 text-center text-xs text-muted-c">Add the sites you open every day.</p>
      ) : (
        <ul className="space-y-0.5">
          {links.map((l) => (
            <li key={l.id} className="group/link flex items-center">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase"
                  style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
                  aria-hidden="true"
                >
                  {l.label.slice(0, 2)}
                </span>
                <span className="min-w-0 truncate">{l.label}</span>
                <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-c opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden="true" />
              </a>
              <button
                className="press ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-c opacity-0 transition-opacity hover:text-[var(--negative)] focus-visible:opacity-100 group-hover/link:opacity-100"
                onClick={() => deleteQuickLink(l.id)}
                aria-label={`Remove ${l.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
