"use client";
import Navbar from "../../Components/Navbar";
import Link from "next/link";
import { useState, useEffect } from "react";
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AttendanceRecord {
  action: string;
  barangay: string;
  checkInTime: string;
  docId: string;
  email: string;
  eventId: string;
  name: string;
  phone: string;
  status: string;
  submittedAt: string | number | Date;
  userId: string;
}

interface Event {
  id: string;
  title?: string;
  name?: string;
  date?: string;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};

const loadLogos = async () => {
  try {
    const skResponse = await fetch("/SKLogo.png");
    const skBlob = await skResponse.blob();
    const skLogoDataUrl = await blobToBase64(skBlob);

    const marikinaResponse = await fetch("/MarikinaLogo.png");
    const marikinaBlob = await marikinaResponse.blob();
    const marikinaLogoDataUrl = await blobToBase64(marikinaBlob);

    return { skLogoDataUrl, marikinaLogoDataUrl };
  } catch (error) {
    console.warn("Logo images failed to load", error);
    return { skLogoDataUrl: "", marikinaLogoDataUrl: "" };
  }
};

const addPDFHeader = async (pdf: jsPDF, selectedEvent: Event) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const { skLogoDataUrl, marikinaLogoDataUrl } = await loadLogos();

  // Smaller logos with reduced gaps:
  const logoY = margin;
  if (skLogoDataUrl) pdf.addImage(skLogoDataUrl, "PNG", margin, logoY, 40, 30);
  if (marikinaLogoDataUrl)
    pdf.addImage(marikinaLogoDataUrl, "PNG", pageWidth - margin - 30, logoY, 30, 30);

  // Header text with minimal spacing:
  let yPos = logoY + 8;
  pdf.setFont("times", "italic");
  pdf.setFontSize(18);
  pdf.text("Republic of the Philippines", pageWidth / 2, yPos, { align: "center" });

  yPos += 5;
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  pdf.text("National Capital Region, Metropolitan Manila", pageWidth / 2, yPos, { align: "center" });

  yPos += 5;
  pdf.text("City of Marikina", pageWidth / 2, yPos, { align: "center" });

  yPos += 5;
  pdf.text("3rd Floor, Marikina New Legislative Building", pageWidth / 2, yPos, { align: "center" });

  yPos += 5;
  pdf.text("Email Address: skfederationmarikinacity@gmail.com", pageWidth / 2, yPos, { align: "center" });

     yPos += 15;
    pdf.setFontSize(14);
    pdf.setFont("times", "bold");
    pdf.text(
      "OFFICE OF THE SANGGUNINANG KABATAAN FEDERATION",
      pageWidth / 2,
      yPos,
      { align: "center" }
    );

  yPos += 10;
  pdf.setFont("times", "normal");
  pdf.setFontSize(12);
  pdf.text(
    `${selectedEvent.title || selectedEvent.name || "Event Report"} - Documentation Report`,
    pageWidth / 2,
    yPos,
    { align: "center" }
  );

  return yPos + 5;
};

const checkPageBreak = (pdf: jsPDF, yPos: number, pageHeight: number, margin: number) => {
  if (yPos > pageHeight - margin - 60) {
    pdf.addPage();
    return margin + 20;
  }
  return yPos;
};

const TransparencyReport = () => {
  const [selectedEvent, setSelectedEvent] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<AttendanceRecord[]>([]);
  const [checkedInAttendees, setCheckedInAttendees] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError("");

        const eventsSnapshot = await getDocs(collection(db, "events"));
        const eventsList: Event[] = [];

        if (!eventsSnapshot.empty) {
          eventsSnapshot.forEach((doc) => {
            const data = doc.data();
            eventsList.push({
              id: doc.id,
              title: data.title || data.name || doc.id,
              name: data.name || data.title,
              date: data.date || data.createdAt,
            });
          });
        }

        if (eventsList.length === 0) {
          const attendanceSnapshot = await getDocs(collection(db, "eventAttendance"));
          const uniqueEventIds = new Set<string>();

          attendanceSnapshot.forEach((doc) => {
            const data = doc.data() as AttendanceRecord;
            if (data.eventId && !uniqueEventIds.has(data.eventId)) {
              uniqueEventIds.add(data.eventId);
              eventsList.push({
                id: data.eventId,
                title: data.eventId,
                name: data.eventId,
              });
            }
          });
        }

        eventsList.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
        setEvents(eventsList);
      } catch (error) {
        console.error("Error fetching events:", error);
        setError("Failed to load events. Please check your database connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  useEffect(() => {
    if (!selectedEvent) {
      setAttendees([]);
      setCheckedInAttendees([]);
      return;
    }

    const fetchAttendees = async () => {
      setLoadingAttendees(true);
      setError("");

      try {
        const q = query(collection(db, "eventAttendance"), where("eventId", "==", selectedEvent));
        const querySnapshot = await getDocs(q);
        const allRecords: AttendanceRecord[] = [];
        const checkedInMap = new Map<string, AttendanceRecord>();

        querySnapshot.forEach((doc) => {
          const data = { ...doc.data(), docId: doc.id } as AttendanceRecord;
          allRecords.push(data);
          const status = (data.status || "").toLowerCase();
          const action = (data.action || "").toLowerCase();

          if (status === "checked in" || action === "check in") {
            if (!checkedInMap.has(data.userId)) {
              checkedInMap.set(data.userId, data);
            } else {
              const existing = checkedInMap.get(data.userId)!;
              const existingTime = new Date(existing.checkInTime || 0).getTime();
              const newTime = new Date(data.checkInTime || 0).getTime();
              if (newTime > existingTime) checkedInMap.set(data.userId, data);
            }
          }
        });

        const uniqueCheckedIn = Array.from(checkedInMap.values()).sort(
          (a, b) => new Date(b.checkInTime || 0).getTime() - new Date(a.checkInTime || 0).getTime()
        );

        setAttendees(allRecords);
        setCheckedInAttendees(uniqueCheckedIn);
      } catch (error) {
        console.error("Error fetching attendees:", error);
        setError("Failed to load attendees. Please try again.");
      } finally {
        setLoadingAttendees(false);
      }
    };

    fetchAttendees();
  }, [selectedEvent]);

  const getSelectedEventTitle = () => {
    const event = events.find((e) => e.id === selectedEvent);
    return event?.title || event?.name || selectedEvent;
  };

  const generatePDF = async (attendees: AttendanceRecord[]) => {
    const pdf = new jsPDF();
    const selectedEventData = events.find((e) => e.id === selectedEvent)!;
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;

    const yPos = await addPDFHeader(pdf, selectedEventData);

    autoTable(pdf, {
      startY: yPos,
      head: [["Name", "Email", "Phone", "Barangay", "Check-In Time"]],
      body: attendees.map((a) => [
        a.name || "N/A",
        a.email || "N/A",
        a.phone || "N/A",
        a.barangay || "N/A",
        a.checkInTime ? new Date(a.checkInTime).toLocaleString() : "N/A",
      ]),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [17, 103, 177], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 248, 255] },
      margin: { left: margin, right: margin },
    });

    interface jsPDFWithLastAutoTable extends jsPDF {
      lastAutoTable?: { finalY: number };
    }
    const typedPdf = pdf as jsPDFWithLastAutoTable;
    const finalY = typedPdf.lastAutoTable?.finalY || yPos + 100;
    let footerY = checkPageBreak(pdf, finalY + 60, pageHeight, margin);
    if (footerY === margin + 20) footerY = pageHeight - 100;

    pdf.setFontSize(12);
    pdf.setFont("times", "normal");

    return pdf;
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">Transparency Report</h1>
        <p className="text-lg text-gray-600 mt-1">
          Generate attendance reports for checked-in participants.
        </p>
      </div>
      <Navbar />

      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">Attendance Report</h2>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-100 border border-red-300 rounded-md text-red-700">
            {error}
          </div>
        )}

        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Event</label>
            {loading ? (
              <p className="text-gray-600">Loading events...</p>
            ) : events.length === 0 ? (
              <p className="text-gray-600">No events found in the database.</p>
            ) : (
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <select
                    className="w-full border border-gray-300 rounded-md p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                  >
                    <option value="">-- Select Event --</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title || event.name || event.id}
                        {event.date && ` (${new Date(event.date).toLocaleDateString()})`}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="bg-[#FCD116] text-gray-800 px-6 py-3 rounded-md hover:bg-yellow-400 font-medium transition-colors disabled:opacity-50"
                  onClick={async () => {
                    if (!selectedEvent || loadingAttendees) return;
                    if (checkedInAttendees.length === 0) {
                      alert("No checked-in attendees found for this event.");
                      return;
                    }
                    const pdf = await generatePDF(checkedInAttendees);
                    window.open(pdf.output("bloburl"), "_blank");
                  }}
                  disabled={!selectedEvent || loadingAttendees}
                >
                  Generate Preview
                </button>
              </div>
            )}
          </div>

          {selectedEvent && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">
                Event Summary: {getSelectedEventTitle()}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-700">Total Records:</span>
                  <span className="ml-2 text-blue-600">{attendees.length}</span>
                </div>
                <div>
                  <span className="font-medium text-green-700">Checked-In:</span>
                  <span className="ml-2 text-green-600">{checkedInAttendees.length}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Event Name:</span>
                  <span className="ml-2 text-gray-600">{getSelectedEventTitle()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
            Checked-In Attendees
            {selectedEvent && (
              <span className="text-sm font-normal text-gray-500">
                ({checkedInAttendees.length} attendees)
              </span>
            )}
          </h3>

          {loadingAttendees ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading attendees...</p>
            </div>
          ) : !selectedEvent ? (
            <div className="text-center py-8 text-gray-500">
              <p>Please select an event to view checked-in attendees.</p>
            </div>
          ) : checkedInAttendees.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No checked-in attendees found for this event.</p>
              {attendees.length > 0 && (
                <p className="text-sm mt-2">
                  Found {attendees.length} total attendance records, but none are marked as checked-in.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-md text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 border text-left">Name</th>
                    <th className="px-4 py-3 border text-left">Email</th>
                    <th className="px-4 py-3 border text-left">Phone</th>
                    <th className="px-4 py-3 border text-left">Barangay</th>
                    <th className="px-4 py-3 border text-left">Check-In Time</th>
                    <th className="px-4 py-3 border text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checkedInAttendees.map((a, i) => (
                    <tr key={a.docId || i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border">{a.name || "N/A"}</td>
                      <td className="px-4 py-2 border">{a.email || "N/A"}</td>
                      <td className="px-4 py-2 border">{a.phone || "N/A"}</td>
                      <td className="px-4 py-2 border">{a.barangay || "N/A"}</td>
                      <td className="px-4 py-2 border">
                        {a.checkInTime ? new Date(a.checkInTime).toLocaleString() : "N/A"}
                      </td>
                      <td className="px-4 py-2 border capitalize">{a.status || "checked in"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransparencyReport;
