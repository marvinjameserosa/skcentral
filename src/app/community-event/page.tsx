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
  status?: string;
}

const auth = getAuth();

// Format time from "HH:mm" to "h:mm AM/PM"
function formatTime(rawTime: string): string {
  if (!rawTime) return '';
  if (rawTime.includes('AM') || rawTime.includes('PM')) {
    return rawTime;
  }
  const [hours, minutes] = rawTime.split(':').map(Number);
  const dummyDate = new Date();
  dummyDate.setHours(hours, minutes, 0, 0);
  return dummyDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function CommunityEventPage() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventData[]>([]);
  const [filter, setFilter] = useState<'active' | 'past' | 'cancelled'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication and activity logging
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
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

  // Fetch events from single 'events' collection - only depends on user
  useEffect(() => {
    const fetchEvents = async () => {
      if (!user) return;
      try {
        setLoading(true);

        const eventsCollection = collection(db, 'events');
        
        let snapshot;
        try {
          const eventsQuery = query(eventsCollection, orderBy('createdAt', 'desc'));
          snapshot = await getDocs(eventsQuery);
        } catch (orderError) {
          console.log('Could not order by createdAt, fetching without ordering:', orderError);
          snapshot = await getDocs(eventsCollection);
        }

        const data: EventData[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            eventId: d.eventId || '',
            title: d.title || '',
            description: d.description || '',
            date: d.date || '',
            eventTime: d.eventTime || '',
            time: d.time || '',
            location: d.location || '',
            image: d.image || '/testpic.jpg',
            capacity: d.capacity || '',
            deadline: d.deadline || '',
            tags: d.tags || [],
            createdAt: d.createdAt || '',
            status: d.status || 'active',
          };
        });

        console.log(`Fetched ${data.length} events from events collection:`, data);
        setEvents(data);

        await recordActivityLog({
          action: 'Load Community Events',
          details: `Loaded ${data.length} events from events collection`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'events',
        });
      } catch (err) {
        console.error('Error fetching events:', err);
        setError('Failed to load events.');
        await recordActivityLog({
          action: 'Load Events Error',
          details: `Failed to load events: ${err}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'events',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [user]);

  // Apply filter based on status and date
  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset time for accurate date comparison
    let filtered: EventData[] = [];

    if (filter === 'active') {
      // Active: status is 'active' (case-insensitive) AND date is today or future
      filtered = events.filter((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const isActive = event.status?.toLowerCase() === 'active';
        const isFutureOrToday = eventDate >= now;
        return isActive && isFutureOrToday;
      });
    } else if (filter === 'past') {
      // Past: date is in the past AND status is not 'cancelled'
      filtered = events.filter((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const isPast = eventDate < now;
        const isNotCancelled = event.status?.toLowerCase() !== 'cancelled';
        return isPast && isNotCancelled;
      });
    } else if (filter === 'cancelled') {
      // Cancelled: status is 'cancelled' (case-insensitive)
      filtered = events.filter((event) => {
        return event.status?.toLowerCase() === 'cancelled';
      });
    }

    setFilteredEvents(filtered);
  }, [filter, events]);

  const handleFilterChange = (newFilter: 'active' | 'past' | 'cancelled') => {
    setFilter(newFilter);
  };

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

  // Show floating button only when there are events
  const showFloatingButton = events.length > 0;

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-8 bg-[#f4f8fc] overflow-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-[#08326A]">Community Events</h1>
          <p className="text-lg text-gray-600 mt-1">
            The hub that connects kabataan with events and activities led by the SK Federation.
          </p>
        </header>

        {/* Filter Tabs */}
        <div className="flex gap-4 mb-8">
          {['active', 'past', 'cancelled'].map((type) => (
            <button
              key={type}
              onClick={() => handleFilterChange(type as 'active' | 'past' | 'cancelled')}
              className={`px-5 py-2 rounded-lg font-semibold transition ${
                filter === type
                  ? 'bg-[#08326A] text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {type === 'active' && 'Active Events'}
              {type === 'past' && 'Past Events'}
              {type === 'cancelled' && 'Canceled Events'}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#08326A] mx-auto mb-4"></div>
              <p className="text-lg text-gray-600">Loading events...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p>{error}</p>
          </div>
        )}

        {/* Event List */}
        {!loading && !error && (
          <div className="flex flex-col gap-6 w-full items-center">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-20">
                <Image
                  src="/event.png"
                  alt="Events"
                  width={300}
                  height={300}
                  className="mx-auto mb-4 opacity-50"
                />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No {filter} events found</h3>
                <p className="text-gray-500 mb-6">
                  {filter === 'active' && 'Try switching to another filter or create a new event.'}
                  {filter === 'past' && 'No past events available yet.'}
                  {filter === 'cancelled' && 'No cancelled events found.'}
                </p>
                {filter === 'active' && (
                  <a
                    href="/community-event/CreateEvent"
                    onClick={handleCreateEventClick}
                    className="bg-[#08326A] text-white px-6 py-3 rounded-lg hover:bg-[#0a3f85] transition inline-block"
                  >
                    Create Event
                  </a>
                )}
              </div>
            ) : (
              filteredEvents.map((event) => {
                const displayTime = formatTime(event.eventTime) || event.time;
                const isPastDeadline = event.deadline ? new Date(event.deadline) < new Date() : false;

                return (
                  <div
                    key={event.id}
                    className={`relative flex flex-col md:flex-row bg-white p-6 rounded-2xl shadow-lg w-full max-w-5xl hover:shadow-xl transition ${
                      filter === 'past' ? 'opacity-75 bg-gray-50' : ''
                    } ${
                      filter === 'cancelled' ? 'opacity-75 bg-red-50' : ''
                    }`}
                  >
                    {/* Status Badge */}
                    {filter === 'past' && (
                      <div className="absolute top-4 right-4 bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Past Event
                      </div>
                    )}
                    {filter === 'cancelled' && (
                      <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Cancelled
                      </div>
                    )}
                    {isPastDeadline && filter === 'active' && (
                      <div className="absolute top-4 right-4 bg-yellow-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Registration Closed
                      </div>
                    )}

                    {/* Image */}
                    <div className="w-full md:w-72 h-65 rounded-xl overflow-hidden flex-shrink-0 mb-4 md:mb-0 md:mr-6">
                      <Image
                        src={event.image}
                        alt={event.title}
                        width={288}
                        height={192}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
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

                        {event.deadline ? (
                          new Date(event.deadline) <= new Date(event.date) ? (
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
                          ) : (
                            <div className="mt-2">
                              <p className="text-xs text-red-600 font-medium">
                                Invalid registration deadline. It cannot be after the event date.
                              </p>
                            </div>
                          )
                        ) : null}
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

        {/* Floating Button - Only show when there are events */}
        {showFloatingButton && (
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
        )}
      </div>

      <Navbar />
    </RequireAuth>
  );
}