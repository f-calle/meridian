import { defineEntity, field } from "@meridian/core";


/**
 * Line items on quotes/invoices are stored as a JSON array:
 * [{ description, quantity, unitPrice, amount, productId? }]
 * The web app renders a dedicated line-items editor for fields named "lines".
 */
export const ProductEntity = defineEntity({
  name: "product",
  sensitivity: "finance",
  label: "Product",
  pluralLabel: "Products",
  externalId: true,
  fields: {
    name: field.string({ required: true, label: "Product Name" }),
    sku: field.string({ label: "SKU" }),
    price: field.currency({ label: "Sale Price", default: 0 }),
    cost: field.currency({ label: "Cost" }),
    unit: field.string({ label: "Unit", default: "each" }),
    active: field.boolean({ label: "Active", default: true }),
    description: field.text({ label: "Description" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const QuoteEntity = defineEntity({
  name: "quote",
  // A quote is a selling document the rep owns. An invoice is money owed and is not.
  sensitivity: "crm",
  label: "Quote",
  pluralLabel: "Quotes",
  externalId: true,
  fields: {
    number: field.string({ required: true, label: "Quote #" }),
    status: field.select(["draft", "sent", "accepted", "declined", "expired"], {
      required: true,
      label: "Status",
      default: "draft",
    }),
    companyId: field.relation("company", { label: "Company" }),
    contactId: field.relation("contact", { label: "Contact" }),
    dealId: field.relation("deal", { label: "Deal" }),
    issueDate: field.date({ label: "Issue Date" }),
    expiryDate: field.date({ label: "Valid Until" }),
    lines: field.json({ label: "Line Items", default: [] }),
    subtotal: field.currency({ label: "Subtotal", default: 0 }),
    tax: field.currency({ label: "Tax", default: 0 }),
    total: field.currency({ label: "Total", default: 0 }),
    notes: field.text({ label: "Notes" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const InvoiceEntity = defineEntity({
  name: "invoice",
  sensitivity: "finance",
  label: "Invoice",
  pluralLabel: "Invoices",
  externalId: true,
  fields: {
    number: field.string({ required: true, label: "Invoice #" }),
    status: field.select(["draft", "sent", "paid", "partial", "overdue", "cancelled"], {
      required: true,
      label: "Status",
      default: "draft",
    }),
    companyId: field.relation("company", { label: "Company" }),
    contactId: field.relation("contact", { label: "Contact" }),
    issueDate: field.date({ label: "Issue Date" }),
    dueDate: field.date({ label: "Due Date" }),
    lines: field.json({ label: "Line Items", default: [] }),
    subtotal: field.currency({ label: "Subtotal", default: 0 }),
    tax: field.currency({ label: "Tax", default: 0 }),
    total: field.currency({ label: "Total", default: 0 }),
    notes: field.text({ label: "Notes" }),
  },
  lifecycle: {
    onCreate: ["audit.log"],
    onUpdate: ["audit.log"],
  },
});

export const commerceEntities = [ProductEntity, QuoteEntity, InvoiceEntity];
