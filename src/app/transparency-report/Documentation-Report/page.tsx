"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../../Components/Navbar";
import { jsPDF } from "jspdf";
import { db, storage } from "@/app/Firebase/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/app/Firebase/firebase";

type FileInput = {
  id: number;
  file: File | null;
};

type EventItem = {
  id: string;
  title: string;
};

const DocumentationReport = () => {
  const sections = [
    "Photo of Tarpaulin",
    "Photo of Foods",
    "Photo of Program Proper",
    "Photo of Meeting/Planning",
    "Photo of Attendees",
    "Photo with SK Officials",
    "Others",
  ];

  const [communityEvent, setCommunityEvent] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [fileInputsBySection, setFileInputsBySection] = useState<
    Record<string, FileInput[]>
  >(() => {
    const initialState: Record<string, FileInput[]> = {};
    sections.forEach((section) => {
      initialState[section] = [{ id: Date.now(), file: null }];
    });
    return initialState;
  });
  const [isFormIncomplete, setIsFormIncomplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [compiledBy, setCompiledBy] = useState("");
  const [user] = useAuthState(auth);
  const router = useRouter();

  // Fetch events from Firestore and user name from adminUsers
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const fetched: EventItem[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.title) {
            fetched.push({ id: docSnap.id, title: data.title });
          }
        });
        setEvents(fetched);
      } catch (error) {
        console.error("Error fetching events:", error);
        alert("Error loading events. Please refresh the page.");
      }
    };

    const fetchUserName = async () => {
      if (user && user.uid) {
        try {
          // First try to get from adminUsers collection
          const userDocRef = doc(db, "adminUsers", user.uid);
          const userSnap = await getDoc(userDocRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            // Get name from the 'name' field in adminUsers collection
            const userName = userData?.name || "Unknown User";
            setCompiledBy(userName);
            console.log("Admin user found:", userName);
          } else {
            console.warn("Admin user document not found in adminUsers collection");
            // Fallback: try to use email or display name from auth
            const fallbackName = user.displayName || user.email || "Unknown User";
            setCompiledBy(fallbackName);
          }
        } catch (error) {
          console.error("Error fetching user name from adminUsers collection:", error);
          // Fallback: use auth display name or email
          const fallbackName = user.displayName || user.email || "Unknown User";
          setCompiledBy(fallbackName);
        }
      } else {
        setCompiledBy("Unknown User");
      }
    };

    fetchEvents();
    fetchUserName();
  }, [user]);
    
  const handleFileChange = (
    section: string,
    id: number,
    file: File | null
  ) => {
    setFileInputsBySection((prev) => ({
      ...prev,
      [section]: prev[section].map((input) =>
        input.id === id ? { ...input, file } : input
      ),
    }));
  };

  const handleAddNewInput = (section: string) => {
    setFileInputsBySection((prev) => ({
      ...prev,
      [section]: [
        ...prev[section],
        { id: Date.now() + Math.random(), file: null },
      ],
    }));
  };

  const handleDeleteInput = (section: string, id: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this photo?"
    );
    if (confirmed) {
      setFileInputsBySection((prev) => {
        const updated = prev[section].filter((input) => input.id !== id);
        return {
          ...prev,
          [section]: updated.length > 0 ? updated : prev[section],
        };
      });
      alert("Photo deleted successfully.");
    }
  };

  const validateForm = () => {
    const allFieldsFilled =
      communityEvent.trim() !== "" &&
      Object.values(fileInputsBySection).every((section) =>
        section.every((input) => input.file !== null)
      );
    setIsFormIncomplete(!allFieldsFilled);
    return allFieldsFilled;
  };

  // Helper function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Aggressive compression function to reduce images to kilobytes
  const compressImageToKB = (base64: string, maxSizeKB: number = 50, preserveTransparency: boolean = false): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Start with very small dimensions
        let maxWidth = 400;
        let maxHeight = 300;
        let quality = 0.5;
        
        const compress = () => {
          let { width, height } = img;
          
          // Calculate dimensions
          if (width > maxWidth || height > maxHeight) {
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);
            width *= ratio;
            height *= ratio;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Clear canvas with transparent background if preserving transparency
          if (preserveTransparency && ctx) {
            ctx.clearRect(0, 0, width, height);
          }
          
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Use PNG for transparent images, JPEG for others
          const format = preserveTransparency ? 'image/png' : 'image/jpeg';
          const compressedBase64 = canvas.toDataURL(format, quality);
          
          // Calculate size in KB
          const base64Length = compressedBase64.length;
          const sizeInKB = (base64Length * 0.75) / 1024; // Approximate KB size
          
          console.log(`Image compressed to: ${sizeInKB.toFixed(1)}KB with quality ${quality} and dimensions ${width}x${height}`);
          
          // If still too large, reduce quality and dimensions further
          if (sizeInKB > maxSizeKB && (quality > 0.1 || maxWidth > 200)) {
            if (quality > 0.1) {
              quality -= 0.1;
            } else {
              maxWidth = Math.max(200, maxWidth * 0.8);
              maxHeight = Math.max(150, maxHeight * 0.8);
              quality = 0.5; // Reset quality when reducing dimensions
            }
            compress(); // Recursively compress
          } else {
            resolve(compressedBase64);
          }
        };
        
        compress();
      };
      
      img.src = base64;
    });
  };

  // Helper function to load image and get dimensions for PDF
  const loadImageForPDF = (src: string): Promise<{ img: HTMLImageElement; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Smaller dimensions for PDF to save space
        const maxWidth = 200;
        const maxHeight = 150;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const ratio = Math.min(widthRatio, heightRatio);
          width *= ratio;
          height *= ratio;
        }

        resolve({ img, width, height });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  };

  // Helper function to load logos
  const loadLogos = async () => {
    try {
      const skLogoResponse = await fetch("/SKLogo.png");
      const skLogoBlob = await skLogoResponse.blob();
      const skLogoDataUrl = await fileToBase64(skLogoBlob as File);

      const marikinaLogoResponse = await fetch("/MarikinaLogo.png");
      const marikinaLogoBlob = await marikinaLogoResponse.blob();
      const marikinaLogoDataUrl = await fileToBase64(marikinaLogoBlob as File);

      return { skLogoDataUrl, marikinaLogoDataUrl };
    } catch (error) {
      console.warn("Logo images failed to load", error);
      return { skLogoDataUrl: null, marikinaLogoDataUrl: null };
    }
  };

  // Helper function to add header to PDF
  const addPDFHeader = async (pdf: jsPDF, selectedEvent: EventItem) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 40;

    // Load logos
    const { skLogoDataUrl, marikinaLogoDataUrl } = await loadLogos();

    // Add logos (compressed with transparency preserved)
    if (skLogoDataUrl) {
      const compressedLogo = await compressImageToKB(skLogoDataUrl, 50, true);
      pdf.addImage(compressedLogo, "PNG", margin, 38, 80, 60);
    }
    if (marikinaLogoDataUrl) {
      const compressedLogo = await compressImageToKB(marikinaLogoDataUrl, 50, true);
      pdf.addImage(compressedLogo, "PNG", pageWidth - margin - 80, 38, 80, 80);
    }

    let yPos = 60;
    pdf.setFont("times", "italic");
    pdf.setFontSize(23);
    pdf.text("Republic of the Philippines", pageWidth / 2, yPos, {
      align: "center",
    });

    yPos += 23;
    pdf.setFont("times", "normal");
    pdf.setFontSize(14);
    pdf.text(
      "National Capital Region, Metropolitan Manila",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 14;
    pdf.text("City of Marikina", pageWidth / 2, yPos, { align: "center" });

    yPos += 11;
    pdf.setFontSize(11);
    pdf.text(
      "3rd Floor, Marikina New Legislative Building",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 11;
    pdf.text(
      "Email Address: skfederationmarikinacity@gmail.com",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 34;
    pdf.setFontSize(14);
    pdf.setFont("times", "bold");
    pdf.text(
      "OFFICE OF THE SANGGUNINANG KABATAAN FEDERATION",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 40;

    pdf.setFontSize(16);
    pdf.text(
      `${selectedEvent.title} - Documentation Report`,
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 14;
    pdf.setFontSize(12);
    pdf.setFont("times", "normal");
    pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos, { align: "center" });

    return yPos + 40;
  };

  // Helper function to check page break
  const checkPageBreak = (pdf: jsPDF, yPos: number, pageHeight: number, margin: number) => {
    if (yPos > pageHeight - margin - 60) {
      pdf.addPage();
      return margin + 40;
    }
    return yPos;
  };

  // Simplified PDF generation with heavy compression
  const generateOptimizedPDF = async (selectedEvent: EventItem, imageDataForPDF: Record<string, string[]>) => {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    
    // Add header
    let y = await addPDFHeader(pdf, selectedEvent);

    // Process each section with heavy compression
    for (const section of sections) {
      if (imageDataForPDF[section].length === 0) continue;

      // Check for page break before section header
      y = checkPageBreak(pdf, y, pageHeight, margin);

      // Add section header
      pdf.setFontSize(14);
      pdf.setFont("times", "bold");
      pdf.text(section, margin, y);
      pdf.setFont("times", "normal");
      y += 20;

      // Add images for this section with aggressive compression
      for (let i = 0; i < imageDataForPDF[section].length; i++) {
        try {
          // Compress to 30KB or less
          const compressedImage = await compressImageToKB(imageDataForPDF[section][i], 30);
          const { width, height } = await loadImageForPDF(compressedImage);
          
          // Check if we need a new page for the image
          if (y + height > pageHeight - margin - 60) {
            pdf.addPage();
            y = margin + 40;
          }

          const x = (pageWidth - width) / 2; // Center the image
          pdf.addImage(compressedImage, "JPEG", x, y, width, height);
          y += height + 15; // Reduced spacing
        } catch (error) {
          console.error("Error adding image to PDF:", error);
          // Add a placeholder text instead of the image
          pdf.setFontSize(10);
          pdf.text("(Image could not be loaded)", margin, y);
          y += 15;
        }
      }

      y += 10; // Reduced space between sections
    }

    // Add signatures section at the end
    y = checkPageBreak(pdf, y + 40, pageHeight, margin);
    
    pdf.setFontSize(12);
    pdf.setFont("times", "normal");
    pdf.text(`Compiled By: ${compiledBy}`, margin, y);
    pdf.text("Noted By: Hon. Ma. Julianna M. Santiago", margin, y + 20);

    return pdf;
  };

  const handleGenerate = async () => {
    const isValid = validateForm();
    if (!isValid) {
      alert(
        "Please select a community event and upload all required photos before proceeding."
      );
      return;
    }

    if (!user || !compiledBy) {
      alert("User authentication required. Please make sure you are logged in.");
      return;
    }

    const selectedEvent = events.find((e) => e.id === communityEvent);
    if (!selectedEvent) {
      alert("Invalid event selection.");
      return;
    }

    // Count total files for progress estimation
    const totalFiles = Object.values(fileInputsBySection)
      .flat()
      .filter(input => input.file !== null).length;
    
    const confirmed = window.confirm(
      `Are you sure you want to add all entries? This will process ${totalFiles} photos with high compression and may take 1-2 minutes.`
    );
    if (!confirmed) return;

    setIsGenerating(true);

    try {
      // Save uploaded files to Firebase Storage & Firestore
      const uploadResults: Record<string, string[]> = {};
      const imageDataForPDF: Record<string, string[]> = {}; // Store base64 data for PDF

      for (const section of sections) {
        uploadResults[section] = [];
        imageDataForPDF[section] = [];

        for (const input of fileInputsBySection[section]) {
          if (input.file) {
            try {
              // Convert file to base64 and compress for PDF generation (50KB max)
              const base64Data = await fileToBase64(input.file);
              const compressedForPDF = await compressImageToKB(base64Data, 50);
              imageDataForPDF[section].push(compressedForPDF);

              // Compress for Firebase storage (100KB max)
              const compressedForStorage = await compressImageToKB(base64Data, 100);
              
              // Convert compressed base64 back to blob for upload
              const byteCharacters = atob(compressedForStorage.split(',')[1]);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const compressedBlob = new Blob([byteArray], { type: 'image/jpeg' });

              // Upload compressed image to Firebase Storage
              const storageRef = ref(
                storage,
                `events/${selectedEvent.id}/${section}/${input.file.name.replace(/\.[^/.]+$/, '')}_compressed.jpg`
              );
              await uploadBytes(storageRef, compressedBlob);
              const downloadURL = await getDownloadURL(storageRef);
              uploadResults[section].push(downloadURL);
            } catch (error) {
              console.error(`Error processing file ${input.file.name}:`, error);
              throw new Error(`Failed to process file: ${input.file.name}`);
            }
          }
        }
      }

      // Generate optimized PDF
      const pdf = await generateOptimizedPDF(selectedEvent, imageDataForPDF);
      
      // Convert PDF to blob
      const pdfBlob = pdf.output("blob");
      const pdfSize = pdfBlob.size;
      
      console.log(`Final PDF size: ${(pdfSize / 1024).toFixed(2)}KB`);

      // Upload PDF to Firebase Storage
      const pdfRef = ref(
        storage,
        `events/${selectedEvent.id}/documentation-reports/report-${Date.now()}.pdf`
      );
      await uploadBytes(pdfRef, pdfBlob);
      const pdfDownloadURL = await getDownloadURL(pdfRef);

      // Save metadata to Firestore
      const reportRef = doc(
        db,
        "events",
        selectedEvent.id,
        "documentationReport",
        "report"
      );
      await setDoc(reportRef, {
        createdAt: serverTimestamp(),
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        compiledBy: compiledBy,
        notedBy: "Hon. Ma. Julianna M. Santiago",
        photos: uploadResults,
        pdfUrl: pdfDownloadURL,
        pdfSize: pdfSize,
      });

      // Store PDF URL in sessionStorage for viewing
      sessionStorage.setItem("generatedPDFUrl", pdfDownloadURL);

      alert(`Report generated successfully! PDF size: ${(pdfSize / 1024).toFixed(2)}KB`);
      router.push(
        "/transparency-report/Documentation-Report/DocumentationFile"
      );
    } catch (error) {
      console.error("Error generating report:", error);
      alert(`Error generating report: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Transparency Report
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Create reports and activities for internal tracking.
        </p>
      </div>

      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">
            Documentation Report
          </h2>
        </div>

        <div className="px-8 py-6 space-y-6">
          <div>
            <label className="block text-lg font-medium mb-2">
              Community Event
            </label>
            <select
              value={communityEvent}
              onChange={(e) => setCommunityEvent(e.target.value)}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md"
              disabled={isGenerating}
            >
              <option value="">-- Select an Event --</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-lg font-medium mb-2">
              Compiled By
            </label>
            <input
              type="text"
              value={compiledBy}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md"
              placeholder="Loading user name..."
              disabled={true}
            />
          </div>

          {sections.map((section) => (
            <div key={section}>
              <label className="block text-lg font-medium mb-2">{section}</label>
              <p className="text-xs text-gray-500 mb-2">
                Images will be automatically compressed to reduce file size
              </p>
              {fileInputsBySection[section].map((input) => (
                <div
                  key={input.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-2 mb-2"
                >
                  <div className="flex flex-1 min-w-[250px]">
                    <label className="bg-gray-300 text-black px-4 py-2 rounded-l-md text-sm cursor-pointer whitespace-nowrap">
                      Choose File
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isGenerating}
                        onChange={(e) =>
                          handleFileChange(
                            section,
                            input.id,
                            e.target.files?.[0] || null
                          )
                        }
                      />
                    </label>
                    <div className="flex-1 bg-white border border-gray-300 border-l-0 px-3 py-[0.6rem] text-sm text-gray-800 rounded-r-md truncate">
                      {input.file ? input.file.name : "No file chosen"}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2 md:mt-0">
                    <button
                      onClick={() => handleAddNewInput(section)}
                      disabled={isGenerating}
                      className="bg-[#1167B1] text-white text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
                    >
                      Add New
                    </button>
                    <button
                      onClick={() => handleDeleteInput(section, input.id)}
                      disabled={fileInputsBySection[section].length === 1 || isGenerating}
                      className={`text-sm px-4 py-2 rounded ${
                        fileInputsBySection[section].length === 1 || isGenerating
                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-[#CE1226] text-white hover:opacity-90"
                      }`}
                    >
                      Delete Photo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {isFormIncomplete && (
            <p className="text-red-500 text-sm mt-2">
              Please fill in all the fields (event and photos) before proceeding.
            </p>
          )}

          <div className="bg-blue-50 p-4 rounded-md">
            <h3 className="font-medium text-blue-800 mb-2">Compression Info:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Images will be compressed to ~50KB for PDF generation</li>
              <li>• Images will be compressed to ~100KB for storage</li>
              <li>• This ensures faster loading and smaller file sizes</li>
              <li>• Original image quality may be reduced for optimization</li>
            </ul>
          </div>

          <div className="flex justify-center pt-6 border-t">
            <button
              className="bg-[#1167B1] text-white px-6 py-2 rounded-md mr-4 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "Compressing & Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default DocumentationReport;