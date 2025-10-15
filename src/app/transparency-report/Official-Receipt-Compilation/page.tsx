"use client";
import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../../Components/Navbar";
import { jsPDF } from "jspdf";

// Firebase
import { db, storage, auth } from "@/app/Firebase/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuthState } from "react-firebase-hooks/auth";

interface Entry {
  id: number;
  file: File | null;
  description: string;
}

interface EventItem {
  id: string;
  name: string;
}

const TransparencyReport = () => {
  const [entries, setEntries] = useState<Entry[]>([
    { id: 1, file: null, description: "" },
  ]);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [isClient, setIsClient] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [compiledBy, setCompiledBy] = useState("");
  const [user] = useAuthState(auth);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    fetchEvents();
  }, []);

  // Fetch events from Firestore
  const fetchEvents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "events"));
      const fetchedEvents: EventItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedEvents.push({
          id: doc.id,
          name: data.title || "Untitled Event",
        });
      });
      setEvents(fetchedEvents);
    } catch (err) {
      console.error("Error fetching events:", err);
    }
  };

  // Fetch user name from adminUsers collection
  useEffect(() => {
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
          console.error("Error fetching user name from adminUsers:", error);
          setCompiledBy("Unknown User");
        }
      } else {
        setCompiledBy("Unknown User");
      }
    };

    fetchUserName();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, id: number) => {
    const file = e.target.files?.[0] || null;
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, file } : entry))
    );
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    id: number
  ) => {
    const description = e.target.value;
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, description } : entry))
    );
  };

  const addEntry = () => {
    setEntries((prev) => {
      const ids = prev.map((p) => p.id);
      const newId = ids.length ? Math.max(...ids) + 1 : 1;
      return [...prev, { id: newId, file: null, description: "" }];
    });
  };

  const deleteEntry = (id: number) => {
    const confirmed = window.confirm("Are you sure you want to delete this entry?");
    if (confirmed) {
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      delete fileInputRefs.current[id];
    }
  };

  // Convert file/blob to Data URL
  const readFileAsDataURL = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Load image from Data URL
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
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

  // Page break helper
  const checkPageBreak = (
    doc: jsPDF,
    yPos: number,
    pageHeight: number,
    margin: number
  ) => {
    if (yPos > pageHeight - margin - 100) {
      doc.addPage();
      return margin + 40;
    }
    return yPos;
  };

  // Generate PDF with compression
  const generatePDF = async (entriesToProcess: Entry[], title: string) => {
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    // Logos
    try {
      const skLogoResponse = await fetch("/SKLogo.png");
      const skLogoBlob = await skLogoResponse.blob();
      const skLogoDataUrl = await readFileAsDataURL(skLogoBlob as Blob);
      doc.addImage(skLogoDataUrl, "PNG", margin, 38, 100, 80);

      const marikinaLogoResponse = await fetch("/MarikinaLogo.png");
      const marikinaLogoBlob = await marikinaLogoResponse.blob();
      const marikinaLogoDataUrl = await readFileAsDataURL(marikinaLogoBlob as Blob);
      doc.addImage(marikinaLogoDataUrl, "PNG", pageWidth - margin - 100, 38, 100, 100);
    } catch (err) {
      console.warn("Logo image failed to load", err);
    }

    let yPos = 60;
    doc.setFont("times", "italic");
    doc.setFontSize(23);
    doc.text("Republic of the Philippines", pageWidth / 2, yPos, { align: "center" });

    yPos += 23;
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    doc.text("National Capital Region, Metropolitan Manila", pageWidth / 2, yPos, { align: "center" });

    yPos += 14;
    doc.text("City of Marikina", pageWidth / 2, yPos, { align: "center" });

    yPos += 11;
    doc.setFontSize(11);
    doc.text(
      "3rd Floor, Marikina New Legislative Building",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 11;
    doc.text(
      "Email Address: skfederationmarikinacity@gmail.com",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 34;
    doc.setFontSize(14);
    doc.setFont("times", "bold");
    doc.text(
      "OFFICE OF THE SANGGUNINANG KABATAAN FEDERATION",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 40;

    doc.setFontSize(16);
    doc.text(
      `${title} - Official Receipt Compilation`,
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

    yPos += 40;

    for (let i = 0; i < entriesToProcess.length; i++) {
      const entry = entriesToProcess[i];
      yPos = checkPageBreak(doc, yPos, pageHeight, margin);

      doc.setFont("times", "normal");
      doc.setFontSize(14);
      doc.text(`${i + 1}. ${entry.description || "(no description)"}`, margin, yPos);

      if (entry.file && entry.file.type.startsWith("image/")) {
        try {
          // Compress image before adding to PDF
          const compressedDataUrl = await compressImage(entry.file, 800);
          const img = await loadImage(compressedDataUrl);

          const maxWidth = (pageWidth - margin * 2) * 0.5;
          const availableHeight = (pageHeight - yPos - margin - 40) * 0.5;

          let imgWidth = img.width;
          let imgHeight = img.height;
          const ratio = Math.min(maxWidth / imgWidth, availableHeight / imgHeight, 1);

          imgWidth *= ratio;
          imgHeight *= ratio;

          const x = (pageWidth - imgWidth) / 2;

          if (yPos + imgHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin + 40;
          }

          doc.addImage(
            compressedDataUrl,
            "JPEG",
            x,
            yPos + 20,
            imgWidth,
            imgHeight
          );

          yPos += imgHeight + 40;
        } catch {
          yPos += 20;
          doc.text("(Unable to preview image)", margin, yPos);
        }
      } else if (entry.file && entry.file.type === "application/pdf") {
        yPos += 20;
        doc.text(
          "Attached PDF file: " + entry.file.name + " (original not embedded).",
          margin,
          yPos
        );
      } else if (entry.file) {
        yPos += 20;
        doc.text(
          "Attached file: " + entry.file.name + " (preview not available).",
          margin,
          yPos
        );
      }

      yPos += 30;
    }
    
    doc.setFontSize(12);
    doc.setFont("times", "normal");
    doc.text(`Compiled By: ${compiledBy}`, margin, yPos);
    yPos += 14; // Add one line space before "Noted By"
    doc.text("Noted By: Hon. Ma. Julianna M. Santiago", margin, yPos);
    
    return doc;
  };

  // Save PDF to Storage + Firestore
  const addAllEntries = async () => {
    if (!selectedEvent) {
      alert("Please select an event before generating the report.");
      return;
    }

    const isValid = entries.every(
      (entry) => entry.description.trim() !== "" && entry.file !== null
    );
    if (!isValid) {
      alert("Please fill in all the fields (description and file) before proceeding.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to add all entries and generate the PDF?"
    );
    if (!confirmed) return;

    try {
      setIsGenerating(true);
      alert("File is being generated. Please wait...");

      const title =
        events.find((ev) => ev.id === selectedEvent)?.name || "event";
      const doc = await generatePDF(entries, title);
      const pdfBlob = doc.output("blob");
      
      const pdfSize = pdfBlob.size;
      console.log(`Generated PDF size: ${(pdfSize / 1024 / 1024).toFixed(2)}MB`);

      // Check if PDF exceeds 5MB and warn user
      if (pdfSize > 5 * 1024 * 1024) {
        console.warn(`PDF size (${(pdfSize / 1024 / 1024).toFixed(2)}MB) exceeds 5MB.`);
        alert(`Warning: PDF size is ${(pdfSize / 1024 / 1024).toFixed(2)}MB, which exceeds the 5MB target. The PDF will still be generated, but it may take longer to load.`);
      }

      // Upload PDF to Firebase Storage
      const fileName = `${title}-Official-Receipt-Compilation-${Date.now()}.pdf`;
      const storageRef = ref(storage, `reports/${fileName}`);
      await uploadBytes(storageRef, pdfBlob);

      // Get URL
      const downloadURL = await getDownloadURL(storageRef);

      // Save metadata in Firestore
      await addDoc(collection(db, "reports"), {
        type: "official_receipt",
        eventId: selectedEvent,
        title,
        fileUrl: downloadURL,
        pdfSize: pdfSize,
        compiledBy: compiledBy,
        notedBy: "Hon. Ma. Julianna M. Santiago",
        createdAt: serverTimestamp(),
      });

      // Save to localStorage (instant preview)
      localStorage.setItem("generatedPDF", downloadURL);

      alert(`Report generated successfully! PDF size: ${(pdfSize / 1024 / 1024).toFixed(2)}MB`);
      
      router.push(
        "/transparency-report/Official-Receipt-Compilation/GeneratedOR"
      );
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("An error occurred while generating/uploading the PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isClient) return null;

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">Transparency Report</h1>
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
          <h2 className="text-center text-3xl font-semibold">Official Receipt Compilation</h2>
        </div>

        <div className="px-8 py-6 space-y-6">
          <div>
            <label className="block text-lg font-medium mb-2">Community Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md"
              disabled={isGenerating}
            >
              <option value="">-- Select an Event --</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-lg font-medium mb-2">Compiled By</label>
            <input
              type="text"
              value={compiledBy}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md"
              placeholder="Loading user name..."
              disabled={true}
            />
          </div>

          {entries.map((entry) => (
            <div key={entry.id} className="border-t pt-4">
              <label className="block text-lg font-medium mb-2">Description</label>
              <input
                type="text"
                value={entry.description}
                onChange={(e) => handleDescriptionChange(e, entry.id)}
                className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md mb-2"
                placeholder="Enter description"
                disabled={isGenerating}
              />

              <label className="block text-lg font-medium mb-2">Upload File</label>
              <div className="flex flex-wrap md:flex-nowrap items-center gap-2 mb-2">
                <div className="flex flex-1 min-w-[250px]">
                  <label className="bg-gray-300 text-black px-4 py-2 rounded-l-md text-sm cursor-pointer whitespace-nowrap">
                    Choose File
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current[entry.id] = el; }}
                        onChange={(e) => handleFileChange(e, entry.id)}
                        disabled={isGenerating}
                      />
                  </label>
                  <div className="flex-1 bg-white border border-gray-300 border-l-0 px-3 py-[0.6rem] text-sm text-gray-800 rounded-r-md truncate">
                    {entry.file ? entry.file.name : "No file chosen"}
                  </div>
                </div>

                <div className="flex gap-2 mt-2 md:mt-0">
                  <button
                    onClick={addEntry}
                    disabled={isGenerating}
                    className="bg-[#1167B1] text-white text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
                  >
                    Add New
                  </button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    disabled={entries.length === 1 || isGenerating}
                    className={`text-sm px-4 py-2 rounded ${
                      entries.length === 1 || isGenerating
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-[#CE1226] text-white hover:opacity-90"
                    }`}
                  >
                    Delete Entry
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-blue-50 p-4 rounded-md">
            <h3 className="font-medium text-blue-800 mb-2">PDF Generation Info:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Images will be compressed to reduce PDF file size</li>
              <li>• Target PDF size is under 5MB for optimal performance</li>
              <li>• Original files will be preserved in their original quality</li>
              <li>• Generation may take 1-2 minutes depending on the number of entries</li>
            </ul>
          </div>

          <div className="flex justify-center pt-6 border-t">
            <button
              className="bg-[#1167B1] text-white px-6 py-2 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={addAllEntries}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating PDF..." : "Generate Report"}
            </button>
          </div>
        </div>
      </div>

      <Navbar />
    </div>
  );
};

export default TransparencyReport;