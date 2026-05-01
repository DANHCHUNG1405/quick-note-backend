import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export type NoteSharedEmailPayload = {
  to: string;
  noteTitle: string;
  sharedByName: string;
  recipientName?: string | null;
};

@Injectable()
export class NotificationsEmailService {
  private readonly logger = new Logger(NotificationsEmailService.name);
  private transporter: Transporter | null = null;
  private warnedMissingConfig = false;

  async sendNoteSharedEmail(payload: NoteSharedEmailPayload): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return;
    }

    const from = process.env.SMTP_FROM ?? 'no-reply@quicknote.local';
    const appUrl = process.env.APP_URL?.trim();

    const recipientName = payload.recipientName?.trim() || 'there';
    const sharedByName = payload.sharedByName.trim() || 'Someone';

    const subject = `${sharedByName} shared a note with you`;
    const noteLine = `Note: ${payload.noteTitle}`;
    const bodyLines = [
      `Hi ${recipientName},`,
      '',
      `${sharedByName} shared a note with you in QuickNote.`,
      noteLine,
    ];

    if (appUrl) {
      bodyLines.push('', `Open QuickNote: ${appUrl}`);
    }

    bodyLines.push('', 'Thanks,', 'QuickNote');

    const text = bodyLines.join('\n');

    const htmlLines = [
      `<p>Hi ${this.escapeHtml(recipientName)},</p>`,
      `<p>${this.escapeHtml(sharedByName)} shared a note with you in QuickNote.</p>`,
      `<p><strong>Note:</strong> ${this.escapeHtml(payload.noteTitle)}</p>`,
    ];

    if (appUrl) {
      htmlLines.push(
        `<p><a href="${this.escapeHtml(appUrl)}">Open QuickNote</a></p>`,
      );
    }

    htmlLines.push('<p>Thanks,<br/>QuickNote</p>');

    try {
      await transporter.sendMail({
        from,
        to: payload.to,
        subject,
        text,
        html: htmlLines.join(''),
      });
    } catch (error) {
      this.logger.warn(
        'Failed to send share email',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();

    if (!host || !portValue) {
      if (!this.warnedMissingConfig) {
        this.logger.warn('SMTP not configured: missing SMTP_HOST/SMTP_PORT');
        this.warnedMissingConfig = true;
      }
      return null;
    }

    const port = Number(portValue);
    if (!Number.isFinite(port) || port <= 0) {
      this.logger.warn('SMTP not configured: invalid SMTP_PORT');
      return null;
    }

    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      (process.env.SMTP_SECURE !== 'false' && port === 465);

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
