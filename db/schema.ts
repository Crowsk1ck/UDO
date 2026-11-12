import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const state = sqliteTable('state', { id: text('id').primaryKey(), data: text('data').notNull(), revision: integer('revision').notNull().default(0) });

export const accounts = sqliteTable('accounts', {
 id: text('id').primaryKey(), username: text('username').notNull().unique(),
 passwordHash: text('password_hash').notNull(), salt: text('salt').notNull(),
 personId: text('person_id').notNull().unique(), active: integer('active').notNull().default(1),
 createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
 tokenHash: text('token_hash').primaryKey(), accountId: text('account_id').notNull(),
 adminKey: text('admin_key'), expiresAt: integer('expires_at').notNull(),
}, t => [index('sessions_account').on(t.accountId)]);
export const loginLimits = sqliteTable('login_limits', {
 key: text('key').primaryKey(), count: integer('count').notNull(), untilAt: integer('until_at').notNull(),
});
