import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, Code, ExternalLink, RotateCcw } from "lucide-react";
import type { ProverbExtractionResult } from "@shared/schema";

interface ResultsPreviewProps {
  results: ProverbExtractionResult;
}

export function ResultsPreview({ results }: ResultsPreviewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
  const totalPages = Math.ceil(results.extractedProverbs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = results.extractedProverbs.slice(startIndex, endIndex);

  const downloadFile = (filename: string) => {
    const link = document.createElement('a');
    link.href = `/api/download/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPosTagColor = (tag: string) => {
    const prefix = tag.charAt(0);
    switch (prefix) {
      case 's': return 'bg-blue-100 text-blue-800';
      case 'a': return 'bg-green-100 text-green-800';
      case 'v': return 'bg-purple-100 text-purple-800';
      case 'p': return 'bg-yellow-100 text-yellow-800';
      case 'n': return 'bg-orange-100 text-orange-800';
      case 'art': return 'bg-pink-100 text-pink-800';
      case 'i': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      {/* Results Preview */}
      <div className="mt-8">
        <Card className="shadow-sm border border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-secondary">Extraction Results Preview</h3>
              <Button 
                onClick={() => downloadFile(results.outputFilename)}
                className="flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Excel</span>
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-4 py-3 text-left text-sm font-medium text-secondary">Page</th>
                    <th className="border border-slate-200 px-4 py-3 text-left text-sm font-medium text-secondary">Proverb #</th>
                    <th className="border border-slate-200 px-4 py-3 text-left text-sm font-medium text-secondary">Text</th>
                    <th className="border border-slate-200 px-4 py-3 text-left text-sm font-medium text-secondary">POS Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((proverb, index) => (
                    <tr key={startIndex + index} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-4 py-3 text-sm">{proverb.pageNumber}</td>
                      <td className="border border-slate-200 px-4 py-3 text-sm">{proverb.proverbNumber}</td>
                      <td className="border border-slate-200 px-4 py-3 text-sm">{proverb.text}</td>
                      <td className="border border-slate-200 px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {proverb.posTags.slice(0, 6).map((tag, tagIndex) => (
                            <Badge 
                              key={tagIndex}
                              variant="secondary"
                              className={`text-xs px-1 py-0.5 ${getPosTagColor(tag.tag)}`}
                            >
                              {tag.tag}:{tag.word}
                            </Badge>
                          ))}
                          {proverb.posTags.length > 6 && (
                            <Badge variant="outline" className="text-xs">
                              +{proverb.posTags.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>
                Showing {startIndex + 1}-{Math.min(endIndex, results.extractedProverbs.length)} of {results.totalProverbs} extracted proverbs
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span>Page {currentPage} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Options */}
      <div className="mt-8">
        <Card className="shadow-sm border border-slate-200">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-secondary mb-6">Export & Download</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card 
                className="border border-slate-200 hover:border-primary transition-colors cursor-pointer"
                onClick={() => downloadFile(results.outputFilename)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <FileSpreadsheet className="text-2xl text-emerald-500 w-8 h-8" />
                    <div>
                      <h4 className="font-medium text-secondary">Excel Workbook</h4>
                      <p className="text-sm text-slate-600">Full analysis with POS tagging</p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    File: {results.outputFilename}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 hover:border-primary transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <FileText className="text-2xl text-blue-500 w-8 h-8" />
                    <div>
                      <h4 className="font-medium text-secondary">CSV Export</h4>
                      <p className="text-sm text-slate-600">Structured data for analysis</p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    Available upon request
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 hover:border-primary transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <Code className="text-2xl text-purple-500 w-8 h-8" />
                    <div>
                      <h4 className="font-medium text-secondary">Source Code</h4>
                      <p className="text-sm text-slate-600">Processing script documentation</p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    Included in Excel sheet 2
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600 flex items-center">
                  <div className="w-2 h-2 bg-primary rounded-full mr-2"></div>
                  Auto-versioning prevents file overwrites
                </div>
                <div className="flex items-center space-x-3">
                  <Button 
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="flex items-center space-x-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Process New File</span>
                  </Button>
                  <Button 
                    onClick={() => downloadFile(results.outputFilename)}
                    className="flex items-center space-x-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open Excel File</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
