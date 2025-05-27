import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CloudUpload, FolderOpen, FileText, X } from "lucide-react";

interface FileUploadProps {
  onFileUploaded: (file: {id: number, name: string, pageRange: string}) => void;
  uploadedFile: {id: number, name: string, pageRange: string} | null;
}

export function FileUpload({ onFileUploaded, uploadedFile }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await apiRequest('POST', '/api/upload', formData);
      return response.json();
    },
    onSuccess: (data) => {
      onFileUploaded({
        id: data.documentId,
        name: data.filename,
        pageRange: data.pageRange,
      });
      toast({
        title: "File uploaded successfully",
        description: `${data.filename} is ready for processing`,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    );
    
    if (files.length > 0) {
      uploadMutation.mutate(files[0]);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload PDF files only",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const removeFile = () => {
    onFileUploaded({id: 0, name: '', pageRange: ''});
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-slate-300 hover:border-primary hover:bg-primary/5'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="mb-4">
          <CloudUpload className="mx-auto h-12 w-12 text-slate-400" />
        </div>
        <h4 className="text-lg font-medium text-secondary mb-2">Drop PDF files here</h4>
        <p className="text-slate-600 mb-4">or click to browse files</p>
        <Button 
          variant="default" 
          className="flex items-center space-x-2"
          disabled={uploadMutation.isPending}
        >
          <FolderOpen className="w-4 h-4" />
          <span>{uploadMutation.isPending ? 'Uploading...' : 'Choose Files'}</span>
        </Button>
        <p className="text-xs text-slate-500 mt-3">Supports PDF files up to 50MB</p>
      </div>

      {uploadedFile && uploadedFile.name && (
        <div className="mt-6">
          <h4 className="font-medium text-secondary mb-3">Uploaded Files</h4>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <FileText className="text-red-500 w-5 h-5" />
              <div>
                <p className="font-medium text-secondary">{uploadedFile.name}</p>
                <p className="text-sm text-slate-600">
                  Page {uploadedFile.pageRange} • Ready for processing
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-accent text-white text-xs px-2 py-1 rounded">Ready</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={removeFile}
                className="text-slate-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
