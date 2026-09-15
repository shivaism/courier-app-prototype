// Minimal customer-inquiry service: customers submit a message against a tracking number,
// admin/ops views and resolves them with a reply. Deliberately small (no attachments, no
// threading) to give ops a working console fast; can grow later if actually needed.

import type Database from "better-sqlite3";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_REPLY_LENGTH = 1000;

export interface Inquiry {
  id: number;
  trackingNumber: string;
  message: string;
  status: "open" | "resolved";
  reply: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreateInquiryInput {
  trackingNumber: string;
  message: string;
}

export class InquiryService {
  constructor(private db: Database.Database) {}

  createInquiry(input: CreateInquiryInput): Inquiry {
    const trackingNumber = input.trackingNumber?.trim();
    const message = input.message?.trim();

    if (!trackingNumber || !message) {
      throw new ValidationError("trackingNumber and message are required");
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    }

    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO customer_inquiries (trackingNumber, message, status, createdAt)
         VALUES (?, ?, 'open', ?)`
      )
      .run(trackingNumber, message, now);

    return this.getInquiryById(Number(result.lastInsertRowid))!;
  }

  listInquiries(status?: "open" | "resolved"): Inquiry[] {
    const rows = status
      ? this.db.prepare(`SELECT * FROM customer_inquiries WHERE status = ? ORDER BY createdAt DESC`).all(status)
      : this.db.prepare(`SELECT * FROM customer_inquiries ORDER BY status ASC, createdAt DESC`).all();
    return rows as Inquiry[];
  }

  getInquiryById(id: number): Inquiry | null {
    const row = this.db.prepare(`SELECT * FROM customer_inquiries WHERE id = ?`).get(id);
    return (row as Inquiry) ?? null;
  }

  resolveInquiry(id: number, reply: string): Inquiry {
    const inquiry = this.getInquiryById(id);
    if (!inquiry) throw new NotFoundError(`Inquiry ${id} not found`);

    const trimmed = reply?.trim();
    if (!trimmed) throw new ValidationError("reply is required");
    if (trimmed.length > MAX_REPLY_LENGTH) {
      throw new ValidationError(`reply must be ${MAX_REPLY_LENGTH} characters or fewer`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE customer_inquiries SET status = 'resolved', reply = ?, resolvedAt = ? WHERE id = ?`)
      .run(trimmed, now, id);

    return this.getInquiryById(id)!;
  }
}
