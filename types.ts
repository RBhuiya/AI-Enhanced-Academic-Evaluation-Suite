export enum UserRole {
  Teacher = 'Teacher',
  Student = 'Student',
}

export interface PlagiarismMatch {
  studentText: string;
  source: string;
}

export interface PlagiarismReport {
  status: string;
  summary: string;
  matches: PlagiarismMatch[];
  plagiarismPercentage: number;
}

export interface EvaluationItem {
  question: string;
  studentAnswer: string;
  marksAwarded: number;
  maxMarks: number;
  feedback: string;
}

export interface EvaluationSummary {
  totalMarksAwarded: number;
  totalMaxMarks: number;
  finalGrade: string;
  overallFeedback: string;
}

export interface EvaluationResult {
  collegeId: string; // Unique ID for the submission
  studentName: string;
  rollNo: string;
  subject: string;
  submissionDate: string; // ISO string format
  extractedText: string;
  plagiarismReport: PlagiarismReport;
  evaluation: EvaluationItem[];
  summary: EvaluationSummary;
}

export type StudentRecords = {
  [collegeId: string]: EvaluationResult;
};
