"use client";

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import Navbar from "../../../Components/Navbar";

// Firebase dependencies
import { app } from "@/app/Firebase/firebase";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// Initialize Firebase Storage
const storage = getStorage(app);

const TransparencyReport = () => {
  const [showViewer, setShowViewer] = useState(false);
  const [currentPDF, setCurrentPDF] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>("");

  const [pdfFiles, setPdfFiles] = useState<{
    projectBrief: string | null;
    projectDesign: string | null;
  }>({ projectBrief: null, projectDesign: null });

  const [firebaseUrls, setFirebaseUrls] = useState<{
    projectBrief: string | null;
    projectDesign: string | null;
  }>({ projectBrief: null, projectDesign: null });

  const briefInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);

  const [loadStatus, setLoadStatus] = useState<string>("");
  const [uploadingToFirebase, setUploadingToFirebase] = useState<{
    brief: boolean;
    design: boolean;
  }>({ brief: false, design: false });

  const [loadingFromFirebase, setLoadingFromFirebase] = useState<{
    brief: boolean;
    design: boolean;
  }>({ brief: false, design: false });

  // Convert data URL to Blob
  const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  };

  // Load PDFs from localStorage and Firebase
  useEffect(() => {
    const loadPDFs = async () => {
      try {
        console.log("Loading PDFs from localStorage and Firebase...");
        
        // Load local URLs
        const designPdf = localStorage.getItem("projectDesignPdf");
        const briefPdf = localStorage.getItem("projectBriefPdf");
        
        // Load Firebase URLs
        const designFirebaseUrl = localStorage.getItem("projectDesignFirebaseUrl");
        const briefFirebaseUrl = localStorage.getItem("projectBriefFirebaseUrl");

        // Set initial state
        setPdfFiles({ projectDesign: designPdf, projectBrief: briefPdf });
        setFirebaseUrls({ projectDesign: designFirebaseUrl, projectBrief: briefFirebaseUrl });

        // If we don't have local PDFs but have Firebase URLs, fetch them
        if (!designPdf && designFirebaseUrl) {
          setLoadingFromFirebase(prev => ({ ...prev, design: true }));
          try {
            console.log("Fetching Project Design from Firebase...");
            const response = await fetch(designFirebaseUrl);
            const blob = await response.blob();
            const localUrl = URL.createObjectURL(blob);
            setPdfFiles(prev => ({ ...prev, projectDesign: localUrl }));
            localStorage.setItem("projectDesignPdf", localUrl);
            console.log("✅ Project Design loaded from Firebase");
          } catch (error) {
            console.error("Error loading Project Design from Firebase:", error);
          } finally {
            setLoadingFromFirebase(prev => ({ ...prev, design: false }));
          }
        }

        if (!briefPdf && briefFirebaseUrl) {
          setLoadingFromFirebase(prev => ({ ...prev, brief: true }));
          try {
            console.log("Fetching Project Brief from Firebase...");
            const response = await fetch(briefFirebaseUrl);
            const blob = await response.blob();
            const localUrl = URL.createObjectURL(blob);
            setPdfFiles(prev => ({ ...prev, projectBrief: localUrl }));
            localStorage.setItem("projectBriefPdf", localUrl);
            console.log("✅ Project Brief loaded from Firebase");
          } catch (error) {
            console.error("Error loading Project Brief from Firebase:", error);
          } finally {
            setLoadingFromFirebase(prev => ({ ...prev, brief: false }));
          }
        }

        // Update status
        const localCount = (designPdf ? 1 : 0) + (briefPdf ? 1 : 0);
        const firebaseCount = (designFirebaseUrl ? 1 : 0) + (briefFirebaseUrl ? 1 : 0);

        if (localCount > 0 || firebaseCount > 0) {
          setLoadStatus(`✅ Loaded ${localCount} local PDF${localCount !== 1 ? 's' : ''} and ${firebaseCount} cloud PDF${firebaseCount !== 1 ? 's' : ''}`);
        } else {
          setLoadStatus("No previously generated PDFs found. Generate new documents or upload existing PDFs.");
        }

        setTimeout(() => setLoadStatus(""), 5000);
      } catch (error) {
        console.error("Error loading PDFs:", error);
        setLoadStatus("Error loading PDFs.");
        setTimeout(() => setLoadStatus(""), 5000);
      }
    };

    loadPDFs();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'projectDesignPdf' || 
          e.key === 'projectBriefPdf' || 
          e.key === 'projectDesignFirebaseUrl' || 
          e.key === 'projectBriefFirebaseUrl') {
        loadPDFs();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Check for updates every 2 seconds
    const interval = setInterval(loadPDFs, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Upload PDF to Firebase
  const uploadToFirebase = async (pdfUrl: string, type: 'brief' | 'design') => {
    try {
      setUploadingToFirebase(prev => ({ ...prev, [type]: true }));
      setLoadStatus(`🔄 Uploading ${type === 'brief' ? 'Project Brief' : 'Project Design'} to cloud storage...`);

      let blob: Blob;
      if (pdfUrl.startsWith('data:')) {
        blob = dataURLToBlob(pdfUrl);
      } else {
        const response = await fetch(pdfUrl);
        blob = await response.blob();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `pdfs/${type === 'brief' ? 'project-brief' : 'project-design'}-${timestamp}.pdf`;
      const storageRef = ref(storage, filename);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      setFirebaseUrls(prev => ({ ...prev, [type === 'brief' ? 'projectBrief' : 'projectDesign']: downloadURL }));
      localStorage.setItem(type === 'brief' ? 'projectBriefFirebaseUrl' : 'projectDesignFirebaseUrl', downloadURL);

      setLoadStatus(`✅ ${type === 'brief' ? 'Project Brief' : 'Project Design'} uploaded to cloud storage successfully!`);
      setTimeout(() => setLoadStatus(""), 3000);

      return downloadURL;
    } catch (error) {
      console.error('Error uploading to Firebase:', error);
      setLoadStatus(`❌ Failed to upload ${type === 'brief' ? 'Project Brief' : 'Project Design'} to cloud storage`);
      setTimeout(() => setLoadStatus(""), 5000);
      throw error;
    } finally {
      setUploadingToFirebase(prev => ({ ...prev, [type]: false }));
    }
  };

  // Handle file upload for PDF viewing
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'brief' | 'design') => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const fileURL = URL.createObjectURL(file);
      setPdfFiles(prev => ({ ...prev, [type === 'brief' ? 'projectBrief' : 'projectDesign']: fileURL }));
      setLoadStatus(`✅ Uploaded ${type === 'brief' ? 'Project Brief' : 'Project Design'} PDF`);
      setTimeout(() => setLoadStatus(""), 3000);
    } else {
      setLoadStatus("❌ Please select a valid PDF file");
      setTimeout(() => setLoadStatus(""), 3000);
    }
  };

  const openPDFViewer = (pdfUrl: string, title: string) => {
    if (pdfUrl) {
      setCurrentPDF(pdfUrl);
      setCurrentTitle(title);
      setShowViewer(true);
    }
  };

  const closePDFViewer = () => {
    setShowViewer(false);
    setCurrentPDF(null);
    setCurrentTitle("");
  };

  const downloadPDF = (pdfUrl: string, filename: string) => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setLoadStatus(`✅ Downloaded ${filename}`);
      setTimeout(() => setLoadStatus(""), 3000);
    }
  };

  const deleteFromFirebase = async (type: 'brief' | 'design') => {
    try {
      const firebaseUrl = type === 'brief' ? firebaseUrls.projectBrief : firebaseUrls.projectDesign;
      if (!firebaseUrl) return;

      const url = new URL(firebaseUrl);
      const filePath = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
      const storageRef = ref(storage, filePath);

      await deleteObject(storageRef);

      setFirebaseUrls(prev => ({ ...prev, [type === 'brief' ? 'projectBrief' : 'projectDesign']: null }));
      localStorage.removeItem(type === 'brief' ? 'projectBriefFirebaseUrl' : 'projectDesignFirebaseUrl');

      setLoadStatus(`✅ ${type === 'brief' ? 'Project Brief' : 'Project Design'} deleted from cloud storage`);
      setTimeout(() => setLoadStatus(""), 3000);
    } catch (error) {
      console.error('Error deleting from Firebase:', error);
      setLoadStatus(`❌ Failed to delete from cloud storage`);
      setTimeout(() => setLoadStatus(""), 3000);
    }
  };

  const refreshFromFirebase = async (type: 'brief' | 'design') => {
    const firebaseUrl = type === 'brief' ? firebaseUrls.projectBrief : firebaseUrls.projectDesign;
    if (!firebaseUrl) return;

    setLoadingFromFirebase(prev => ({ ...prev, [type]: true }));
    setLoadStatus(`🔄 Refreshing ${type === 'brief' ? 'Project Brief' : 'Project Design'} from cloud storage...`);

    try {
      const response = await fetch(firebaseUrl);
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);
      
      setPdfFiles(prev => ({ 
        ...prev, 
        [type === 'brief' ? 'projectBrief' : 'projectDesign']: localUrl 
      }));
      localStorage.setItem(
        type === 'brief' ? 'projectBriefPdf' : 'projectDesignPdf', 
        localUrl
      );

      setLoadStatus(`✅ ${type === 'brief' ? 'Project Brief' : 'Project Design'} refreshed from cloud storage`);
      setTimeout(() => setLoadStatus(""), 3000);
    } catch (error) {
      console.error('Error refreshing from Firebase:', error);
      setLoadStatus(`❌ Failed to refresh from cloud storage`);
      setTimeout(() => setLoadStatus(""), 3000);
    } finally {
      setLoadingFromFirebase(prev => ({ ...prev, [type]: false }));
    }
  };

  const PDFViewer = () => {
    if (!showViewer || !currentPDF) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg w-11/12 h-5/6 max-w-6xl flex flex-col">
          <div className="bg-[#1167B1] text-white px-6 py-4 rounded-t-lg flex justify-between items-center">
            <h3 className="text-xl font-semibold">{currentTitle}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => downloadPDF(currentPDF, `${currentTitle}.pdf`)}
                className="bg-white text-[#1167B1] px-4 py-2 rounded hover:bg-gray-100 text-sm"
              >
                📥 Download
              </button>
              <button
                onClick={closePDFViewer}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 text-sm"
              >
                ✕ Close
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <iframe
              src={currentPDF}
              className="w-full h-full border-0"
              title={currentTitle}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPDFSection = (type: 'brief' | 'design') => {
    const pdfUrl = type === 'brief' ? pdfFiles.projectBrief : pdfFiles.projectDesign;
    const firebaseUrl = type === 'brief' ? firebaseUrls.projectBrief : firebaseUrls.projectDesign;
    const inputRef = type === 'brief' ? briefInputRef : designInputRef;
    const title = type === 'brief' ? 'Project Brief' : 'Project Design';
    const isUploading = type === 'brief' ? uploadingToFirebase.brief : uploadingToFirebase.design;
    const isLoadingFromFirebase = type === 'brief' ? loadingFromFirebase.brief : loadingFromFirebase.design;

    return (
      <div className="w-full p-6">
        <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">{title}</h3>
        <div className="mb-4 flex justify-center">
          <div className="w-[500px] h-[500px] bg-gray-100 border-4 border-dashed border-[#1167B1] rounded-xl overflow-hidden flex items-center justify-center">
            {isLoadingFromFirebase ? (
              <div className="text-center">
                <div className="animate-spin text-4xl text-[#1167B1] mb-4">⏳</div>
                <p className="text-[#1167B1]">Loading from cloud storage...</p>
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title={`${title} Preview`}
              />
            ) : firebaseUrl ? (
              <div className="text-center">
                <div className="text-6xl text-blue-400 mb-4">☁️</div>
                <p className="text-gray-500 mb-4">PDF available in cloud storage</p>
                <button
                  onClick={() => refreshFromFirebase(type)}
                  className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0c5b8d]"
                  disabled={isLoadingFromFirebase}
                >
                  Load from Cloud
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-6xl text-gray-400 mb-4">📄</div>
                <p className="text-gray-500 mb-4">No {title} PDF</p>
                <p className="text-sm text-gray-400 mb-4">
                  Generate from the previous page or upload manually
                </p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0c5b8d]"
                >
                  Upload {title} PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => handleFileUpload(e, type)}
          className="hidden"
        />

        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          {pdfUrl ? (
            <>
              <button
                onClick={() => openPDFViewer(pdfUrl, title)}
                className="bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 font-semibold text-sm"
              >
                👁️ View
              </button>
              <button
                onClick={() => downloadPDF(pdfUrl, `${title.replace(' ', '_')}.pdf`)}
                className="bg-[#1167B1] text-white px-4 py-2 rounded-md hover:bg-[#0c5b8d] font-semibold text-sm"
              >
                📥 Download
              </button>
              {!firebaseUrl && (
                <button
                  onClick={() => uploadToFirebase(pdfUrl, type)}
                  disabled={isUploading}
                  className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 disabled:bg-gray-400 font-semibold text-sm"
                >
                  {isUploading ? '⏳ Uploading...' : '☁️ Save to Cloud'}
                </button>
              )}
            </>
          ) : firebaseUrl ? (
            <button
              onClick={() => refreshFromFirebase(type)}
              disabled={isLoadingFromFirebase}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400 font-semibold text-sm"
            >
              {isLoadingFromFirebase ? '⏳ Loading...' : '☁️ Load from Cloud'}
            </button>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 font-semibold text-sm"
            >
              📁 Upload
            </button>
          )}
          
          {firebaseUrl && (
            <>
              <button
                onClick={() => refreshFromFirebase(type)}
                disabled={isLoadingFromFirebase}
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400 font-semibold text-sm"
              >
                {isLoadingFromFirebase ? '⏳ Refreshing...' : '🔄 Refresh'}
              </button>
              <button
                onClick={() => deleteFromFirebase(type)}
                className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 font-semibold text-sm"
              >
                🗑️ Delete Cloud
              </button>
            </>
          )}
        </div>

        {firebaseUrl && (
          <div className="mt-2 text-center">
            <span className="text-green-600 text-sm">☁️ Saved to cloud storage</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <PDFViewer />
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800 text-left">Transparency Report</h1>
        <p className="text-lg text-gray-600 mt-1 text-left">
          Create reports and activities for internal tracking.
        </p>
      </div>
      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report/Project-Design-Brief">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">←</button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">Generated PDF Viewer</h2>
        </div>
        <div className="p-6">
          {loadStatus && (
            <div className={`mb-6 p-4 rounded-lg border ${
              loadStatus.includes("✅")
                ? "bg-green-50 text-green-700 border-green-200"
                : loadStatus.includes("❌")
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {loadStatus}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderPDFSection('brief')}
            {renderPDFSection('design')}
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-gray-100 rounded-lg text-xs">
              <h4 className="font-semibold mb-2">Debug Info:</h4>
              <p>Brief PDF: {pdfFiles.projectBrief ? 'Available' : 'Not found'}</p>
              <p>Design PDF: {pdfFiles.projectDesign ? 'Available' : 'Not found'}</p>
              <p>Brief Firebase: {firebaseUrls.projectBrief ? 'Uploaded' : 'Not uploaded'}</p>
              <p>Design Firebase: {firebaseUrls.projectDesign ? 'Uploaded' : 'Not uploaded'}</p>
            </div>
          )}
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default TransparencyReport;