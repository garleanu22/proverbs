import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ProcessingStatus } from "@/components/processing-status";
import { ResultsPreview } from "@/components/results-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Book, FileText, Tags, FileSpreadsheet, Languages } from "lucide-react";
import type { ProverbExtractionResult } from "@shared/schema";

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<{id: number, name: string, pageRange: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ProverbExtractionResult | null>(null);
  const [outputFormat, setOutputFormat] = useState("xlsx");
  const [fileName, setFileName] = useState("proverbe_extrase");
  const [openAfterProcessing, setOpenAfterProcessing] = useState(true);
  const [includeCodeSheet, setIncludeCodeSheet] = useState(true);

  const handleFileUploaded = (file: {id: number, name: string, pageRange: string}) => {
    setUploadedFile(file);
    setResults(null);
  };

  const handleProcessingComplete = (result: ProverbExtractionResult) => {
    setResults(result);
    setIsProcessing(false);
    
    if (openAfterProcessing) {
      // Trigger download
      const link = document.createElement('a');
      link.href = `/api/download/${result.outputFilename}`;
      link.download = result.outputFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const startProcessing = () => {
    if (!uploadedFile) return;
    setIsProcessing(true);
  };

  const resetProcess = () => {
    setUploadedFile(null);
    setResults(null);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-primary rounded-lg p-2">
                <Book className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary">Romanian Proverb Extractor</h1>
                <p className="text-slate-600 text-sm">Extract and analyze proverbs from PDF documents</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-lg">
              <Languages className="text-primary w-4 h-4" />
              <span className="text-sm font-medium text-slate-700">Romanian Language Support</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Processing Steps */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-secondary mb-4">Processing Pipeline</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="bg-primary/10 rounded-full p-2">
                    <FileText className="text-primary w-4 h-4" />
                  </div>
                  <span className="font-medium text-secondary">1. PDF Upload</span>
                </div>
                <p className="text-sm text-slate-600">Upload Romanian text PDF files for processing</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="bg-accent/10 rounded-full p-2">
                    <FileText className="text-accent w-4 h-4" />
                  </div>
                  <span className="font-medium text-secondary">2. Text Extraction</span>
                </div>
                <p className="text-sm text-slate-600">Extract and parse proverbs from document content</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="bg-warning/10 rounded-full p-2">
                    <Tags className="text-warning w-4 h-4" />
                  </div>
                  <span className="font-medium text-secondary">3. POS Tagging</span>
                </div>
                <p className="text-sm text-slate-600">Analyze parts of speech with color coding system</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="bg-emerald-500/10 rounded-full p-2">
                    <FileSpreadsheet className="text-emerald-500 w-4 h-4" />
                  </div>
                  <span className="font-medium text-secondary">4. Excel Export</span>
                </div>
                <p className="text-sm text-slate-600">Generate structured Excel file with analysis</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* File Upload Section */}
          <div className="lg:col-span-2">
            <Card className="shadow-sm border border-slate-200">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-secondary mb-6">Upload PDF Documents</h3>
                
                <FileUpload onFileUploaded={handleFileUploaded} uploadedFile={uploadedFile} />
                
                {uploadedFile && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Button 
                          onClick={startProcessing}
                          disabled={isProcessing}
                          className="flex items-center space-x-2"
                        >
                          <span>Start Processing</span>
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={resetProcess}
                          disabled={isProcessing}
                        >
                          Clear All
                        </Button>
                      </div>
                      <div className="text-sm text-slate-600">
                        1 file ready for processing
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Configuration Panel */}
          <div className="lg:col-span-1">
            <Card className="shadow-sm border border-slate-200">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-secondary mb-6">Processing Configuration</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-secondary mb-2">Output Format</Label>
                    <Select value={outputFormat} onValueChange={setOutputFormat}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                        <SelectItem value="csv">CSV (.csv)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-secondary mb-2">File Naming</Label>
                    <Input 
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="proverbe_extrase"
                    />
                    <p className="text-xs text-slate-500 mt-1">Auto-versioning enabled to prevent overwrites</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="open-after"
                      checked={openAfterProcessing}
                      onCheckedChange={(checked) => setOpenAfterProcessing(checked as boolean)}
                    />
                    <Label htmlFor="open-after" className="text-sm text-secondary">Open file after processing</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="include-code"
                      checked={includeCodeSheet}
                      onCheckedChange={(checked) => setIncludeCodeSheet(checked as boolean)}
                    />
                    <Label htmlFor="include-code" className="text-sm text-secondary">Include code documentation sheet</Label>
                  </div>
                </div>

                {/* POS Tagging Info */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h4 className="font-medium text-secondary mb-3">Part-of-Speech Tagging</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Substantive</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">s1, s2, s3...</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Adjective</span>
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">a1, a2, a3...</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Verbe</span>
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">v1, v2, v3...</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Pronume</span>
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">p1, p2, p3...</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      Color coding enables translation alignment
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Processing Status */}
        {isProcessing && uploadedFile && (
          <ProcessingStatus 
            documentId={uploadedFile.id}
            config={{
              outputFormat,
              outputFilename: fileName,
              includeCodeSheet,
              openAfterProcessing,
            }}
            onComplete={handleProcessingComplete}
          />
        )}

        {/* Results Preview */}
        {results && (
          <ResultsPreview results={results} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Romanian Proverb Extractor v1.0 - Advanced NLP Processing
            </div>
            <div className="flex items-center space-x-4 text-sm text-slate-600">
              <span>Supports Romanian Language</span>
              <span>•</span>
              <span>PDF to Excel Processing</span>
              <span>•</span>
              <span>Part-of-Speech Analysis</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
