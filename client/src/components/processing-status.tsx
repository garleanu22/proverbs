import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import type { ProverbExtractionResult, ProcessingRequest } from "@shared/schema";

interface ProcessingStatusProps {
  documentId: number;
  config: ProcessingRequest;
  onComplete: (result: ProverbExtractionResult) => void;
}

interface ProcessingStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
}

export function ProcessingStatus({ documentId, config, onComplete }: ProcessingStatusProps) {
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { name: 'Text Extraction', status: 'pending', progress: 0 },
    { name: 'Proverb Identification', status: 'pending', progress: 0 },
    { name: 'POS Analysis', status: 'pending', progress: 0 },
    { name: 'Excel Generation', status: 'pending', progress: 0 },
  ]);
  
  const [logs, setLogs] = useState<string[]>([]);

  const processingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/process/${documentId}`, config);
      return response.json();
    },
    onSuccess: (result) => {
      setSteps(prev => prev.map(step => ({ ...step, status: 'completed' as const, progress: 100 })));
      addLog('✓ Processing completed successfully');
      onComplete(result);
    },
    onError: (error) => {
      setSteps(prev => prev.map(step => 
        step.status === 'processing' 
          ? { ...step, status: 'error' as const }
          : step
      ));
      addLog(`✗ Processing failed: ${error.message}`);
    },
  });

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    // Start processing
    processingMutation.mutate();
    addLog('Starting PDF processing...');

    // Simulate step-by-step processing
    const stepTimings = [1000, 2000, 1500, 1000];
    let currentStep = 0;

    const processNextStep = () => {
      if (currentStep < steps.length) {
        setSteps(prev => prev.map((step, index) => {
          if (index === currentStep) {
            return { ...step, status: 'processing' as const, progress: 0 };
          }
          return step;
        }));

        addLog(`⟳ ${steps[currentStep].name} in progress...`);

        // Simulate progress
        const progressInterval = setInterval(() => {
          setSteps(prev => prev.map((step, index) => {
            if (index === currentStep && step.progress < 90) {
              return { ...step, progress: step.progress + Math.random() * 15 };
            }
            return step;
          }));
        }, 200);

        setTimeout(() => {
          clearInterval(progressInterval);
          setSteps(prev => prev.map((step, index) => {
            if (index === currentStep) {
              return { ...step, status: 'completed' as const, progress: 100 };
            }
            return step;
          }));

          addLog(`✓ ${steps[currentStep].name} completed`);
          currentStep++;
          
          if (currentStep < steps.length) {
            setTimeout(processNextStep, 300);
          }
        }, stepTimings[currentStep]);
      }
    };

    const timer = setTimeout(processNextStep, 500);
    return () => clearTimeout(timer);
  }, [documentId]);

  const getStatusIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-accent" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-warning animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusText = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing...';
      case 'error':
        return 'Error';
      default:
        return 'Pending';
    }
  };

  const getStatusColor = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return 'text-accent';
      case 'processing':
        return 'text-warning';
      case 'error':
        return 'text-destructive';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="mt-8">
      <Card className="shadow-sm border border-slate-200">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold text-secondary mb-6">Processing Status</h3>
          
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(step.status)}
                    <span className="text-sm font-medium text-secondary">{step.name}</span>
                  </div>
                  <span className={`text-sm ${getStatusColor(step.status)}`}>
                    {getStatusText(step.status)}
                  </span>
                </div>
                <Progress 
                  value={step.progress} 
                  className="h-2"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-medium text-secondary mb-3">Processing Log</h4>
            <div className="bg-slate-50 rounded-lg p-4 max-h-32 overflow-y-auto">
              <div className="space-y-1 text-sm font-mono">
                {logs.map((log, index) => (
                  <div key={index} className={
                    log.includes('✓') ? 'text-accent' :
                    log.includes('⟳') ? 'text-warning' :
                    log.includes('✗') ? 'text-destructive' :
                    'text-slate-600'
                  }>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
