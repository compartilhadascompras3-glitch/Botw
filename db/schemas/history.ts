import { pgTable, text, boolean, bigint, jsonb } from 'drizzle-orm/pg-core'

export const history = pgTable('history', {
  id:          text('id').primaryKey(),
  messageId:   text('message_id').notNull(),
  messageText: text('message_text').notNull().default(''),
  hasMedia:    boolean('has_media').notNull().default(false),
  targets:     jsonb('targets').notNull().default([]),
  sentAt:      bigint('sent_at', { mode: 'number' }).notNull(),
})
