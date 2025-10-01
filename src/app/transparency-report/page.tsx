"use client";
import React, { useEffect, useState } from "react";
import Navbar from "../Components/Navbar";
import { db, storage } from "@/app/Firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";

interface Report {
  title: string;
}

interface EventItem {
  id: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Map UI report titles to the subcollection name where the report doc is stored.
 * Update these keys if your Firestore subcollection names differ.
 */
const REPORT_COLLECTION_MAP: Record<string, string> = {
  "Documentation Report": "documentationReport",
  "Official Receipt Compilation": "officialReceiptCompilation",
  "Project Design And Brief": "projectDesignBrief",
  "Attendance Report": "attendanceReport",
};

const TransparencyReport: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);

  const closeModal = () => {
    setSelectedReport(null);
    setSelectedEvent(null);
    setPdfUrl(null);
  };

  // Fetch events from Firestore when a report modal is opened
  useEffect(() => {
    const fetchEvents = async () => {
      if (!selectedReport) {
        setEvents([]);
        return;
      }

      setLoadingEvents(true);
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const fetched: EventItem[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const title = typeof data.title === "string" ? data.title : undefined;
          fetched.push({ id: docSnap.id, title, ...data } as EventItem);
        });
        setEvents(fetched);
        console.log("Fetched events:", fetched);
      } catch (err) {
        console.error("Error fetching events:", err);
        setEvents([]);
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchEvents();
  }, [selectedReport]);

  // When user selects an event: fetch the report doc from the corresponding subcollection
  const handleSelectEvent = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId) ?? null;
    setSelectedEvent(event);
    setPdfUrl(null);

    if (!event) return;

    setLoadingPdf(true);
    try {
      const collectionName =
        REPORT_COLLECTION_MAP[selectedReport?.title ?? "Documentation Report"] ??
        "documentationReport";

      const reportRef = doc(db, "events", event.id, collectionName, "report");
      const reportSnap = await getDoc(reportRef);

      if (reportSnap.exists()) {
        const data = reportSnap.data() as Record<string, unknown>;
        if (typeof data.pdfUrl === "string" && data.pdfUrl.length > 0) {
          let finalUrl = data.pdfUrl;

          // If it's not already an HTTPS link, treat it as a storage path
          if (!finalUrl.startsWith("http")) {
            const storageRef = ref(storage, finalUrl);
            finalUrl = await getDownloadURL(storageRef);
          }

          setPdfUrl(finalUrl);
          console.log("PDF URL found:", finalUrl);
        } else {
          setPdfUrl(null);
          console.warn("Report document exists but has no valid `pdfUrl` field.");
        }
      } else {
        setPdfUrl(null);
        console.warn("No report document found in Firestore for the selected event.");
      }
    } catch (err) {
      console.error("Error fetching report document:", err);
      setPdfUrl(null);
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      {/* Page Header */}
      <div className="mb-6">
      <h1 className="text-3xl font-semibold text-gray-800">Transparency Report</h1>
      <p className="text-lg text-gray-600 mt-1">
        Create reports and activities for internal tracking.
      </p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Documentation Report */}
      <div className="bg-[#1167B1] text-white p-10 rounded-lg shadow-sm border-16 border-white text-center">
        <h2 className="text-3xl font-semibold">Documentation Report</h2>
        <p className="text-xl mt-2 mb-6">
        Covers activities and internal documentation of events.
        </p>
        <div className="mt-6 flex justify-center gap-4">
        <a
          href="/transparency-report/Documentation-Report"
          className="bg-white text-[#1167B1] px-6 py-3 font-semibold rounded shadow hover:bg-gray-200"
        >
          CREATE
        </a>
        </div>
      </div>

      {/* Official Receipt Compilation */}
      <div className="bg-[#1167B1] text-white p-10 rounded-lg shadow-sm border-16 border-white text-center">
        <h2 className="text-3xl font-semibold">Official Receipt Compilation</h2>
        <p className="text-xl mt-2 mb-6">Compiled receipts for financial transparency.</p>
        <div className="mt-6 flex justify-center gap-4">
        <a
          href="/transparency-report/Official-Receipt-Compilation"
          className="bg-white text-[#1167B1] px-6 py-3 font-semibold rounded shadow hover:bg-gray-200"
        >
          CREATE
        </a>
        </div>
      </div>

      {/* Project Design And Brief */}
      <div className="bg-[#1167B1] text-white p-10 rounded-lg shadow-sm border-16 border-white text-center">
        <h2 className="text-3xl font-semibold">Project Design And Brief</h2>
        <p className="text-xl mt-2 mb-6">Project proposals, designs, and other details.</p>
        <div className="mt-6 flex justify-center gap-4">
        <a
          href="/transparency-report/Project-Design-Brief"
          className="bg-white text-[#1167B1] px-6 py-3 font-semibold rounded shadow hover:bg-gray-200"
        >
          CREATE
        </a>
        </div>
      </div>

      {/* Attendance Report */}
      <div className="bg-[#1167B1] text-white p-10 rounded-lg shadow-sm border-16 border-white text-center">
        <h2 className="text-3xl font-semibold">Attendance Report</h2>
        <p className="text-xl mt-2 mb-6">Attendance tracking and summaries for all events.</p>
        <div className="mt-6 flex justify-center gap-4">
        <a
          href="/transparency-report/Attendance-Report"
          className="bg-white text-[#1167B1] px-6 py-3 font-semibold rounded shadow hover:bg-gray-200"
        >
          CREATE
        </a>
        </div>
      </div>
      </div>

      {/* Modal */}
      {selectedReport && (
      <div className="fixed inset-0 bg-opacity-75 backdrop-blur-md flex justify-center items-center z-50">
        <div className="bg-white rounded-lg p-6 w-3/4 h-[90vh] relative shadow-2xl border-4 border-white overflow-auto">
        <button
          className="absolute top-2 right-2 w-10 h-10 bg-red-500 text-white text-xl rounded-full flex items-center justify-center hover:bg-red-700"
          onClick={closeModal}
        >
          &times;
        </button>

        <h2 className="text-xl font-bold text-center mb-2">
          {selectedReport?.title}
        </h2>

        {/* Dropdown to select event */}
        <div className="mb-4 text-center">
          {loadingEvents ? (
          <div className="text-sm text-gray-500">Loading events...</div>
          ) : (
          <select
            className="px-4 py-2 border rounded"
            defaultValue=""
            onChange={(e) => handleSelectEvent(e.target.value)}
          >
            <option value="">Select an event</option>
            {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title || event.id}
            </option>
            ))}
          </select>
          )}
        </div>

        {/* PDF Preview */}
        <div className="mt-4 text-center">
          {loadingPdf ? (
            <div className="text-sm text-gray-500">Loading report...</div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="Report Preview"
              className="w-full h-[590px] border"
            />
          ) : (
            <p className="text-center text-gray-500">
              {selectedEvent ? "No PDF report found for this event." : "Select an event to view its PDF report."}
            </p>
          )}
        </div>
        </div>
      </div>
      )}

      <Navbar />
    </div>
  );
};

export default TransparencyReport;
