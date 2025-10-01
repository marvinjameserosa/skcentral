'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/app/Firebase/firebase";
import { getAuth, User } from "firebase/auth";

interface EventData {
  id: string;
  eventId: string;
  title: string;
  description: string;
  date: string;
  eventTime: string;
  time: string;
  location: string;
  image: string;
  capacity?: string;
  deadline?: string;
  tags?: string[];
  createdAt: string;
}

const auth = getAuth();

// ✅ Format Firestore date into readable parts
function formatDate(firestoreDate: string): { date: string; year: string } {
  const dateObj = new Date(`${firestoreDate}T00:00:00`);
  return {
    year: dateObj.getFullYear().toString(),
    date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

// ✅ Format time from "HH:mm" to "h:mm AM/PM"
function formatTime(rawTime: string): string {
  if (!rawTime) return '';
  
  // If it's already in 12-hour format (contains AM/PM), return as is
  if (rawTime.includes('AM') || rawTime.includes('PM')) {
    return rawTime;
  }
  
  // If it's in 24-hour format (HH:mm), convert to 12-hour format
  const [hours, minutes] = rawTime.split(':').map(Number);
  const dummyDate = new Date();
  dummyDate.setHours(hours, minutes, 0, 0);

  return dummyDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Function to add a notification for all users

// Example usage: Notify users about a new event

// Handle event update

export default function CommunityEventPage() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication and activity logging - INTEGRATED (NO NOTIFICATION)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Community Events page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user",
          });
          console.log('✅ Page visit logged for Community Events page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch events from Firestore
  useEffect(() => {
    const fetchEvents = async () => {
      if (!user) return; // Wait for user authentication

      try {
        setLoading(true);
        const eventsCollection = collection(db, 'events');
        const eventsQuery = query(eventsCollection, orderBy('createdAt', 'desc'));
        const eventsSnapshot = await getDocs(eventsQuery);
        
        const eventsData: EventData[] = eventsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            eventId: data.eventId || '',
            title: data.title || '',
            description: data.description || '',
            date: data.date || '',
            eventTime: data.eventTime || '',
            time: data.time || '',
            location: data.location || '',
            image: data.image || '/testpic.jpg',
            capacity: data.capacity || '',
            deadline: data.deadline || '',
            tags: data.tags || [],
            createdAt: data.createdAt || '',
          };
        });

        setEvents(eventsData);

        // Log successful events fetch
        await recordActivityLog({
          action: 'Load Community Events',
          details: `Successfully loaded ${eventsData.length} community events`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'events',
        });

      } catch (err) {
        console.error('Error fetching events:', err);
        setError('Failed to load events. Please try again.');

        // Log error
        await recordActivityLog({
          action: 'Load Events Error',
          details: `Failed to load community events: ${err}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'events',
          severity: 'medium',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [user]);

  const handleManageEventClick = async (eventId: string, eventTitle: string) => {
    if (user) {
      await recordActivityLog({
        action: 'Navigate to Manage Event',
        details: `Clicked manage event for: ${eventTitle} (ID: ${eventId})`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'events',
      });
    }
  };

  const handleCreateEventClick = async () => {
    if (user) {
      await recordActivityLog({
        action: 'Navigate to Create Event',
        details: 'Clicked create event button',
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'events',
      });
    }
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-8 bg-[#f4f8fc] overflow-auto">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-[#08326A]">Community Events</h1>
          <p className="text-lg text-gray-600 mt-2">
            The hub that connects kabataan with events and activities led by the SK Federation.
          </p>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#08326A] mx-auto mb-4"></div>
              <p className="text-lg text-gray-600">Loading events...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p>{error}</p>
          </div>
        )}

        {/* Events List */}
        {!loading && !error && (
          <div className="flex flex-col gap-6 w-full items-center">
            {events.length === 0 ? (
              <div className="text-center py-20">
                <Image
                  src="/no-events.svg"
                  alt="No Events"
                  width={200}
                  height={200}
                  className="mx-auto mb-4 opacity-50"
                />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No Events Found</h3>
                <p className="text-gray-500 mb-6">There are currently no community events available.</p>
                <a
                  href="/community-event/CreateEvent"
                  onClick={handleCreateEventClick}
                  className="bg-[#08326A] text-white px-6 py-3 rounded-lg hover:bg-[#0a3f85] transition inline-block"
                >
                  Create Your First Event
                </a>
              </div>
            ) : (
              events.map((event) => {
                formatDate(event.date);
                const displayTime = formatTime(event.eventTime) || event.time;
                const isUpcoming = new Date(event.date) >= new Date();
                const isPastDeadline = event.deadline ? new Date(event.deadline) < new Date() : false;

                return (
                  <div
                    key={event.id}
                    className={`relative flex flex-col md:flex-row bg-white p-6 rounded-2xl shadow-lg w-full max-w-5xl hover:shadow-xl transition ${
                      !isUpcoming ? 'opacity-75 bg-gray-50' : ''
                    }`}
                  >
                    {/* Event Status Badge */}
                    {!isUpcoming && (
                      <div className="absolute top-4 right-4 bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Past Event
                      </div>
                    )}
                    {isPastDeadline && isUpcoming && (
                      <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Registration Closed
                      </div>
                    )}

                    {/* Event Image */}
                    <div className="w-full md:w-72 h-65 rounded-xl overflow-hidden flex-shrink-0 mb-4 md:mb-0 md:mr-6">
                      <Image
                        src={event.image}
                        alt={event.title}
                        width={288}
                        height={192}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Event Info */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-[#08326A]">{event.title}</h2>
                        <p className="text-gray-700 mt-2 line-clamp-3">{event.description}</p>

                        <div className="flex flex-wrap gap-3 mt-4 text-sm">
                          <span className="flex items-center gap-2 bg-blue-50 text-[#08326A] px-3 py-1 rounded-full">
                            <Image src="/CalendarIcon.svg" alt="Date" width={18} height={18} />
                            {new Date(event.date).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full">
                            <Image src="/ClockIcon.svg" alt="Time" width={18} height={18} />
                            {displayTime}
                          </span>
                          <span className="flex items-center gap-2 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full">
                            <Image src="/LocationIcon.svg" alt="Location" width={18} height={18} />
                            {event.location}
                          </span>
                          {event.capacity && (
                            <span className="flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
                              <Image src="/SlotIcon.png" alt="Capacity" width={18} height={18} />
                              {event.capacity} slots
                            </span>
                          )}
                        </div>

                        {/* Youth Classifications Tags */}
                        {event.tags && event.tags.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-600 mb-2">Target Youth Classifications:</p>
                            <div className="flex flex-wrap gap-1">
                              {event.tags.slice(0, 3).map((tag, index) => (
                                <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                                  {tag}
                                </span>
                              ))}
                              {event.tags.length > 3 && (
                                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                                  +{event.tags.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Registration Deadline */}
                        {event.deadline && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-600">
                              Registration Deadline:{' '}
                              <span className={isPastDeadline ? 'text-red-600 font-medium' : 'text-gray-800'}>
                                {new Date(event.deadline).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-6">
                        <a 
                          href={`/community-event/ManageEvent?id=${event.id}`}
                          onClick={() => handleManageEventClick(event.id, event.title)}
                        >
                          <button className="bg-[#08326A] text-white px-6 py-2 rounded-lg hover:bg-[#0a3f85] transition">
                            Manage Event →
                          </button>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Floating Button */}
        <div className="fixed bottom-8 right-8">
          <a
            href="/community-event/CreateEvent"
            onClick={handleCreateEventClick}
            aria-label="Create Event"
            className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-[#08326A] text-white rounded-full shadow-2xl border-4 border-white hover:bg-[#0a3f85] transition"
          >
            <Image src="/NewEvent.svg" alt="Create Event" width={32} height={32} />
          </a>
        </div>
      </div>

      <Navbar />
    </RequireAuth>
  );
}
