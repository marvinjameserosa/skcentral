"use client";
// components/TransparencyReport.tsx
import Navbar from "../../Components/Navbar";
import Link from "next/link";
import { useState, useEffect } from "react";
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

// PDF libraries
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

// Helper function to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Helper function to compress image
const compressImageToKB = async (
  imgDataUrl: string,
  targetSizeKB: number = 50,
  preserveTransparency: boolean = true
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      let quality = 0.9;
      let compressedDataUrl = canvas.toDataURL(
        preserveTransparency ? 'image/png' : 'image/jpeg',
        quality
      );
      
      const sizeKB = (compressedDataUrl.length * 0.75) / 1024;
      
      if (sizeKB > targetSizeKB && !preserveTransparency) {
        quality = Math.max(0.1, targetSizeKB / sizeKB * quality);
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      
      resolve(compressedDataUrl);
    };
    img.src = imgDataUrl;
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
const addPDFHeader = async (pdf: jsPDF, selectedEvent: Event) => {
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
    `${selectedEvent.title || selectedEvent.name || selectedEvent.id} - Documentation Report`,
    pageWidth / 2,
    yPos,
    { align: "center" }
  );
  
  yPos += 14;
  pdf.setFontSize(12);
  pdf.setFont("times", "normal");
  pdf.text(
    `Generated on: ${new Date().toLocaleDateString()}`,
    pageWidth / 2,
    yPos,
    { align: "center" }
  );
  
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

const TransparencyReport = () => {
  const [selectedEvent, setSelectedEvent] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<AttendanceRecord[]>([]);
  const [checkedInAttendees, setCheckedInAttendees] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [error, setError] = useState<string>("");

  // Fetch events
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

  // Fetch attendees when event is selected
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
        const q = query(
          collection(db, "eventAttendance"),
          where("eventId", "==", selectedEvent)
        );

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
              if (newTime > existingTime) {
                checkedInMap.set(data.userId, data);
              }
            }
          }
        });

        const uniqueCheckedIn = Array.from(checkedInMap.values());

        uniqueCheckedIn.sort(
          (a, b) =>
            new Date(b.checkInTime || 0).getTime() -
            new Date(a.checkInTime || 0).getTime()
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

  // Generate PDF document for checked-in attendees
  const generatePDF = async (attendees: AttendanceRecord[]) => {
    const doc = new jsPDF();
    const selectedEventData = events.find((e) => e.id === selectedEvent)!;
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    // Add header
    const yPos = await addPDFHeader(doc, selectedEventData);

    // Add attendance table
    autoTable(doc, {
      startY: yPos,
      head: [["Name", "Email", "Phone", "Barangay", "Check-In Time"]],
      body: attendees.map((a) => [
        a.name || "N/A",
        a.email || "N/A",
        a.phone || "N/A",
        a.barangay || "N/A",
        a.checkInTime ? new Date(a.checkInTime).toLocaleString() : "N/A",
      ]),
      styles: { 
        fontSize: 10,
        cellPadding: 3
      },
      headStyles: { 
        fillColor: [17, 103, 177],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: { 
        fillColor: [240, 248, 255] 
      },
      margin: { left: margin, right: margin }
    });

    // Get final Y position after table
    interface AutoTableResults {
      finalY: number;
    }
    interface EnhancedJsPDF extends jsPDF {
      lastAutoTable?: AutoTableResults;
    }
    const finalY = (doc as EnhancedJsPDF).lastAutoTable?.finalY || yPos + 100;

    // Check if we need a new page for footer
    let footerY = checkPageBreak(doc, finalY + 60, pageHeight, margin);
    
    // If a new page was added, adjust footerY
    if (footerY === margin + 40) {
      footerY = pageHeight - 100;
    } else {
      footerY = Math.max(finalY + 60, pageHeight - 100);
    }

    // Add footer with signatures
    doc.setFontSize(12);
    doc.setFont("times", "normal");
    
    const leftSignatureX = margin + 20;
    const rightSignatureX = doc.internal.pageSize.getWidth() / 2 + 20;
    
    // Compiled By section
    doc.text("Compiled By:", leftSignatureX, footerY);
    doc.line(leftSignatureX, footerY + 15, leftSignatureX + 100, footerY + 15);
    doc.setFontSize(10);
    doc.text("SK Federation Secretary", leftSignatureX, footerY + 25);
    
    // Noted By section
    doc.setFontSize(12);
    doc.text("Noted By:", rightSignatureX, footerY);
    doc.line(rightSignatureX, footerY + 15, rightSignatureX + 100, footerY + 15);
    doc.setFont("times", "bold");
    doc.text("Hon. Ma. Julianna M. Santiago", rightSignatureX, footerY + 25);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text("SK Federation President", rightSignatureX, footerY + 35);

    return doc;
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Transparency Report
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Generate attendance reports for checked-in participants.
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
            Attendance Report
          </h2>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-100 border border-red-300 rounded-md text-red-700">
            {error}
          </div>
        )}

        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Event
            </label>
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
                        {event.date &&
                          ` (${new Date(event.date).toLocaleDateString()})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    className="bg-[#FCD116] text-gray-800 px-6 py-3 rounded-md hover:bg-yellow-400 font-medium transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!selectedEvent || loadingAttendees) return;
                      if (checkedInAttendees.length === 0) {
                        alert("No checked-in attendees found for this event.");
                        return;
                      }
                      const doc = await generatePDF(checkedInAttendees);
                      window.open(doc.output("bloburl"), "_blank");
                    }}
                    disabled={!selectedEvent || loadingAttendees}
                  >
                    Generate Preview
                  </button>
                </div>
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
                  <span className="font-medium text-blue-700">
                    Total Records:
                  </span>
                  <span className="ml-2 text-blue-600">{attendees.length}</span>
                </div>
                <div>
                  <span className="font-medium text-green-700">Checked-In:</span>
                  <span className="ml-2 text-green-600">
                    {checkedInAttendees.length}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Event Name:</span>
                  <span className="ml-2 text-gray-600">
                    {getSelectedEventTitle()}
                  </span>
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
                  Found {attendees.length} total attendance records, but none are
                  marked as checked-in.
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
                  {checkedInAttendees.map((attendee, idx) => (
                    <tr
                      key={attendee.docId || idx}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 border">
                        {attendee.name || "N/A"}
                      </td>
                      <td className="px-4 py-2 border">
                        {attendee.email || "N/A"}
                      </td>
                      <td className="px-4 py-2 border">
                        {attendee.phone || "N/A"}
                      </td>
                      <td className="px-4 py-2 border">
                        {attendee.barangay || "N/A"}
                      </td>
                      <td className="px-4 py-2 border">
                        {attendee.checkInTime
                          ? new Date(attendee.checkInTime).toLocaleString()
                          : "N/A"}
                      </td>
                      <td className="px-4 py-2 border">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                          Checked In
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Navbar />
    </div>
  );
};

export default TransparencyReport;