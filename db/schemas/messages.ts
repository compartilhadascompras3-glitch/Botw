import { pgTable, text, boolean, bigint, integer } from 'drizzle-orm/pg-core'

export const messages = pgTable('messages', {
  id:           text('id').primaryKey(),
  text:         text('text').notNull().default(''),
  mediaDataUrl: text('media_data_url'),
  mediaName:    text('media_name'),
  mediaType:    text('media_type'),
  sendOnce:     boolean('send_once').notNull().default(false),
  sortOrder:    integer('sort_order').notNull().default(0),
  createdAt:    bigint('created_at', { mode: 'number' }).notNull(),
})
