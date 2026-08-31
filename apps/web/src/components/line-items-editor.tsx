"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function linesSubtotal(lines: LineItem[]): number {
  return lines.reduce((acc, l) => acc + (Number.isFinite(l.amount) ? l.amount : 0), 0);
}

export function normalizeLines(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((l) => {
    const line = (l ?? {}) as Partial<LineItem>;
    const quantity = Number(line.quantity ?? 1);
    const unitPrice = Number(line.unitPrice ?? 0);
    return {
      description: String(line.description ?? ""),
      quantity,
      unitPrice,
      amount: Number(line.amount ?? quantity * unitPrice),
    };
  });
}

/** Read-only line items table for detail views. */
export function LineItemsView({ value }: { value: unknown }) {
  const lines = normalizeLines(value);
  if (lines.length === 0) return <span className="text-sm text-muted-foreground">No line items</span>;
  return (
    <div className="scrollbar-thin max-h-[45vh] overflow-auto overscroll-contain rounded-lg border border-border/80">
      <table className="w-full text-sm">
        <thead className="sticky-table-header">
          <tr className="border-b border-border/80 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 text-right font-semibold">Unit</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">{line.description || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
              <td className="px-3 py-2 text-right tabular-nums">{currency.format(line.unitPrice)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{currency.format(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Editable line items with auto-computed amounts and subtotal. */
export function LineItemsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (lines: LineItem[], subtotal: number) => void;
}) {
  const lines = normalizeLines(value);

  function update(index: number, patch: Partial<LineItem>) {
    const next = lines.map((line, i) => {
      if (i !== index) return line;
      const merged = { ...line, ...patch };
      // Amount follows qty × unit unless the user edited amount directly
      if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
        merged.amount = Number((merged.quantity * merged.unitPrice).toFixed(2));
      }
      return merged;
    });
    onChange(next, linesSubtotal(next));
  }

  function addLine() {
    const next = [...lines, { description: "", quantity: 1, unitPrice: 0, amount: 0 }];
    onChange(next, linesSubtotal(next));
  }

  function removeLine(index: number) {
    const next = lines.filter((_, i) => i !== index);
    onChange(next, linesSubtotal(next));
  }

  return (
    <div className="mt-1.5 space-y-2">
      <div className="scrollbar-thin max-h-[45vh] overflow-auto overscroll-contain rounded-lg border border-border/80">
        <table className="w-full text-sm">
          <thead className="sticky-table-header">
            <tr className="border-b border-border/80 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left font-semibold">Description</th>
              <th className="w-16 px-2 py-2 text-right font-semibold">Qty</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">Unit price</th>
              <th className="w-24 px-2 py-2 text-right font-semibold">Amount</th>
              <th className="w-9 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No line items yet
                </td>
              </tr>
            )}
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-1 py-1">
                  <input
                    value={line.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder="What is this for?"
                    className="w-full rounded bg-transparent px-2 py-1.5 text-sm focus:bg-muted/40 focus:outline-none"
                    aria-label={`Line ${i + 1} description`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                    className="w-full rounded bg-transparent px-2 py-1.5 text-right text-sm tabular-nums focus:bg-muted/40 focus:outline-none"
                    aria-label={`Line ${i + 1} quantity`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
                    className="w-full rounded bg-transparent px-2 py-1.5 text-right text-sm tabular-nums focus:bg-muted/40 focus:outline-none"
                    aria-label={`Line ${i + 1} unit price`}
                  />
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-sm font-medium">
                  {currency.format(line.amount)}
                </td>
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add line
        </Button>
        <span className="text-sm text-muted-foreground">
          Subtotal <strong className="tabular-nums text-foreground">{currency.format(linesSubtotal(lines))}</strong>
        </span>
      </div>
    </div>
  );
}
