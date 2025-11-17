import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { UserRole, EvaluationResult, StudentRecords } from './types';
import Header from './components/Header';
import EvaluationInput from './components/EvaluationInput';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';
import RecordList from './components/RecordList';
import { evaluateAnswerSheet } from './services/geminiService';
import * as db from './services/db';
import { LogoIcon, ThemeIcon, StudentIcon, EyeIcon, EyeOffIcon, TeacherIcon, SearchIcon } from './components/icons';
import RoleSelector from './components/RoleSelector';
import { auth } from './services/firebase';
import { saveEvaluationReport } from "./services/reportService";
import { 
    User, 
    onAuthStateChanged, 
    signInWithEmailAndPassword,
    signOut,
    AuthError
} from 'firebase/auth';
import TeacherDashboard from './components/TeacherDashboard';
import StudentResult from './components/StudentResult';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [allRecords, setAllRecords] = useState<StudentRecords>({});
  const [selectedRecord, setSelectedRecord] = useState<EvaluationResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // State for teacher login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isNewEvaluation, setIsNewEvaluation] = useState<boolean>(false);


  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setAllRecords(db.getAllRecords());
  }, []);

  const handleEvaluation = useCallback(async (collegeId: string, studentName: string, rollNo: string, subject: string, questionPaperText: string, answerSheetText: string, customRules: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedRecord(null);
    setImagePreview(null);
    setIsNewEvaluation(false);

    try {
      if (allRecords[collegeId]) {
        setError('A record for this Submission ID already exists. Please use a different ID.');
        setIsLoading(false);
        return;
      }
      
      const result = await evaluateAnswerSheet(
        collegeId,
        studentName,
        rollNo,
        subject,
        questionPaperText,
        answerSheetText,
        customRules
      );

      setSelectedRecord(result);
      setIsNewEvaluation(true);

    } catch (e) {
      console.error(e);
      setError('An error occurred during evaluation. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [allRecords]);

  const handleConfirmSaveReport = async (recordToSave: EvaluationResult) => {
    try {
      // 1. Save to local storage
      db.saveRecord(recordToSave.collegeId, recordToSave);
      const updatedRecords = { ...allRecords, [recordToSave.collegeId]: recordToSave };
      setAllRecords(updatedRecords);

      // 2. Save to Firestore with detailed breakdown
      const reportData = {
        studentId: recordToSave.rollNo,
        studentName: recordToSave.studentName,
        examId: recordToSave.subject,
        score: recordToSave.summary.totalMarksAwarded,
        maxScore: recordToSave.summary.totalMaxMarks,
        answersSummary: recordToSave.summary.overallFeedback,
        plagiarismPercent: recordToSave.plagiarismReport.plagiarismPercentage,
        grade: recordToSave.summary.finalGrade,
        breakdown: recordToSave.evaluation,
        extractedText: recordToSave.extractedText,
      };

      await saveEvaluationReport(reportData);
      alert("✅ Report saved successfully for " + recordToSave.studentName);
      
      // 3. Reset the flag
      setIsNewEvaluation(false);

    } catch (error: any) {
      alert("❌ Error saving report to database: " + error.message);
      console.error(error);
    }
  };
  
  const handleViewRecord = (collegeId: string) => {
    const record = allRecords[collegeId];
    if(record) {
      setSelectedRecord(record);
      setImagePreview(null); 
    }
  };
  
  const handleBackToDashboard = () => {
    setSelectedRecord(null);
    setError(null);
    setImagePreview(null);
    setIsNewEvaluation(false);
  };
  
  const handleUpdateRecord = (updatedRecord: EvaluationResult) => {
    db.saveRecord(updatedRecord.collegeId, updatedRecord);
    setAllRecords(db.getAllRecords());
    setSelectedRecord(updatedRecord);
  };

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
  };
  
  const resetFormState = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setIsPasswordVisible(false);
  }

  const handleBackToRoleSelection = () => {
    if(user) signOut(auth);
    setUser(null);
    setUserRole(null);
    setSelectedRecord(null);
    setImagePreview(null);
    setSearchQuery('');
    resetFormState();
  };
  
  const filteredTeacherRecords = useMemo(() => {
      if (!searchQuery) {
          return allRecords;
      }
      const lowercasedQuery = searchQuery.toLowerCase();
      return Object.entries(allRecords)
          .filter(([, record]: [string, EvaluationResult]) =>
              record.studentName.toLowerCase().includes(lowercasedQuery) ||
              record.rollNo.toLowerCase().includes(lowercasedQuery) ||
              record.collegeId.toLowerCase().includes(lowercasedQuery)
          )
          .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
  }, [allRecords, searchQuery]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      resetFormState();
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = "An unknown error occurred.";
      if (err instanceof Error) {
          errorMessage = err.message;
      }
      if (authError.code) {
        switch (authError.code) {
            case 'auth/invalid-credential':
            case 'auth/user-not-found':
            case 'auth/wrong-password':
              errorMessage = "Invalid credentials. Please check your details and try again.";
              break;
            default:
                errorMessage = "Authentication failed. Please try again later.";
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }
  
  const renderLogin = () => (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-brand-surface border border-brand-outline rounded-2xl shadow-2xl shadow-brand-primary/10 backdrop-blur-lg">
        <div className="text-center">
            <div className="inline-block p-3 bg-brand-primary/20 rounded-full mb-4">
               <TeacherIcon className="h-8 w-8 text-brand-primary" />
            </div>
            <h1 className="text-3xl font-bold text-text-primary">Teacher Login</h1>
            <p className="mt-2 text-text-secondary">Access the future of evaluation.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
            <div>
                <label htmlFor="email-address" className="sr-only">Email address</label>
                <input id="email-address" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required className="block w-full px-4 py-3 bg-brand-surface border border-brand-outline rounded-md shadow-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary text-text-primary" placeholder="Email address" />
            </div>
            <div className="relative">
                <label htmlFor="password" className="sr-only">Password</label>
                <input id="password" name="password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required className="block w-full px-4 py-3 pr-10 bg-brand-surface border border-brand-outline rounded-md shadow-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary text-text-primary" placeholder="Password" />
                <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary hover:text-text-primary focus:outline-none"
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                >
                    {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
            <div>
                <button type="submit" disabled={isLoading} className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-primary hover:bg-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary/50 transition-all duration-300 shadow-lg shadow-brand-primary/30 hover:shadow-brand-secondary/40 disabled:opacity-50">
                    {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
            </div>
        </form>
         <p className="text-center text-sm text-text-secondary">
            Not a teacher?{' '}
            <button onClick={handleBackToRoleSelection} className="font-medium text-brand-primary hover:text-brand-secondary focus:outline-none">
              Go back
            </button>
        </p>
      </div>
    </div>
  );

  const renderTeacherView = () => {
    if (selectedRecord) {
      return (
        <ResultDisplay 
          result={selectedRecord} 
          isStudentView={false} 
          imagePreview={imagePreview}
          onReset={handleBackToDashboard}
          onUpdateRecord={handleUpdateRecord}
          isNewEvaluation={isNewEvaluation}
          onConfirmSave={handleConfirmSaveReport}
          onDiscard={handleBackToDashboard}
        />
      );
    }
    return (
      <div className="space-y-8">
        <EvaluationInput onEvaluate={handleEvaluation} isLoading={isLoading} />
        <RecordList records={filteredTeacherRecords} onSelectRecord={handleViewRecord} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      </div>
    );
  };

  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <Spinner />
            <p className="mt-4 text-lg text-text-secondary">Loading...</p>
        </div>
    );
  }

  if (!userRole) {
    return <RoleSelector onSelectRole={handleRoleSelect} />;
  }
  
  const errorComponent = (
    <div className="p-4 mb-4 text-sm text-red-300 rounded-lg bg-red-900/50 border border-red-500/50" role="alert">
      <span className="font-medium">Error!</span> {error}
       <button onClick={() => setError(null)} className="float-right font-bold text-red-300 hover:text-white">&times;</button>
    </div>
  );

  const themeToggleButton = (
    <button 
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="fixed bottom-6 right-6 p-3 rounded-full bg-brand-primary/80 text-white backdrop-blur-sm shadow-lg shadow-brand-primary/40 hover:bg-brand-secondary hover:shadow-brand-secondary/50 transition-all duration-300"
      aria-label="Toggle theme"
    >
      <ThemeIcon />
    </button>
  );

  if (userRole === UserRole.Teacher) {
    if (!user) {
        return renderLogin();
    }
    return (
      <div className="min-h-screen text-text-primary font-sans transition-colors duration-500">
        <Header userRole={userRole} onLogout={handleBackToRoleSelection} />
        <main className="container mx-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {error && errorComponent}
            <div className="mb-8">
              <TeacherDashboard />
            </div>
            {renderTeacherView()}
          </div>
        </main>
        {themeToggleButton}
      </div>
    );
  }

  if (userRole === UserRole.Student) {
    return (
      <div className="min-h-screen text-text-primary font-sans transition-colors duration-500">
          <header className="bg-brand-surface/50 border-b border-brand-outline backdrop-blur-lg print:hidden sticky top-0 z-50">
            <div className="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <LogoIcon />
                <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-wider">
                  AI-Enhanced Academic Evaluation Suite
                </h1>
              </div>
              <button 
                onClick={handleBackToRoleSelection} 
                className="flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 bg-brand-bg-light border border-brand-outline text-text-secondary hover:text-brand-secondary hover:border-brand-secondary/80" 
                title="Back to Role Selection"
              >
                <span>Back</span>
              </button>
            </div>
          </header>
          <main className="container mx-auto p-4 md:p-8">
              <div className="max-w-7xl mx-auto">
                <StudentResult />
              </div>
          </main>
           {themeToggleButton}
      </div>
    );
  }

  return null;
};

export default App;