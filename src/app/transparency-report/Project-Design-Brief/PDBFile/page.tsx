"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "../../../Components/Navbar";

const PDBFileViewer = () => {
  const searchParams = useSearchParams();
  
  const [pdfFiles, setPdfFiles] = useState<{
    projectBrief: string | null;
    projectDesign: string | null;
  }>({ projectBrief: null, projectDesign: null });

  const [firebaseUrls, setFirebaseUrls] = useState<{
    projectBrief: string | null;
    projectDesign: string | null;
  }>({ projectBrief: null, projectDesign: null });

  const [loadStatus, setLoadStatus] = useState<string>("Loading PDFs...");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [isPageAccessible] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [loadingFirebase, setLoadingFirebase] = useState({
    brief: false,
    design: false,
  });

  const briefInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadPDFs = async () => {
      try {
        // Get PDFs from URL params
        const designParam = searchParams.get("design");
        const briefParam = searchParams.get("brief");
        const designUrlParam = searchParams.get("designUrl");
        const briefUrlParam = searchParams.get("briefUrl");
        const titleParam = searchParams.get("title");

        console.log("Search params:", {
          design: designParam ? "exists" : "missing",
          brief: briefParam ? "exists" : "missing",
          designUrl: designUrlParam ? "exists" : "missing",
          briefUrl: briefUrlParam ? "exists" : "missing",
          title: titleParam,
        });

        if (titleParam) {
          setProjectTitle(decodeURIComponent(titleParam));
        }

        // Try to load from blob URLs first
        if (designParam) {
          try {
            const response = await fetch(designParam);
            const blob = await response.blob();
            const newUrl = URL.createObjectURL(blob);
            setPdfFiles((prev) => ({ ...prev, projectDesign: newUrl }));
            console.log("Loaded Project Design from blob URL");
          } catch (e) {
            console.error("Failed to load design blob:", e);
            if (designUrlParam) {
              setFirebaseUrls((prev) => ({ ...prev, projectDesign: designUrlParam }));
            }
          }
        } else if (designUrlParam) {
          setFirebaseUrls((prev) => ({ ...prev, projectDesign: designUrlParam }));
        }

        if (briefParam) {
          try {
            const response = await fetch(briefParam);
            const blob = await response.blob();
            const newUrl = URL.createObjectURL(blob);
            setPdfFiles((prev) => ({ ...prev, projectBrief: newUrl }));
            console.log("Loaded Project Brief from blob URL");
          } catch (e) {
            console.error("Failed to load brief blob:", e);
            if (briefUrlParam) {
              setFirebaseUrls((prev) => ({ ...prev, projectBrief: briefUrlParam }));
            }
          }
        } else if (briefUrlParam) {
          setFirebaseUrls((prev) => ({ ...prev, projectBrief: briefUrlParam }));
        }

        setLoadStatus("✅ PDFs loaded successfully!");
        setTimeout(() => setLoadStatus(""), 3000);
      } catch (error) {
        console.error("Error loading PDFs:", error);
        setLoadStatus("⚠️ Error loading PDFs. Please try generating again.");
      }
    };

    loadPDFs();
  }, [searchParams]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPageAccessible) {
        e.preventDefault();
        e.returnValue = "Once you leave this page, you cannot go back to these generated files. Are you sure?";
        return e.returnValue;
      }
    };

    const handlePopState = () => {
      setShowWarning(true);
      window.history.forward();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isPageAccessible]);

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "brief" | "design"
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      const fileURL = URL.createObjectURL(file);
      setPdfFiles((prev) => ({
        ...prev,
        [type === "brief" ? "projectBrief" : "projectDesign"]: fileURL,
      }));
      setLoadStatus(
        `✅ Uploaded ${type === "brief" ? "Project Brief" : "Project Design"} PDF`
      );
      setTimeout(() => setLoadStatus(""), 3000);
    } else {
      setLoadStatus("❌ Please select a valid PDF file");
      setTimeout(() => setLoadStatus(""), 3000);
    }
  };

  const downloadPDF = (pdfUrl: string, filename: string) => {
    if (pdfUrl) {
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setLoadStatus(`✅ Downloaded ${filename}`);
      setTimeout(() => setLoadStatus(""), 3000);
    }
  };

  const refreshFromFirebase = async (type: "brief" | "design") => {
    const firebaseUrl =
      type === "brief"
        ? firebaseUrls.projectBrief
        : firebaseUrls.projectDesign;
    
    if (!firebaseUrl) {
      setLoadStatus("❌ No cloud URL available");
      setTimeout(() => setLoadStatus(""), 3000);
      return;
    }

    setLoadingFirebase((prev) => ({ ...prev, [type]: true }));
    setLoadStatus(
      `🔄 Loading ${type === "brief" ? "Project Brief" : "Project Design"} from cloud...`
    );

    try {
      const response = await fetch(firebaseUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Failed to fetch PDF");
      
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);

      setPdfFiles((prev) => ({
        ...prev,
        [type === "brief" ? "projectBrief" : "projectDesign"]: localUrl,
      }));

      setLoadStatus(
        `✅ ${type === "brief" ? "Project Brief" : "Project Design"} loaded from cloud`
      );
      setTimeout(() => setLoadStatus(""), 3000);
    } catch (error) {
      console.error("Error refreshing from Firebase:", error);
      setLoadStatus(`❌ Failed to load from cloud storage`);
      setTimeout(() => setLoadStatus(""), 3000);
    } finally {
      setLoadingFirebase((prev) => ({ ...prev, [type]: false }));
    }
  };

  const renderPDFSection = (type: "brief" | "design") => {
    const pdfUrl =
      type === "brief" ? pdfFiles.projectBrief : pdfFiles.projectDesign;
    const firebaseUrl =
      type === "brief"
        ? firebaseUrls.projectBrief
        : firebaseUrls.projectDesign;
    const inputRef = type === "brief" ? briefInputRef : designInputRef;
    const title = type === "brief" ? "Project Brief" : "Project Design";
    const isLoading = type === "brief" ? loadingFirebase.brief : loadingFirebase.design;

    return (
      <div className="w-full p-6">
        <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
          {title}
        </h3>
        <div className="mb-4 flex justify-center">
          <div className="w-full max-w-[600px] h-[600px] bg-gray-100 border-4 border-dashed border-[#1167B1] rounded-xl overflow-hidden flex items-center justify-center">
            {pdfUrl ? (
              <div className="w-full h-full">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title={`${title} Preview`}
                  onError={() => setLoadStatus(`Error loading ${title} in viewer`)}
                />
              </div>
            ) : isLoading ? (
              <div className="text-center">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-gray-600">Loading...</p>
              </div>
            ) : firebaseUrl ? (
              <div className="text-center">
                <div className="text-6xl text-blue-400 mb-4">☁️</div>
                <p className="text-gray-500 mb-4">
                  PDF stored in cloud
                </p>
                <button
                  onClick={() => refreshFromFirebase(type)}
                  className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0c5b8d] transition-colors"
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
                  className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0c5b8d] transition-colors"
                >
                  Upload {title} PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {pdfUrl && (
          <div className="flex justify-center gap-4">
            <button
              onClick={() =>
                downloadPDF(pdfUrl, `${projectTitle || "Project"}_${title}.pdf`)
              }
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-semibold"
            >
              Download {title}
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => handleFileUpload(e, type)}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto" suppressHydrationWarning={true}>
      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md shadow-2xl">
            <div className="text-6xl mb-4 text-center">⚠️</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">
              Cannot Go Back
            </h3>
            <p className="text-gray-600 text-center mb-6">
              Once you leave this page, you cannot go back to these generated
              files. The PDFs will no longer be accessible. Please download them before leaving.
            </p>
            <button
              onClick={() => setShowWarning(false)}
              className="w-full bg-[#1167B1] text-white px-6 py-3 rounded-lg hover:bg-blue-800 transition-colors font-semibold"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800 text-left">
          Transparency Report
        </h1>
        <p className="text-lg text-gray-600 mt-1 text-left">
          {projectTitle
            ? `Viewing: ${projectTitle}`
            : "Create reports and activities for internal tracking."}
        </p>
      </div>

      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report/Project-Design-Brief">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80 transition-opacity">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">
            Generated PDF Viewer
          </h2>
        </div>

        <div className="p-6">
          {loadStatus && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                loadStatus.includes("✅")
                  ? "bg-green-50 text-green-700 border-green-200"
                  : loadStatus.includes("❌")
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
            >
              {loadStatus}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderPDFSection("brief")}
            {renderPDFSection("design")}
          </div>

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              <strong>Important:</strong> Once you navigate away from this
              page, you will not be able to access these generated PDFs again.
              Please download them before leaving.
            </p>
          </div>
        </div>
      </div>

      <Navbar />
    </div>
  );
};

export default PDBFileViewer;