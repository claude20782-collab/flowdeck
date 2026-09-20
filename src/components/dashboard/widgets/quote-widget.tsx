"use client";

import { useMemo, useState } from "react";
import { WidgetCard } from "../widget-card";
import { QUOTES, quoteOfDay } from "@/lib/quotes";
import { todayKey } from "@/lib/utils";
import { RefreshCw, Quote as QuoteIcon } from "lucide-react";

export function QuoteWidget() {
  const [offset, setOffset] = useState(0);

  const quote = useMemo(() => {
    if (offset === 0) return quoteOfDay(todayKey());
    let h = 0;
    const key = `${todayKey()}#${offset}`;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return QUOTES[h % QUOTES.length];
  }, [offset]);

  return (
    <WidgetCard
      title="Quote of the day"
      icon={<QuoteIcon className="h-4 w-4" />}
      actions={
        <button
          className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-c transition-colors hover:text-[var(--text)]"
          onClick={() => setOffset((o) => o + 1)}
          aria-label="Show another quote"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      }
    >
      <blockquote className="min-h-[72px] py-1">
        <p className="text-[15px] leading-relaxed">“{quote.text}”</p>
        <footer className="mt-2.5 text-xs font-medium text-muted-c">— {quote.author}</footer>
      </blockquote>
    </WidgetCard>
  );
}
