"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/app/Firebase/firebase";
import Navbar from "@/app/Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";
import { getAuth, User } from "firebase/auth";

interface EventData {
  id: string;
  eventId: string;
  title: string;
  description: string;
  date: string;
  time: string;
  eventTime: string;
  location: string;
  image: string;
  capacity?: string;
  deadline?: string;
  tags?: string[];
}

interface EventRegistration {
  docId: string;
  barangay: string;
  email: string;
  eventId: string;
  name: string;
  phone: string;
  status: string;
}

const auth = getAuth();

// Content component that uses useSearchParams
function ManageEventContent() {
  const searchParams = useSearchParams();
  const eventIdFromURL = searchParams.get("id");

  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventRegistrations, setEventRegistrations] = useState<EventRegistration[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<EventRegistration | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EventData | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);

        try {
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Manage Event page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user",
          });
          console.log('✅ Page visit logged for Manage Event page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchEvent() {
      if (!eventIdFromURL) {
        setEventError("No event ID provided in the URL.");
        setLoadingEvent(false);
        return;
      }

      try {
        const eventRef = doc(db, "events", eventIdFromURL);
        const eventSnap = await getDoc(eventRef);

        if (eventSnap.exists()) {
          const data = eventSnap.data();
          setSelectedEvent({
            id: eventSnap.id,
            eventId: data.eventId || "",
            title: data.title || "",
            description: data.description || "",
            date: data.date || "",
            time: data.time || "",
            eventTime: data.eventTime || "",
            location: data.location || "",
            image: data.image || "/placeholder.png",
            capacity: data.capacity || "",
            deadline: data.deadline || "",
            tags: data.tags || [],
          });

          if (authUser) {
            await recordActivityLog({
              action: "View Event Details",
              details: `Viewed event details: ${data.title} (ID: ${eventIdFromURL})`,
              userId: authUser.uid,
              userEmail: authUser.email || undefined,
              category: "events",
            });
          }
        } else {
          setEventError(`No event found for ID: ${eventIdFromURL}`);
        }
      } catch (err) {
        setEventError("Error fetching event.");
        console.error(err);
        
        if (authUser) {
          await recordActivityLog({
            action: "View Event Error",
            details: `Failed to fetch event details for ID: ${eventIdFromURL}`,
            userId: authUser.uid,
            userEmail: authUser.email || undefined,
            category: "events",
            severity: "medium",
          });
        }
      } finally {
        setLoadingEvent(false);
      }
    }

    if (authUser) {
      fetchEvent();
    }
  }, [eventIdFromURL, authUser]);

  useEffect(() => {
    async function fetchEventRegistrations() {
      if (!eventIdFromURL || !authUser) return;

      try {
        const registrationsCol = collection(db, "eventsRegistration");
        const registrationQuery = query(
          registrationsCol,
          where("eventId", "==", eventIdFromURL)
        );
        const registrationSnapshot = await getDocs(registrationQuery);

        const checkedInCol = collection(db, "eventAttendance");
        const checkedInQuery = query(
          checkedInCol,
          where("eventId", "==", eventIdFromURL)
        );
        const checkedInSnapshot = await getDocs(checkedInQuery);

        const checkedInList = checkedInSnapshot.docs.map((doc) => ({
          docId: doc.id,
          ...(doc.data() as Omit<EventRegistration, "docId">),
        }));

        const registrationList: EventRegistration[] = registrationSnapshot.docs.map((doc) => {
          const regData = doc.data() as Omit<EventRegistration, "docId">;

          const checkedRecord = checkedInList.find(
            (check) =>
              check.email === regData.email && check.eventId === regData.eventId
          );

          return {
            docId: doc.id,
            ...regData,
            status: checkedRecord ? "Checked In" : "Not Checked In",
          };
        });

        setEventRegistrations(registrationList);

        await recordActivityLog({
          action: "Load Event Registrations",
          details: `Loaded ${registrationList.length} registrations for event ID: ${eventIdFromURL}`,
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
          category: "events",
        });
      } catch (error) {
        console.error("Error fetching registration data:", error);
        
        await recordActivityLog({
          action: "Load Registrations Error",
          details: `Failed to load registrations for event ID: ${eventIdFromURL}`,
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
          category: "events",
          severity: "medium",
        });
      }
    }

    fetchEventRegistrations();
  }, [eventIdFromURL, authUser]);

  const confirmCheckIn = async (registration: EventRegistration) => {
    setSelectedParticipant(registration);
    setShowModal(true);

    if (authUser) {
      await recordActivityLog({
        action: "View Check-In Modal",
        details: `Opened check-in confirmation for: ${registration.name}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });
    }
  };

  const handleCheckIn = async () => {
    if (!selectedParticipant || !authUser) return;

    try {
      if (selectedParticipant.status === "Checked In") {
        alert("Participant is already checked in.");
        setShowModal(false);
        return;
      }

      await updateDoc(doc(db, "eventsRegistration", selectedParticipant.docId), {
        status: "Checked In",
      });

      await addDoc(collection(db, "eventAttendance"), {
        ...selectedParticipant,
        status: "Checked In",
        checkInTime: new Date().toISOString(),
        checkedInBy: authUser.uid,
        checkedInByEmail: authUser.email,
      });

      setEventRegistrations((prev) =>
        prev.map((reg) =>
          reg.docId === selectedParticipant.docId
            ? { ...reg, status: "Checked In" }
            : reg
        )
      );

      await addDoc(collection(db, "notifications"), {
        userId: "all",
        type: "event",
        title: "Participant Checked In",
        body: `Participant "${selectedParticipant.name}" has been checked in for the event.`,
        createdAt: serverTimestamp(),
        read: false,
      });

      await recordActivityLog({
        action: "Check-In Participant",
        details: `Successfully checked in participant: ${selectedParticipant.name} (${selectedParticipant.email})`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });

      setShowModal(false);
      setSelectedParticipant(null);
    } catch (error) {
      console.error("Error checking in participant:", error);
      
      await recordActivityLog({
        action: "Check-In Error",
        details: `Failed to check in participant: ${selectedParticipant.name} - ${error}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
        severity: "medium",
      });
    }
  };

  const handleEditClick = async () => {
    if (selectedEvent && authUser) {
      setEditForm({ ...selectedEvent });
      setIsEditModalOpen(true);

      await recordActivityLog({
        action: "Open Edit Event Modal",
        details: `Opened edit modal for event: ${selectedEvent.title}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editForm) return;
    const { name, value } = e.target;
    setEditForm({ ...editForm, [name]: value });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && authUser) {
      setNewImageFile(e.target.files[0]);
      
      await recordActivityLog({
        action: "Select New Event Image",
        details: `Selected new image file: ${e.target.files[0].name}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    
    if (timeString.includes('AM') || timeString.includes('PM')) {
      return timeString;
    }
    
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleSave = async () => {
    if (!editForm || !authUser) return;

    try {
      let imageUrl = editForm.image;

      if (newImageFile) {
        const storageRef = ref(storage, `event-images/${Date.now()}_${newImageFile.name}`);
        await uploadBytes(storageRef, newImageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      const eventRef = doc(db, "events", editForm.id);
      const formattedTime = formatTime(editForm.eventTime);

      await updateDoc(eventRef, {
        title: editForm.title,
        description: editForm.description,
        date: editForm.date,
        eventTime: editForm.eventTime,
        time: formattedTime,
        location: editForm.location,
        image: imageUrl,
        capacity: editForm.capacity,
        deadline: editForm.deadline,
        tags: editForm.tags,
        updatedAt: serverTimestamp(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      });

      setSelectedEvent({ ...editForm, image: imageUrl });
      setIsEditModalOpen(false);
      setNewImageFile(null);

      await addDoc(collection(db, "notifications"), {
        userId: "all",
        type: "event",
        title: "Event Updated",
        body: `The event "${editForm.title}" has been updated. Check out the latest details!`,
        createdAt: serverTimestamp(),
        read: false,
      });

      await recordActivityLog({
        action: "Update Event",
        details: `Successfully updated event: ${editForm.title} (ID: ${editForm.id})${newImageFile ? ' with new image' : ''}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });

      alert("Event updated successfully!");
    } catch (error) {
      console.error("Error updating event:", error);
      
      await recordActivityLog({
        action: "Update Event Error",
        details: `Failed to update event: ${editForm.title} - ${error}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
        severity: "medium",
      });
      
      alert("Failed to update event. Please try again.");
    }
  };

  const handleCancelEdit = async () => {
    if (authUser) {
      await recordActivityLog({
        action: "Cancel Edit Event",
        details: `Cancelled editing event: ${editForm?.title}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: "events",
      });
    }
    setIsEditModalOpen(false);
    setNewImageFile(null);
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex flex-col gap-8 overflow-auto">
              {/* Header */}
        <header className="mb-0">
          <h1 className="text-3xl font-bold text-[#08326A]">Community Events</h1>
          <p className="text-lg text-gray-600 mt-2">
            The hub that connects kabataan with events and activities led by the SK Federation.
          </p>
        </header>
      <Navbar />

      {loadingEvent && (
        <div className="flex justify-center items-center py-20">
          <p className="text-xl text-gray-600">Loading event details...</p>
        </div>
      )}

      {eventError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{eventError}</p>
        </div>
      )}

      {selectedEvent && !loadingEvent && !eventError && (
        <div className="bg-white rounded-xl p-6 mb-1 shadow w-full">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-[500px] sm:h-[350px] relative">
              <Image
                src={selectedEvent.image}
                alt={selectedEvent.title}
                fill
                className="rounded-lg object-cover"
              />
            </div>
            <div className="flex flex-col justify-between w-full">
              <div>
                <h2 className="text-2xl font-bold text-[#1167B1]">
                  {selectedEvent.title}
                </h2>
                <p className="text-gray-700 mt-2">
                  {selectedEvent.description}
                </p>
                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Image
                      src="/CalendarIcon.svg"
                      alt="Calendar Icon"
                      width={20}
                      height={20}
                      className="mr-2"
                    />
                    <p>
                      <strong>
                        {new Date(selectedEvent.date).toLocaleDateString(
                          "en-US",
                          {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Image
                      src="/ClockIcon.svg"
                      alt="Clock Icon"
                      width={20}
                      height={20}
                      className="mr-2"
                    />
                    <p>
                      <strong>{formatTime(selectedEvent.eventTime) || selectedEvent.time}</strong>
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Image
                      src="/LocationIcon.svg"
                      alt="Location Icon"
                      width={20}
                      height={20}
                      className="mr-2"
                    />
                    <p>
                      <strong>{selectedEvent.location}</strong>
                    </p>
                  </div>
                  {selectedEvent.capacity && (
                    <div className="flex items-center">
                      <Image
                        src="/SlotIcon.png"
                        alt="Capacity Icon"
                        width={20}
                        height={20}
                        className="mr-2"
                      />
                      <p>
                        <strong>Capacity: {selectedEvent.capacity}</strong>
                      </p>
                    </div>
                  )}
                  {selectedEvent.deadline && (
                    <div className="flex items-center">
                      <Image
                        src="/DeadlineIcon.png"
                        alt="Deadline Icon"
                        width={20}
                        height={20}
                        className="mr-2"
                      />
                      <p>
                        <strong>Registration Deadline: {new Date(selectedEvent.deadline).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}</strong>
                      </p>
                    </div>
                  )}
                  {selectedEvent.tags && selectedEvent.tags.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Target Youth Classifications:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedEvent.tags.map((tag, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleEditClick}
                  className="bg-[#1167B1] text-white px-5 py-2 rounded-lg hover:bg-[#0a4c8c] transition"
                >
                  Edit Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && !loadingEvent && !eventError && (
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            Event Registrations ({eventRegistrations.length} total)
            {selectedEvent.capacity && (
              <span className="text-sm text-gray-600 ml-2">
                / {selectedEvent.capacity} capacity
              </span>
            )}
          </h3>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="bg-[#1167B1] text-white text-left">
                  <th className="px-4 py-2 w-[25%]">Name</th>
                  <th className="px-4 py-2 w-[25%]">Email</th>
                  <th className="px-4 py-2 w-[15%]">Phone</th>
                  <th className="px-4 py-2 w-[15%]">Barangay</th>
                  <th className="px-4 py-2 w-[20%]">Check-In</th>
                </tr>
              </thead>
              <tbody>
                {eventRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No registrations found for this event.
                    </td>
                  </tr>
                ) : (
                  eventRegistrations.map((registration) => (
                    <tr key={registration.docId} className="border-b">
                      <td className="px-4 py-3">{registration.name}</td>
                      <td className="px-4 py-3">{registration.email}</td>
                      <td className="px-4 py-3">{registration.phone}</td>
                      <td className="px-4 py-3">{registration.barangay}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => confirmCheckIn(registration)}
                          className={`px-3 py-1 rounded ${
                            registration.status === "Checked In"
                              ? "bg-green-500 text-white"
                              : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                          disabled={registration.status === "Checked In"}
                        >
                          {registration.status === "Checked In"
                            ? "Checked In"
                            : "Check-In"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && selectedParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-[400px]">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">
              Confirm Check-In
            </h2>
            <p className="mb-4">
              Are you sure you want to check in{" "}
              <strong>{selectedParticipant.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckIn}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editForm && (
        <div className="fixed inset-0 bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-5xl p-6 shadow-lg border-2 border-[#0A2F7A] relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-bold text-[#0A2F7A] mb-6 text-center mt-2">
              Edit Event
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col items-center justify-start">
                <label className="block text-[#0A2F7A] font-medium mb-2">
                  Current Image
                </label>
                <div className="border rounded-lg p-2 bg-white flex justify-center w-full h-[300px]">
                  <Image
                    src={newImageFile ? URL.createObjectURL(newImageFile) : editForm.image}
                    alt="Current Event"
                    width={500}
                    height={300}
                    className="object-contain rounded w-full h-full"
                  />
                </div>

                <div className="mt-3 w-full">
                  <label className="block text-[#0A2F7A] font-medium mb-1">
                    Choose New Picture (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full p-2 border rounded-lg bg-white"
                  />
                  {newImageFile && (
                    <p className="text-sm text-green-600 mt-1">
                      New image selected: {newImageFile.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[#0A2F7A] font-medium mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={editForm.title}
                    onChange={handleEditChange}
                    className="w-full p-2 border rounded-lg bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#0A2F7A] font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={editForm.description}
                    onChange={handleEditChange}
                    className="w-full p-2 border rounded-lg bg-white"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#0A2F7A] font-medium mb-1">
                      Event Date
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={editForm.date}
                      onChange={handleEditChange}
                      className="w-full p-2 border rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[#0A2F7A] font-medium mb-1">
                      Event Time
                    </label>
                    <input
                      type="time"
                      name="eventTime"
                      value={editForm.eventTime}
                      onChange={handleEditChange}
                      className="w-full p-2 border rounded-lg bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#0A2F7A] font-medium mb-1">
                      Registration Deadline
                    </label>
                    <input
                      type="date"
                      name="deadline"
                      value={editForm.deadline}
                      onChange={handleEditChange}
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#0A2F7A] font-medium mb-1">
                      Capacity
                    </label>
                    <input
                      type="number"
                      name="capacity"
                      value={editForm.capacity}
                      onChange={handleEditChange}
                      className="w-full p-2 border rounded-lg bg-white"
                      placeholder="e.g., 50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#0A2F7A] font-medium mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={editForm.location}
                    onChange={handleEditChange}
                    className="w-full p-2 border rounded-lg bg-white"
                    required
                  />
                </div>

                <div className="flex gap-4 mt-4">
                  <button
                    onClick={handleSave}
                    className="bg-[#1167B1] text-white px-6 py-2 rounded-lg hover:bg-[#0e5295] transition"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
        <p className="text-blue-600 text-lg font-semibold">Loading event...</p>
      </div>
    </div>
  );
}

// Main component with Suspense
export default function ManageEventPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<LoadingFallback />}>
        <ManageEventContent />
      </Suspense>
    </RequireAuth>
  );
}