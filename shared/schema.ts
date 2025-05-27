import { pgTable, text, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  pageRange: text("page_range"),
  processedAt: text("processed_at").notNull(),
  status: text("status").notNull().default("processing"), // processing, completed, error
});

export const proverbs = pgTable("proverbs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  pageNumber: text("page_number").notNull(),
  proverbNumber: integer("proverb_number").notNull(),
  text: text("text").notNull(),
  posTags: jsonb("pos_tags").$type<Array<{word: string, tag: string, index: number}>>(),
});

export const processedFiles = pgTable("processed_files", {
  id: serial("id").primaryKey(),
  originalName: text("original_name").notNull(),
  outputFilename: text("output_filename").notNull(),
  documentId: integer("document_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  processedAt: true,
});

export const insertProverbSchema = createInsertSchema(proverbs).omit({
  id: true,
});

export const insertProcessedFileSchema = createInsertSchema(processedFiles).omit({
  id: true,
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Proverb = typeof proverbs.$inferSelect;
export type InsertProverb = z.infer<typeof insertProverbSchema>;
export type ProcessedFile = typeof processedFiles.$inferSelect;
export type InsertProcessedFile = z.infer<typeof insertProcessedFileSchema>;

// Processing request/response types
export const processingRequestSchema = z.object({
  filename: z.string(),
  outputFormat: z.enum(["xlsx", "csv"]).default("xlsx"),
  outputFilename: z.string().default("proverbe_extrase"),
  includeCodeSheet: z.boolean().default(true),
  openAfterProcessing: z.boolean().default(true),
});

export type ProcessingRequest = z.infer<typeof processingRequestSchema>;

export const proverbExtractionResultSchema = z.object({
  documentId: z.number(),
  extractedProverbs: z.array(z.object({
    pageNumber: z.string(),
    proverbNumber: z.number(),
    text: z.string(),
    posTags: z.array(z.object({
      word: z.string(),
      tag: z.string(),
      index: z.number(),
    })),
  })),
  outputFilename: z.string(),
  totalProverbs: z.number(),
});

export type ProverbExtractionResult = z.infer<typeof proverbExtractionResultSchema>;
