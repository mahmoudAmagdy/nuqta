/**
 * The subset of Azure Document Intelligence's `prebuilt-read` response that
 * the mapper uses. These types stop at the mapper: nothing else imports them.
 */

export interface AzureSpan {
  offset: number;
  length: number;
}

export interface AzureWord {
  content: string;
  polygon?: number[];
  confidence?: number;
  span: AzureSpan;
}

export interface AzureLine {
  content: string;
  polygon?: number[];
  spans: AzureSpan[];
}

export interface AzurePage {
  pageNumber: number;
  angle?: number;
  width?: number;
  height?: number;
  unit?: 'pixel' | 'inch';
  words?: AzureWord[];
  lines?: AzureLine[];
}

export interface AzureAnalyzeResult {
  apiVersion?: string;
  modelId?: string;
  content?: string;
  pages?: AzurePage[];
}

export interface AzureOperation {
  status: 'notStarted' | 'running' | 'succeeded' | 'failed' | 'canceled';
  error?: { code?: string; message?: string };
  analyzeResult?: AzureAnalyzeResult;
}
