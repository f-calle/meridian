"use client";

import Link from "next/link";
import { Building2, Mail, Phone, CalendarDays, Package, Tag } from "lucide-react";
import { RelationLabel } from "@/components/relation-field";
import { StatusBadge, isStatusValue } from "@/components/status-badge";
import { formatFieldValue, recordLabel, type EntityField } from "@/lib/entity-ui";
import { cn } from "@/lib/utils";

/**
 * Records as cards.
 *
 * A table renders every entity identically, which is efficient and tells you
 * nothing: a contact and a deal are different objects you scan for different
 * reasons — "when did I last speak to this person" versus "is this one
 * slipping" — and a grid of cells answers neither. Each card here is shaped
 * around the question its entity is usually asked.
 *
 * The table is still there, and still the right form for financial documents
 * where you compare figures down a column. This is the default for the entities
 * people browse rather than reconcile.
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Entities whose card view is the more useful default. */
export const CARD_DEFAULT_ENTITIES = new Set(["contact", "company", "deal", "product", "project"]);

function initials(record: Record<string, unknown>): string {
  const first = String(record.firstName ?? "").trim();
  const last = String(record.lastName ?? "").trim();
  if (first || last) return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
  const name = String(record.name ?? record.title ?? "?").trim();
  return name.slice(0, 2).toUpperCase() || "?";
}

function formatDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CardShell({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "glass-card group flex flex-col gap-3 rounded-xl border border-border/70 p-4 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transform-none touch-manipulation",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** A muted line of supporting detail; renders nothing when there is no value. */
function Line({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function ContactCard({ record, href }: { record: Record<string, unknown>; href: string }) {
  return (
    <CardShell href={href}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {initials(record)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-primary">{recordLabel(record)}</p>
          {record.title ? (
            <p className="truncate text-xs text-muted-foreground">{String(record.title)}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {record.companyId ? (
          <Line icon={Building2}>
            <RelationLabel entity="company" id={String(record.companyId)} />
          </Line>
        ) : null}
        <Line icon={Mail}>{record.email ? String(record.email) : null}</Line>
        <Line icon={Phone}>{record.phone ? String(record.phone) : null}</Line>
      </div>
    </CardShell>
  );
}

function CompanyCard({ record, href }: { record: Record<string, unknown>; href: string }) {
  return (
    <CardShell href={href}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
          aria-hidden="true"
        >
          {initials(record)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-primary">{recordLabel(record)}</p>
          {record.industry ? (
            <p className="truncate text-xs capitalize text-muted-foreground">
              {String(record.industry).replace(/_/g, " ")}
            </p>
          ) : null}
        </div>
        {record.size ? (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {String(record.size)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Line icon={Mail}>{record.email ? String(record.email) : null}</Line>
        <Line icon={Phone}>{record.phone ? String(record.phone) : null}</Line>
      </div>
    </CardShell>
  );
}

function DealCard({ record, href }: { record: Record<string, unknown>; href: string }) {
  const value = Number(record.value ?? 0);
  const close = formatDate(record.expectedClose);
  const closed = ["won", "lost"].includes(String(record.stage));
  // A closed deal has an outcome, not a forecast. "Win probability 100%" on a
  // won deal is noise, and on a lost one the bar disappears entirely — showing
  // it for either invites the reader to compare things that aren't comparable.
  const probability = closed ? 0 : Number(record.probability ?? 0);
  // Past its close date while still open is the state worth spotting from a
  // list, so it gets said in words rather than left to the reader to work out.
  const overdue =
    !closed && record.expectedClose && new Date(String(record.expectedClose)) < new Date();

  return (
    <CardShell href={href}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium leading-snug group-hover:text-primary">
          {recordLabel(record)}
        </p>
        {isStatusValue(record.stage) && <StatusBadge value={String(record.stage)} />}
      </div>

      <p className="text-2xl font-bold tabular-nums tracking-tight">{currency.format(value)}</p>

      <div className="flex flex-col gap-1">
        {record.companyId ? (
          <Line icon={Building2}>
            <RelationLabel entity="company" id={String(record.companyId)} />
          </Line>
        ) : null}
        <Line icon={CalendarDays}>
          {close ? (overdue ? `${close} · past due` : close) : null}
        </Line>
      </div>

      {probability > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Win probability</span>
            <span className="tabular-nums">{probability}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, probability)}%`, background: "var(--viz-series-1)" }}
              role="presentation"
            />
          </div>
        </div>
      )}
    </CardShell>
  );
}

function ProductCard({ record, href }: { record: Record<string, unknown>; href: string }) {
  return (
    <CardShell href={href}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium leading-snug group-hover:text-primary">
          {recordLabel(record)}
        </p>
        {record.active === false && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Inactive
          </span>
        )}
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight">
        {currency.format(Number(record.price ?? 0))}
        {record.unit ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            / {String(record.unit)}
          </span>
        ) : null}
      </p>
      <div className="flex flex-col gap-1">
        <Line icon={Tag}>{record.sku ? String(record.sku) : null}</Line>
        <Line icon={Package}>
          {record.cost ? `Cost ${currency.format(Number(record.cost))}` : null}
        </Line>
      </div>
    </CardShell>
  );
}

function ProjectCard({ record, href }: { record: Record<string, unknown>; href: string }) {
  const deadline = formatDate(record.deadline);
  return (
    <CardShell href={href}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium leading-snug group-hover:text-primary">
          {recordLabel(record)}
        </p>
        {isStatusValue(record.status) && <StatusBadge value={String(record.status)} />}
      </div>
      {record.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{String(record.description)}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        {record.companyId ? (
          <Line icon={Building2}>
            <RelationLabel entity="company" id={String(record.companyId)} />
          </Line>
        ) : null}
        <Line icon={CalendarDays}>{deadline ? `Due ${deadline}` : null}</Line>
        {record.budget ? (
          <Line icon={Tag}>{`Budget ${currency.format(Number(record.budget))}`}</Line>
        ) : null}
      </div>
    </CardShell>
  );
}

/** Fallback for entities with no bespoke card: label plus a few fields. */
function GenericCard({
  record,
  href,
  fields,
}: {
  record: Record<string, unknown>;
  href: string;
  fields: EntityField[];
}) {
  const shown = fields
    .filter((f) => f.type !== "text" && f.type !== "json" && record[f.name] != null)
    .slice(0, 4);
  return (
    <CardShell href={href}>
      <p className="font-medium leading-snug group-hover:text-primary">{recordLabel(record)}</p>
      <dl className="flex flex-col gap-1">
        {shown.map((field) => (
          <div key={field.name} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
            <dd className="truncate text-right">
              {isStatusValue(record[field.name]) ? (
                <StatusBadge value={String(record[field.name])} />
              ) : field.relation ? (
                <RelationLabel entity={field.relation} id={String(record[field.name])} />
              ) : (
                formatFieldValue(record[field.name], field.type)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </CardShell>
  );
}

export function RecordCard({
  entity,
  record,
  fields,
}: {
  entity: string;
  record: Record<string, unknown>;
  fields: EntityField[];
}) {
  const href = `/entities/${entity}/${String(record.id)}`;
  switch (entity) {
    case "contact":
      return <ContactCard record={record} href={href} />;
    case "company":
      return <CompanyCard record={record} href={href} />;
    case "deal":
      return <DealCard record={record} href={href} />;
    case "product":
      return <ProductCard record={record} href={href} />;
    case "project":
      return <ProjectCard record={record} href={href} />;
    default:
      return <GenericCard record={record} href={href} fields={fields} />;
  }
}
