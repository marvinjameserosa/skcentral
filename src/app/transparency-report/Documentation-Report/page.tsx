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
  query,
  where,
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
  const [fileInputsBySection, setFileInputsBySection] = useState<Record<string, FileInput[]>>(() => {
    const initialState: Record<string, FileInput[]> = {};
    sections.forEach((section: string) => {
      initialState[section] = [{ id: Date.now(), file: null }];
    });
    return initialState;
  });
  const [isFormIncomplete, setIsFormIncomplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [compiledBy, setCompiledBy] = useState("");
  const [user] = useAuthState(auth);
  const router = useRouter();

  // Fetch events from Firestore and user name from approvedUsers
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
          const q = query(collection(db, "adminUsers"), where("uid", "==", user.uid));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            const userName = userData.name || "Unknown User";
            setCompiledBy(userName);
            console.log("Fetched user name:", userName);
          } else {
            console.warn("User not found in adminUsers collection");
            setCompiledBy("Unknown User");
          }
        } catch (error) {
          console.error("Error fetching user name from adminUsers collection:", error);
          setCompiledBy("Unknown User");
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
    setFileInputsBySection((prev: Record<string, FileInput[]>) => ({
      ...prev,
      [section]: prev[section].map((input: FileInput) =>
        input.id === id ? { ...input, file } : input
      ),
    }));
  };

  const handleAddNewInput = (section: string) => {
    setFileInputsBySection((prev: Record<string, FileInput[]>) => ({
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
      setFileInputsBySection((prev: Record<string, FileInput[]>) => {
        const updated = prev[section].filter((input: FileInput) => input.id !== id);
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

  // Helper function to compress image
  const compressImage = (file: File, maxSizeKB: number = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Calculate new dimensions to maintain aspect ratio
          let width = img.width;
          let height = img.height;
          const maxDimension = 1200; // Max width or height
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Start with quality 0.7 and adjust if needed
          let quality = 0.7;
          let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // Check size and reduce quality if needed
          while (compressedDataUrl.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
            quality -= 0.1;
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  // Helper function to convert file to base64
  const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper function to load image and get dimensions for PDF
  const loadImageForPDF = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Reasonable dimensions for PDF display
        const maxWidth = 450;
        const maxHeight = 400;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const ratio = Math.min(widthRatio, heightRatio);
          width *= ratio;
          height *= ratio;
        }

        resolve({ width, height });
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
      const skLogoDataUrl = await fileToBase64(skLogoBlob);

      const marikinaLogoResponse = await fetch("/MarikinaLogo.png");
      const marikinaLogoBlob = await marikinaLogoResponse.blob();
      const marikinaLogoDataUrl = await fileToBase64(marikinaLogoBlob);

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

    // Add logos
    if (skLogoDataUrl) {
      pdf.addImage(skLogoDataUrl, "PNG", margin, 38, 100, 80);
    }
    if (marikinaLogoDataUrl) {
      pdf.addImage(marikinaLogoDataUrl, "PNG", pageWidth - margin - 80, 38, 80, 80);
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

  // Generate PDF with compressed images
  const generatePDF = async (selectedEvent: EventItem, imageDataForPDF: Record<string, string[]>) => {
    const pdf = new jsPDF({ 
      unit: "pt", 
      format: "a4", 
      compress: true 
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    
    // Add header
    let y = await addPDFHeader(pdf, selectedEvent);

    // Process each section
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

      // Add images for this section
      for (let i = 0; i < imageDataForPDF[section].length; i++) {
        try {
          const { width, height } = await loadImageForPDF(imageDataForPDF[section][i]);
          
          // Check if we need a new page for the image
          if (y + height > pageHeight - margin - 60) {
            pdf.addPage();
            y = margin + 40;
          }

          const x = (pageWidth - width) / 2; // Center the image
          pdf.addImage(imageDataForPDF[section][i], "JPEG", x, y, width, height);
          y += height + 20;
        } catch (error) {
          console.error("Error adding image to PDF:", error);
          // Add a placeholder text instead of the image
          pdf.setFontSize(10);
          pdf.text("(Image could not be loaded)", margin, y);
          y += 20;
        }
      }

      y += 15; // Space between sections
    }

    // Add signatures section at the end
    y = checkPageBreak(pdf, y + 40, pageHeight, margin);
    
    pdf.setFontSize(12);
    pdf.setFont("times", "normal");
    pdf.text(`Compiled By: ${compiledBy}`, margin, y);
    y += 14; // Add one line space before "Noted By"
    pdf.text("Noted By: Hon. Ma. Julianna M. Santiago", margin, y);

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
      `Are you sure you want to add all entries? This will process ${totalFiles} photos and generate a compressed PDF (max 5MB).`
    );
    if (!confirmed) return;

    setIsGenerating(true);

    try {
      // Save uploaded files to Firebase Storage & Firestore
      const uploadResults: Record<string, string[]> = {};
      const imageDataForPDF: Record<string, string[]> = {}; // Store compressed base64 data for PDF

      for (const section of sections) {
        uploadResults[section] = [];
        imageDataForPDF[section] = [];

        for (const input of fileInputsBySection[section]) {
          if (input.file) {
            try {
              // Compress image for PDF generation
              const compressedBase64 = await compressImage(input.file, 800);
              imageDataForPDF[section].push(compressedBase64);

              // Upload original image to Firebase Storage
              const storageRef = ref(
                storage,
                `events/${selectedEvent.id}/${section}/${input.file.name}`
              );
              await uploadBytes(storageRef, input.file);
              const downloadURL = await getDownloadURL(storageRef);
              uploadResults[section].push(downloadURL);
            } catch (error) {
              console.error(`Error processing file ${input.file.name}:`, error);
              throw new Error(`Failed to process file: ${input.file.name}`);
            }
          }
        }
      }

      // Generate PDF with compressed images
      const pdf = await generatePDF(selectedEvent, imageDataForPDF);
      
      // Get PDF as blob with compression
      const pdfBlob = pdf.output("blob");
      const pdfSize = pdfBlob.size;
      
      console.log(`Initial PDF size: ${(pdfSize / 1024 / 1024).toFixed(2)}MB`);

      // Check if PDF exceeds 5MB and warn user
      if (pdfSize > 5 * 1024 * 1024) {
        console.warn(`PDF size (${(pdfSize / 1024 / 1024).toFixed(2)}MB) exceeds 5MB. Consider reducing the number of photos or image quality.`);
        alert(`Warning: PDF size is ${(pdfSize / 1024 / 1024).toFixed(2)}MB, which exceeds the 5MB target. The PDF will still be generated, but it may take longer to load.`);
      }

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

      alert(`Report generated successfully! PDF size: ${(pdfSize / 1024 / 1024).toFixed(2)}MB`);
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
            <h3 className="font-medium text-blue-800 mb-2">PDF Generation Info:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Images will be compressed to reduce PDF file size</li>
              <li>• Target PDF size is under 5MB for optimal performance</li>
              <li>• Original high-quality images will be stored in Firebase</li>
              <li>• Generation may take 1-2 minutes depending on the number of photos</li>
            </ul>
          </div>

          <div className="flex justify-center pt-6 border-t">
            <button
              className="bg-[#1167B1] text-white px-6 py-2 rounded-md mr-4 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating PDF..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default DocumentationReport;