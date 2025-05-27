import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function extractPageFromFilename(filename: string): string {
  const match = filename.match(/(\d+(?:-\d+)?)/);
  return match ? match[1] : "1";
}

export function generateVersionedFilename(baseName: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${baseName}_${timestamp}${extension}`;
}
