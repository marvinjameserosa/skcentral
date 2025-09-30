"use client";
import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../../Components/Navbar";
import { jsPDF } from "jspdf";

// Firebase
import { db, storage } from "@/app/Firebase/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    fetchEvents();
  }, []);

  // Fetch events from Firestore (using "title" field)
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

  // Generate PDF
  const generatePDF = async (entriesToProcess: Entry[], title: string) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    // Logos (from /public)
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
    doc.text("Republic of the Philippines", pageWidth / 2, yPos, {
      align: "center",
    });

    yPos += 23;
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    doc.text(
      "National Capital Region, Metropolitan Manila",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

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
          const dataUrl = await readFileAsDataURL(entry.file);
          const img = await loadImage(dataUrl);

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
            dataUrl,
            entry.file.type === "image/png" ? "PNG" : "JPEG",
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
        createdAt: serverTimestamp(),
      });

      // Save to localStorage (instant preview)
      localStorage.setItem("generatedPDF", downloadURL);

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
          <h2 className="text-center text-3xl font-semibold">
            Official Receipt Compilation
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Select Event */}
          <div className="flex flex-col">
            <label className="mb-2 font-medium text-gray-700">Select Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="p-2 border border-gray-300 rounded-md text-sm font-medium"
            >
              <option value="">-- Select Event --</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col md:flex-row items-center gap-4"
            >
              <input
                type="text"
                value={entry.description}
                onChange={(e) => handleDescriptionChange(e, entry.id)}
                placeholder="Purpose / Description of Payment"
                className="p-2 border border-gray-300 rounded-md w-full md:w-1/2 text-sm font-medium"
              />

              <div className="w-full md:w-1/2 border border-gray-300 rounded-md h-10 flex items-center overflow-hidden">
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[entry.id]?.click()}
                  className="bg-gray-200 px-5 h-full text-sm font-medium text-gray-700 hover:bg-gray-300 flex-shrink-0"
                >
                  Choose File
                </button>
                <span className="text-sm text-gray-600 px-3 truncate w-full text-left">
                  {entry.file ? entry.file.name : "No file chosen"}
                </span>
                <input
                  type="file"
                  ref={(el) => {
                    fileInputRefs.current[entry.id] = el;
                  }}
                  className="hidden"
                  onChange={(e) => handleFileChange(e, entry.id)}
                />
              </div>

              <button
                onClick={() => deleteEntry(entry.id)}
                className="bg-red-500 text-white px-4 py-2 rounded-md h-fit"
              >
                Delete
              </button>
            </div>
          ))}

          <hr className="border-t border-gray-300 my-4" />

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={addEntry}
              className="bg-yellow-500 text-white px-4 py-2 rounded-md"
              disabled={isGenerating}
            >
              New Item
            </button>
            <button
              onClick={addAllEntries}
              className={`px-4 py-2 rounded-md text-white ${
                isGenerating ? "bg-gray-400" : "bg-blue-500"
              }`}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating PDF..." : "Add All Entries"}
            </button>
          </div>
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default TransparencyReport;
