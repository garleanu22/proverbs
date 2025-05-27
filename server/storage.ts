import { documents, proverbs, processedFiles, type Document, type InsertDocument, type Proverb, type InsertProverb, type ProcessedFile, type InsertProcessedFile } from "@shared/schema";

export interface IStorage {
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: number): Promise<Document | undefined>;
  updateDocumentStatus(id: number, status: string): Promise<void>;
  
  // Proverb operations
  createProverb(proverb: InsertProverb): Promise<Proverb>;
  getProverbsByDocument(documentId: number): Promise<Proverb[]>;
  
  // Processed file operations
  createProcessedFile(file: InsertProcessedFile): Promise<ProcessedFile>;
  getProcessedFilesByDocument(documentId: number): Promise<ProcessedFile[]>;
  getAllProcessedFiles(): Promise<ProcessedFile[]>;
}

export class MemStorage implements IStorage {
  private documents: Map<number, Document>;
  private proverbs: Map<number, Proverb>;
  private processedFiles: Map<number, ProcessedFile>;
  private currentDocumentId: number;
  private currentProverbId: number;
  private currentFileId: number;

  constructor() {
    this.documents = new Map();
    this.proverbs = new Map();
    this.processedFiles = new Map();
    this.currentDocumentId = 1;
    this.currentProverbId = 1;
    this.currentFileId = 1;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.currentDocumentId++;
    const document: Document = {
      ...insertDocument,
      id,
      processedAt: new Date().toISOString(),
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async updateDocumentStatus(id: number, status: string): Promise<void> {
    const document = this.documents.get(id);
    if (document) {
      document.status = status;
      this.documents.set(id, document);
    }
  }

  async createProverb(insertProverb: InsertProverb): Promise<Proverb> {
    const id = this.currentProverbId++;
    const proverb: Proverb = { ...insertProverb, id };
    this.proverbs.set(id, proverb);
    return proverb;
  }

  async getProverbsByDocument(documentId: number): Promise<Proverb[]> {
    return Array.from(this.proverbs.values()).filter(
      (proverb) => proverb.documentId === documentId,
    );
  }

  async createProcessedFile(insertFile: InsertProcessedFile): Promise<ProcessedFile> {
    const id = this.currentFileId++;
    const file: ProcessedFile = { ...insertFile, id };
    this.processedFiles.set(id, file);
    return file;
  }

  async getProcessedFilesByDocument(documentId: number): Promise<ProcessedFile[]> {
    return Array.from(this.processedFiles.values()).filter(
      (file) => file.documentId === documentId,
    );
  }

  async getAllProcessedFiles(): Promise<ProcessedFile[]> {
    return Array.from(this.processedFiles.values());
  }
}

export const storage = new MemStorage();
